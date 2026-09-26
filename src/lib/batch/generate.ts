import type { Extraction, LineItem, Outcome, POLine, PurchaseOrder, ReasonCode, Receipt, Vendor } from "@/lib/types";
import { VENDORS } from "@/data/vendors";
import { round2 } from "@/lib/util/text";

/**
 * Seeded generator for the rules stress test.
 *
 * It builds a month of invoices against a freshly generated set of purchase orders, and plants
 * problems at random. Every invoice carries the answer the AP policy expects (the answer key), which the
 * engine never sees. Invoice data is produced directly, so no PDF is read and no AI is called:
 * this tests the decision logic, not document reading.
 *
 * Some cases are deliberately hard for the rules (recurring same-amount charges, misspelled vendor
 * names), so a perfect score is not guaranteed and misses are real.
 */

// ---------------------------------------------------------------- deterministic randomness

export function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}
type Rng = ReturnType<typeof prng>;

export const newSeed = () => Math.floor(Math.random() * 900000) + 100000;

// ---------------------------------------------------------------- the planted cases

export type CaseKind =
  | "clean"
  | "clean_tax_inclusive"
  | "split_first"
  | "split_completes"
  | "split_overrun"
  | "price_drift_ok"
  | "price_variance"
  | "duplicate_renumbered"
  | "duplicate_same_file"
  | "bank_changed"
  | "lookalike_sender"
  | "missing_fields"
  | "unknown_vendor"
  | "blocked_vendor"
  | "not_an_invoice"
  | "po_inferred"
  | "po_ambiguous"
  | "arithmetic"
  | "qty_over_received"
  | "low_confidence"
  | "future_dated"
  | "recurring_legit"
  | "vendor_name_variant";

export const CASE_INFO: Record<CaseKind, { label: string; expected: Outcome; reason: ReasonCode | null; hard?: boolean }> = {
  clean: { label: "Clean invoice", expected: "APPROVE", reason: null },
  clean_tax_inclusive: { label: "Clean, tax inside the total", expected: "APPROVE", reason: null },
  split_first: { label: "Split billing, first part", expected: "APPROVE", reason: null },
  split_completes: { label: "Split billing, completes the PO exactly", expected: "APPROVE", reason: null },
  split_overrun: { label: "Split billing pushes the PO over its value", expected: "HOLD", reason: "PO_OVERBILLED" },
  price_drift_ok: { label: "Small price drift inside tolerance", expected: "APPROVE", reason: null },
  price_variance: { label: "Unit price well above the PO", expected: "HOLD", reason: "PRICE_VARIANCE" },
  duplicate_renumbered: { label: "Duplicate resubmitted with a reformatted number", expected: "REJECT", reason: "DUPLICATE_INVOICE" },
  duplicate_same_file: { label: "Exact same file sent twice", expected: "REJECT", reason: "DUPLICATE_FILE" },
  bank_changed: { label: "Remit-to bank account changed", expected: "BLOCK", reason: "BANK_DETAILS_CHANGED" },
  lookalike_sender: { label: "Sent from a look-alike domain", expected: "BLOCK", reason: "SENDER_LOOKALIKE_DOMAIN" },
  missing_fields: { label: "Invoice number or total missing", expected: "HOLD", reason: "MISSING_FIELDS" },
  unknown_vendor: { label: "Vendor not in the master", expected: "HOLD", reason: "VENDOR_UNKNOWN" },
  blocked_vendor: { label: "Vendor on the blocked list", expected: "BLOCK", reason: "VENDOR_BLOCKED" },
  not_an_invoice: { label: "A quote, not an invoice", expected: "REJECT", reason: "NOT_AN_INVOICE" },
  po_inferred: { label: "No PO number, one PO clearly fits", expected: "APPROVE", reason: null },
  po_ambiguous: { label: "No PO number, two POs fit equally", expected: "HOLD", reason: "PO_AMBIGUOUS" },
  arithmetic: { label: "Totals don't add up", expected: "HOLD", reason: "ARITHMETIC_MISMATCH" },
  qty_over_received: { label: "Billed more than the warehouse received", expected: "HOLD", reason: "QTY_EXCEEDS_RECEIVED" },
  low_confidence: { label: "A critical field is barely legible", expected: "HOLD", reason: "LOW_CONFIDENCE" },
  future_dated: { label: "Dated in the future", expected: "HOLD", reason: "DATE_ANOMALY" },
  recurring_legit: { label: "Legit weekly charge, same amount as last week", expected: "APPROVE", reason: null, hard: true },
  vendor_name_variant: { label: "Known vendor, name misspelled", expected: "APPROVE", reason: null, hard: true },
};

/** Share of each case in a batch. Roughly: 55% clean-ish, 45% with a planted problem or trap. */
const WEIGHTS: [CaseKind, number][] = [
  ["clean", 26],
  ["clean_tax_inclusive", 5],
  ["split_overrun", 5],
  ["split_first", 3],
  ["split_completes", 3],
  ["price_drift_ok", 5],
  ["price_variance", 5],
  ["duplicate_renumbered", 5],
  ["duplicate_same_file", 2],
  ["bank_changed", 4],
  ["lookalike_sender", 3],
  ["missing_fields", 4],
  ["unknown_vendor", 3],
  ["blocked_vendor", 2],
  ["not_an_invoice", 2],
  ["po_inferred", 3],
  ["po_ambiguous", 2],
  ["arithmetic", 2],
  ["qty_over_received", 3],
  ["low_confidence", 3],
  ["future_dated", 2],
  ["recurring_legit", 3],
  ["vendor_name_variant", 4],
];

// ---------------------------------------------------------------- vendor catalogues

type Item = { sku: string; description: string; price: [number, number]; qty: [number, number] };
interface Profile {
  vendorId: string;
  prefix: string;
  taxRate: number;
  services: boolean; // services have no goods receipts
  items: Item[];
  misspellings: string[];
}

const PROFILES: Profile[] = [
  {
    vendorId: "V-CORTEX", prefix: "INV-", taxRate: 8.5, services: false,
    misspellings: ["Cortex Industrial Suply", "CORTEX INDUSTRIAL SUPPLY INC", "Cortex Industrial Supply Co"],
    items: [
      { sku: "CX-4410", description: "Stainless steel bearings, 40mm", price: [17, 20], qty: [80, 300] },
      { sku: "CX-2201", description: "Industrial lubricant, 5L", price: [38, 46], qty: [10, 60] },
      { sku: "CX-7800", description: "Conveyor belt assembly, 2m", price: [1300, 1600], qty: [1, 6] },
      { sku: "CX-3120", description: "Hydraulic hose, 3/4in x 10ft", price: [62, 80], qty: [10, 40] },
    ],
  },
  {
    vendorId: "V-BRIGHTLINE", prefix: "BLP-", taxRate: 7, services: false,
    misspellings: ["Brightline Packing LLC", "BRIGHT LINE PACKAGING", "Brightline Packaging L.L.C."],
    items: [
      { sku: "BL-100", description: "Corrugated shipping box, 18x12x10", price: [1.1, 1.4], qty: [1000, 6000] },
      { sku: "BL-220", description: "Packing tape, 48mm x 100m", price: [2.9, 3.4], qty: [100, 400] },
      { sku: "BL-305", description: "Stretch wrap roll, 18in", price: [21, 26], qty: [20, 80] },
    ],
  },
  {
    vendorId: "V-SUMMIT", prefix: "SFL-", taxRate: 0, services: true,
    misspellings: ["Summit Freight and Logistic", "SUMMIT FREIGHT & LOGISTICS INC", "Summit Frieght & Logistics"],
    items: [
      { sku: "SF-FTL", description: "Full truckload, Chicago to Columbus", price: [1400, 1650], qty: [4, 20] },
      { sku: "SF-LTL", description: "LTL consolidation, regional", price: [220, 280], qty: [8, 40] },
    ],
  },
  {
    vendorId: "V-GREENLEAF", prefix: "GP-", taxRate: 5, services: false,
    misspellings: ["Green Leaf Produce Co", "Greenleaf Produce Company Inc", "Greenleaf Produse Co."],
    items: [
      { sku: "GL-TOM", description: "Roma tomatoes, 25lb case", price: [22, 26], qty: [40, 140] },
      { sku: "GL-LET", description: "Romaine lettuce, 24ct case", price: [29, 34], qty: [30, 90] },
      { sku: "GL-ONI", description: "Yellow onions, 50lb sack", price: [29, 34], qty: [30, 90] },
    ],
  },
  {
    vendorId: "V-NORDEN", prefix: "NL-", taxRate: 6.25, services: false,
    misspellings: ["Norden Labs Instruments", "NORDEN LAB INSTRUMENTS AB", "Nordan Lab Instruments"],
    items: [
      { sku: "NL-PIP", description: "Digital pipette set, 8-channel", price: [360, 410], qty: [2, 12] },
      { sku: "NL-TIP", description: "Filter pipette tips, 960 pack", price: [48, 60], qty: [5, 30] },
    ],
  },
  {
    vendorId: "V-APEX", prefix: "AP-", taxRate: 8, services: false,
    misspellings: ["Apex Office Solution", "APEX OFFICE SOLUTIONS INCORPORATED", "Apex Ofice Solutions"],
    items: [
      { sku: "AP-CH12", description: "Ergonomic task chair", price: [290, 330], qty: [4, 20] },
      { sku: "AP-DSK", description: "Sit-stand desk, 60in", price: [510, 560], qty: [2, 10] },
    ],
  },
];

const UNKNOWN_VENDORS = ["Keystone Fastener Works", "Orion Coldchain Ltd", "Pinecrest Janitorial", "Bluewater Pumps Inc", "Harlow Signage Co"];

const LOOKALIKE: Record<string, string> = {
  "cortex-supply.com": "c0rtex-supply.com",
  "brightlinepack.com": "brightlinepak.com",
  "summitfreight.com": "summitfreight.co",
  "greenleafproduce.com": "greenleafproduce-billing.com",
  "nordenlab.com": "norden1ab.com",
  "apexoffice.com": "apex0ffice.com",
};

// ---------------------------------------------------------------- output shape

export interface BatchInvoice {
  id: string;
  seq: number;
  kind: CaseKind;
  expected: Outcome;
  expectedReason: ReasonCode | null;
  plantedNote: string; // what exactly was planted, in plain English
  extraction: Extraction;
  fileHash: string;
  senderEmail: string | null;
}

export interface BatchWorld {
  seed: number;
  vendors: Vendor[];
  pos: PurchaseOrder[];
  receipts: Receipt[];
  invoices: BatchInvoice[];
}

// ---------------------------------------------------------------- helpers

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const conf = (v: number): Extraction["confidence"] => ({
  vendorName: v, invoiceNumber: v, invoiceDate: v, dueDate: v, poReference: v, currency: v, subtotal: v, taxAmount: v, total: v, bankAccountNumber: v,
});
const vendorById = (id: string) => VENDORS.find((v) => v.id === id)!;
const sumLines = (ls: LineItem[]) => round2(ls.reduce((a, l) => a + (l.amount ?? 0), 0));

function makePoLines(r: Rng, p: Profile, count: number): POLine[] {
  // Fisher–Yates on the seeded generator: a random sort comparator depends on the engine's sort
  // internals, so Node and the browser would build different months from the same seed.
  const items = [...p.items];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  items.length = Math.min(count, items.length);
  return items.map((it) => ({
    sku: it.sku,
    description: it.description,
    qty: r.int(it.qty[0], it.qty[1]),
    unitPrice: round2(it.price[0] + r.next() * (it.price[1] - it.price[0])),
  }));
}

// ---------------------------------------------------------------- the generator

export function generateBatch(seed: number, n = 100, today = new Date()): BatchWorld {
  const r = prng(seed);
  const pos: PurchaseOrder[] = [];
  const receipts: Receipt[] = [];
  const invoices: BatchInvoice[] = [];
  let poCounter = 3000 + r.int(0, 800);
  let grn = 7000;
  const numbers = new Map<string, number>(PROFILES.map((p) => [p.vendorId, r.int(1000, 8000)]));
  const nextNumber = (p: Profile) => {
    const v = (numbers.get(p.vendorId) ?? 1000) + r.int(1, 9);
    numbers.set(p.vendorId, v);
    return p.prefix === "INV-" ? `INV-${String(v).padStart(5, "0")}` : `${p.prefix}${v}`;
  };
  const start = addDays(today, -30);
  const dateFor = (seq: number) => iso(addDays(start, Math.floor((seq / n) * 28)));

  const newPo = (p: Profile, lines: POLine[], issued: string): PurchaseOrder => {
    const po: PurchaseOrder = {
      id: `PO-${++poCounter}`,
      vendorId: p.vendorId,
      issuedOn: issued,
      currency: "USD",
      status: "open",
      description: lines.map((l) => l.description.split(",")[0]).join(" + "),
      lines,
      total: round2(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0)),
    };
    pos.push(po);
    if (!p.services) receipts.push({ id: `GRN-${++grn}`, poId: po.id, receivedOn: issued, lines: lines.map((l) => ({ sku: l.sku, qtyReceived: l.qty })) });
    return po;
  };

  function baseInvoice(p: Profile, lines: LineItem[], poRef: string | null, seq: number, opts: { inclusive?: boolean } = {}): Extraction {
    const v = vendorById(p.vendorId);
    const net = sumLines(lines);
    const tax = round2((net * p.taxRate) / 100);
    const date = dateFor(seq);
    return {
      docType: "invoice",
      vendorName: v.name,
      vendorAddress: null,
      vendorTaxId: v.taxId,
      invoiceNumber: nextNumber(p),
      invoiceDate: date,
      dueDate: iso(addDays(new Date(date + "T00:00:00Z"), v.paymentTermsDays)),
      poReference: poRef,
      currency: "USD",
      lineItems: opts.inclusive ? lines.map((l) => ({ ...l, unitPrice: l.unitPrice != null ? round2(l.unitPrice * (1 + p.taxRate / 100)) : null, amount: l.amount != null ? round2(l.amount * (1 + p.taxRate / 100)) : null })) : lines,
      subtotal: opts.inclusive ? null : net,
      taxAmount: tax,
      taxRate: p.taxRate,
      taxInclusive: !!opts.inclusive,
      total: round2(net + tax),
      bankName: r.chance(0.6) ? v.bank.bankName : null,
      bankAccountNumber: null,
      bankRoutingNumber: null,
      isScanned: false,
      confidence: conf(round2(0.93 + r.next() * 0.06)),
      evidence: {},
      notes: null,
    };
  }
  const withBank = (e: Extraction, p: Profile): Extraction => {
    const v = vendorById(p.vendorId);
    return e.bankName ? { ...e, bankAccountNumber: v.bank.accountNumber, bankRoutingNumber: v.bank.routingNumber } : e;
  };
  const linesFromPo = (po: PurchaseOrder, share = 1): LineItem[] =>
    po.lines.map((l) => {
      const qty = Math.max(1, Math.round(l.qty * share));
      return { description: l.description, sku: l.sku, qty, unitPrice: l.unitPrice, amount: round2(qty * l.unitPrice) };
    });
  const sender = (p: Profile) => (r.chance(0.8) ? `${r.pick(["ap", "billing", "invoices", "accounts"])}@${vendorById(p.vendorId).emailDomain}` : null);

  // Case plan: weighted draw, then force the history-dependent cases to have something earlier to refer to.
  const bag: CaseKind[] = [];
  for (const [k, w] of WEIGHTS) for (let i = 0; i < w; i++) bag.push(k);
  const plan: CaseKind[] = Array.from({ length: n }, () => r.pick(bag));
  plan[0] = "clean";
  plan[1] = "clean";

  let hashCounter = 0;
  const hash = () => `seed${seed}-${(++hashCounter).toString(16).padStart(6, "0")}`;
  const approvedSoFar: BatchInvoice[] = [];
  const openSplits: { po: PurchaseOrder; p: Profile; billedShare: number; firstQty: number }[] = [];
  const recurring: { p: Profile; lines: LineItem[]; seq: number }[] = [];

  const push = (seq: number, kind: CaseKind, e: Extraction, senderEmail: string | null, note: string, fileHash = hash()) => {
    const info = CASE_INFO[kind];
    const inv: BatchInvoice = { id: `B-${String(seq + 1).padStart(3, "0")}`, seq, kind, expected: info.expected, expectedReason: info.reason, plantedNote: note, extraction: e, fileHash, senderEmail };
    invoices.push(inv);
    if (info.expected === "APPROVE") approvedSoFar.push(inv);
  };

  for (let seq = 0; seq < n; seq++) {
    let kind = plan[seq];
    // Cases that need a predecessor fall back to one that creates it.
    if ((kind === "duplicate_renumbered" || kind === "duplicate_same_file") && !approvedSoFar.some((a) => a.kind === "clean")) kind = "clean";
    if ((kind === "split_overrun" || kind === "split_completes") && !openSplits.length) kind = "split_first";
    if (kind === "recurring_legit" && !recurring.length) kind = "clean";

    const p = r.pick(PROFILES);
    const issued = iso(addDays(start, -r.int(3, 20)));

    switch (kind) {
      case "clean":
      case "clean_tax_inclusive": {
        const prof = kind === "clean_tax_inclusive" ? PROFILES.find((x) => x.taxRate > 0 && x.vendorId === "V-GREENLEAF")! : p;
        const po = newPo(prof, makePoLines(r, prof, r.int(1, 2)), issued);
        const e = withBank(baseInvoice(prof, linesFromPo(po), po.id, seq, { inclusive: kind === "clean_tax_inclusive" }), prof);
        push(seq, kind, e, sender(prof), kind === "clean" ? `Bills ${po.id} in full at PO prices.` : `Bills ${po.id} in full; tax is included in the line prices.`);
        if (prof.services && r.chance(0.5)) recurring.push({ p: prof, lines: linesFromPo(po), seq });
        break;
      }
      case "split_first": {
        const po = newPo(p, makePoLines(r, p, 1).map((l) => ({ ...l, qty: Math.max(l.qty, 6) })), issued);
        po.total = round2(po.lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
        const rc = receipts.find((x) => x.poId === po.id);
        if (rc) rc.lines = po.lines.map((l) => ({ sku: l.sku, qtyReceived: l.qty }));
        const share = 0.55 + r.next() * 0.15;
        const firstLines = linesFromPo(po, share);
        const e = withBank(baseInvoice(p, firstLines, po.id, seq), p);
        push(seq, kind, e, sender(p), `First instalment against ${po.id} (~${Math.round(share * 100)}% of it).`);
        openSplits.push({ po, p: p, billedShare: share, firstQty: firstLines[0].qty ?? 0 });
        break;
      }
      case "split_overrun": {
        const s = openSplits.splice(r.int(0, openSplits.length - 1), 1)[0];
        const share = 1 - s.billedShare + 0.12 + r.next() * 0.1; // takes the PO to ~112–122%
        // On small quantities rounding can land exactly on the PO, so guarantee a real overrun of at least 12%.
        const poQty = s.po.lines[0].qty;
        const minQty = poQty - s.firstQty + Math.max(1, Math.ceil(poQty * 0.12));
        const lines = linesFromPo(s.po, share).map((l, i) => (i === 0 && (l.qty ?? 0) < minQty ? { ...l, qty: minQty, amount: round2(minQty * (l.unitPrice ?? 0)) } : l));
        const over = Math.round(((s.firstQty + (lines[0].qty ?? 0) - poQty) / poQty) * 100);
        const e = withBank(baseInvoice(s.p, lines, s.po.id, seq), s.p);
        push(seq, kind, e, sender(s.p), `Second instalment on ${s.po.id}; together they exceed the PO by roughly ${over}%.`);
        break;
      }
      case "price_drift_ok":
      case "price_variance": {
        const po = newPo(p, makePoLines(r, p, 1).map((l) => ({ ...l, qty: Math.min(l.qty, 400) })), issued);
        po.total = round2(po.lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
        const rc = receipts.find((x) => x.poId === po.id);
        if (rc) rc.lines = po.lines.map((l) => ({ sku: l.sku, qtyReceived: l.qty }));
        const lines = linesFromPo(po);
        const net = sumLines(lines);
        // tolerance = min(2% of net, $50); drift stays well inside it, variance well outside it
        const tol = Math.min(net * 0.02, 50);
        const target = kind === "price_drift_ok" ? tol * (0.3 + r.next() * 0.4) : Math.max(tol * 2.5, 120);
        const l = lines[0];
        const bump = kind === "price_drift_ok" ? Math.max(0.01, Math.floor((target / (l.qty ?? 1)) * 100) / 100) : round2(Math.max(0.01, target / (l.qty ?? 1)));
        lines[0] = { ...l, unitPrice: round2((l.unitPrice ?? 0) + bump), amount: round2((l.qty ?? 1) * ((l.unitPrice ?? 0) + bump)) };
        const e = withBank(baseInvoice(p, lines, po.id, seq), p);
        push(seq, kind, e, sender(p), `${l.sku} billed $${bump.toFixed(2)} a unit over the PO price (${kind === "price_drift_ok" ? "inside" : "outside"} tolerance).`);
        break;
      }
      case "duplicate_renumbered": {
        const src = r.pick(approvedSoFar.filter((a) => a.kind === "clean"));
        const num = src.extraction.invoiceNumber ?? "";
        const digits = num.replace(/\D/g, "").replace(/^0+/, "");
        const letters = num.replace(/[^A-Za-z]/g, "");
        const variant = r.pick([`${letters} ${digits}`, `${letters.toLowerCase()}${digits.padStart(6, "0")}`, `#${digits}`, `${letters}/${digits}`]);
        const e = { ...src.extraction, invoiceNumber: variant, invoiceDate: dateFor(seq) };
        push(seq, kind, e, src.senderEmail, `Resubmits ${src.id} as "${variant}" with a new date and a new file.`);
        break;
      }
      case "duplicate_same_file": {
        const src = r.pick(approvedSoFar.filter((a) => a.kind === "clean"));
        push(seq, kind, { ...src.extraction }, src.senderEmail, `The exact file of ${src.id}, sent again.`, src.fileHash);
        break;
      }
      case "bank_changed": {
        const po = newPo(p, makePoLines(r, p, 1), issued);
        const e = { ...baseInvoice(p, linesFromPo(po), po.id, seq), bankName: "First Harbor Bank", bankAccountNumber: `${r.int(1000, 9999)} ${r.int(1000, 9999)} ${r.int(1000, 9999)}`, bankRoutingNumber: "026013673", notes: "Please note our new banking details." };
        push(seq, kind, e, sender(p), `Real vendor and PO, but asks for payment to a new account at First Harbor Bank.`);
        break;
      }
      case "lookalike_sender": {
        const po = newPo(p, makePoLines(r, p, 1), issued);
        const e = withBank(baseInvoice(p, linesFromPo(po), po.id, seq), p);
        const fake = LOOKALIKE[vendorById(p.vendorId).emailDomain];
        push(seq, kind, e, `billing@${fake}`, `Everything matches, but it came from ${fake}.`);
        break;
      }
      case "missing_fields": {
        const po = newPo(p, makePoLines(r, p, 1), issued);
        const base = withBank(baseInvoice(p, linesFromPo(po), po.id, seq), p);
        const drop = r.pick(["number", "total", "both"] as const);
        const e = { ...base, invoiceNumber: drop !== "total" ? null : base.invoiceNumber, total: drop !== "number" ? null : base.total, subtotal: drop !== "number" ? null : base.subtotal, taxAmount: drop !== "number" ? null : base.taxAmount };
        push(seq, kind, e, sender(p), `No ${drop === "both" ? "invoice number or total" : drop === "number" ? "invoice number" : "total"} on the document.`);
        break;
      }
      case "unknown_vendor": {
        const name = r.pick(UNKNOWN_VENDORS);
        const lines: LineItem[] = [{ description: "Maintenance services, September", sku: null, qty: 1, unitPrice: r.int(800, 4000), amount: null }];
        lines[0].amount = lines[0].unitPrice;
        const base = baseInvoice(p, lines, null, seq);
        const e = { ...base, vendorName: name, vendorTaxId: null, bankName: "Metro Commerce Bank", bankAccountNumber: `${r.int(1000, 9999)} ${r.int(1000, 9999)}` };
        push(seq, kind, e, `invoices@${name.toLowerCase().replace(/[^a-z]+/g, "")}.com`, `${name} has never been onboarded.`);
        break;
      }
      case "blocked_vendor": {
        const v = vendorById("V-VANTAGE");
        const lines: LineItem[] = [{ description: "Industrial solvent, 55gal drum", sku: "VC-55", qty: r.int(2, 8), unitPrice: 640, amount: null }];
        lines[0].amount = round2((lines[0].qty ?? 1) * 640);
        const base = baseInvoice(p, lines, null, seq);
        const e = { ...base, vendorName: v.name, vendorTaxId: v.taxId, bankName: v.bank.bankName, bankAccountNumber: v.bank.accountNumber };
        push(seq, kind, e, `ar@${v.emailDomain}`, `${v.name} is on the blocked-vendor list.`);
        break;
      }
      case "not_an_invoice": {
        const po = newPo(p, makePoLines(r, p, 1), issued);
        const e = { ...baseInvoice(p, linesFromPo(po), null, seq), docType: r.pick(["quote", "statement"] as const) };
        push(seq, kind, e, sender(p), `A ${e.docType}, not an invoice.`);
        break;
      }
      case "po_inferred": {
        let lines = makePoLines(r, p, 1);
        const others = pos.filter((x) => x.vendorId === p.vendorId).map((x) => x.total);
        const amt = (ls: POLine[]) => ls.reduce((a, l) => a + l.qty * l.unitPrice, 0);
        for (let tries = 0; tries < 20 && others.some((o) => Math.abs(amt(lines) - o) / Math.max(o, 1) < 0.35); tries++) lines = makePoLines(r, p, 1);
        const po = newPo(p, lines, issued);
        const e = withBank(baseInvoice(p, linesFromPo(po), null, seq), p);
        push(seq, kind, e, sender(p), `No PO number; ${po.id} is the only open PO that fits.`);
        break;
      }
      case "po_ambiguous": {
        const lines = makePoLines(r, p, 1);
        const a = newPo(p, lines, issued);
        const twin = lines.map((l) => ({ ...l, qty: Math.max(1, Math.round(l.qty * (1 + (r.chance(0.5) ? 0.01 : -0.01)))) }));
        const b = newPo(p, twin, issued);
        const mid = linesFromPo(a).map((l, i) => {
          const q = Math.round(((a.lines[i].qty + b.lines[i].qty) / 2) * 1);
          return { ...l, qty: q, amount: round2(q * (l.unitPrice ?? 0)) };
        });
        const e = withBank(baseInvoice(p, mid, null, seq), p);
        push(seq, kind, e, sender(p), `No PO number; ${a.id} and ${b.id} fit almost equally.`);
        break;
      }
      case "arithmetic": {
        const po = newPo(p, makePoLines(r, p, 1), issued);
        const base = withBank(baseInvoice(p, linesFromPo(po), po.id, seq), p);
        const off = r.int(40, 400);
        push(seq, kind, { ...base, total: round2((base.total ?? 0) + off) }, sender(p), `Total is $${off} more than subtotal + tax.`);
        break;
      }
      case "qty_over_received": {
        const goods = PROFILES.filter((x) => !x.services);
        const gp = r.pick(goods);
        const po = newPo(gp, makePoLines(r, gp, 1), issued);
        const rec = receipts.find((x) => x.poId === po.id)!;
        const short = Math.min(po.lines[0].qty - 1, Math.max(1, Math.floor(po.lines[0].qty * (0.6 + r.next() * 0.2)))); // always fewer than billed
        rec.lines[0].qtyReceived = short;
        const e = withBank(baseInvoice(gp, linesFromPo(po), po.id, seq), gp);
        push(seq, kind, e, sender(gp), `Bills ${po.lines[0].qty} ${po.lines[0].sku}, but only ${short} were received.`);
        break;
      }
      case "low_confidence": {
        const po = newPo(p, makePoLines(r, p, 1), issued);
        const base = withBank(baseInvoice(p, linesFromPo(po), po.id, seq), p);
        const field = r.pick(["total", "invoiceNumber"] as const);
        push(seq, kind, { ...base, isScanned: true, confidence: { ...base.confidence, [field]: round2(0.45 + r.next() * 0.25) } }, sender(p), `A smudged scan: the ${field === "total" ? "total" : "invoice number"} was barely legible.`);
        break;
      }
      case "future_dated": {
        const po = newPo(p, makePoLines(r, p, 1), issued);
        const base = withBank(baseInvoice(p, linesFromPo(po), po.id, seq), p);
        push(seq, kind, { ...base, invoiceDate: iso(addDays(today, r.int(20, 90))) }, sender(p), `Dated weeks in the future (a typo, or pre-billing).`);
        break;
      }
      case "recurring_legit": {
        const src = r.pick(recurring);
        const po = newPo(src.p, src.lines.map((l) => ({ sku: l.sku ?? "", description: l.description, qty: l.qty ?? 1, unitPrice: l.unitPrice ?? 0 })), issued);
        const e = withBank(baseInvoice(src.p, src.lines, po.id, seq), src.p);
        push(seq, kind, e, sender(src.p), `A genuine repeat service on its own ${po.id}, the same amount as an invoice a few days earlier. Policy says pay it.`);
        break;
      }
      case "vendor_name_variant": {
        const po = newPo(p, makePoLines(r, p, 1), issued);
        const base = withBank(baseInvoice(p, linesFromPo(po), po.id, seq), p);
        const name = r.pick(p.misspellings);
        push(seq, kind, { ...base, vendorName: name }, sender(p), `The vendor name is printed as "${name}".`);
        break;
      }
      case "split_completes": {
        const s = openSplits.splice(r.int(0, openSplits.length - 1), 1)[0];
        const first = invoices.find((x) => x.extraction.poReference === s.po.id)!.extraction.lineItems;
        const lines = s.po.lines.map((l, i) => {
          const qty = Math.max(1, l.qty - (first[i]?.qty ?? 0));
          return { description: l.description, sku: l.sku, qty, unitPrice: l.unitPrice, amount: round2(qty * l.unitPrice) };
        });
        push(seq, kind, withBank(baseInvoice(s.p, lines, s.po.id, seq), s.p), sender(s.p), `Final instalment: brings ${s.po.id} to exactly 100%.`);
        break;
      }
    }
  }

  // Answer-key policy for PO inference, independent of the engine's scoring: a PO "clearly fits" only when no
  // other still-open PO from the same vendor, for the same items, is within 35% of the amount. Otherwise a person should pick.
  const billed = new Set<string>();
  for (const inv of invoices) {
    if (inv.kind === "po_inferred") {
      const own = pos.find((x) => inv.plantedNote.includes(x.id))!;
      const skus = (x: PurchaseOrder) => x.lines.map((l) => l.sku).sort().join(",");
      const rival = pos.find((x) => x.vendorId === own.vendorId && x.id !== own.id && !billed.has(x.id) && skus(x) === skus(own) && Math.abs(x.total - own.total) / x.total < 0.35);
      if (rival) {
        const info = CASE_INFO.po_ambiguous;
        Object.assign(inv, { kind: "po_ambiguous", expected: info.expected, expectedReason: info.reason, plantedNote: `No PO number; ${own.id} fits, but ${rival.id} is also open for the same items within 35% of the amount.` });
      } else billed.add(own.id);
    } else if (inv.expected === "APPROVE" && inv.extraction.poReference) billed.add(inv.extraction.poReference);
  }

  return { seed, vendors: VENDORS, pos, receipts, invoices: invoices.slice(0, n) };
}
