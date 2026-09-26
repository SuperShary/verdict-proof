import type { Check, HistoryEntry, LineItem, MatchResult, Normalized, PoCandidate, POLine, PurchaseOrder, Receipt, Settings } from "@/lib/types";
import { digitsOnly, round2, tokenOverlap, usd } from "@/lib/util/text";

export function billedToDate(poId: string, history: HistoryEntry[]): number {
  return round2(history.filter((h) => h.poId === poId && h.outcome === "APPROVE").reduce((a, h) => a + (h.netAmount ?? 0), 0));
}

export function tolerance(amount: number, s: Settings): number {
  return round2(Math.min((Math.abs(amount) * s.tolerancePct) / 100, s.toleranceAbs));
}

/** Rank open POs for a vendor when the invoice carries no usable PO reference. */
export function scoreCandidates(n: Normalized, pos: PurchaseOrder[], history: HistoryEntry[]): PoCandidate[] {
  const net = n.netAmount ?? 0;
  const invText = n.extraction.lineItems.map((l) => l.description).join(" ");
  return pos
    .filter((p) => p.vendorId === n.vendor?.id && p.status === "open")
    .map((p) => {
      const remaining = round2(p.total - billedToDate(p.id, history));
      const amountCloseness = remaining > 0 ? Math.max(0, 1 - Math.abs(net - remaining) / remaining) : 0;
      const textOverlap = tokenOverlap(invText, p.lines.map((l) => l.description).join(" ") + " " + p.description);
      const datePlausible = !n.invoiceDate || n.invoiceDate >= p.issuedOn ? 1 : 0.3;
      const score = round2(0.6 * amountCloseness + 0.3 * textOverlap + 0.1 * datePlausible);
      return { poId: p.id, score, amountCloseness: round2(amountCloseness), textOverlap: round2(textOverlap), remaining };
    })
    .sort((a, b) => b.score - a.score);
}

function findPoLine(item: LineItem, lines: POLine[]): POLine | null {
  if (item.sku) {
    const bySku = lines.find((l) => l.sku.toLowerCase() === item.sku!.toLowerCase());
    if (bySku) return bySku;
  }
  let best: POLine | null = null;
  let bestScore = 0.25;
  for (const l of lines) {
    const s = tokenOverlap(item.description, l.description);
    if (s > bestScore) {
      best = l;
      bestScore = s;
    }
  }
  return best;
}

/** Stage 6: which PO does this invoice bill against, and is it within what was agreed? */
export function matchPurchaseOrder(
  n: Normalized,
  pos: PurchaseOrder[],
  receipts: Receipt[],
  history: HistoryEntry[],
  s: Settings,
): { match: MatchResult; checks: Check[] } {
  const checks: Check[] = [];
  const empty: MatchResult = { poId: null, method: "none", candidates: [], poTotal: null, billedToDate: null, billedAfter: null, variance: null, tolerance: null, threeWay: false };
  const net = n.netAmount ?? 0;
  const candidates = scoreCandidates(n, pos, history);

  // 1. Explicit reference
  let po: PurchaseOrder | null = null;
  let method: MatchResult["method"] = "none";
  const ref = digitsOnly(n.extraction.poReference);
  if (ref) {
    const found = pos.find((p) => digitsOnly(p.id) === ref);
    if (found && found.vendorId === n.vendor?.id) {
      po = found;
      method = "explicit";
      checks.push({ stage: "match", code: null, label: "PO reference", status: "pass", detail: `Invoice references ${found.id} (${found.description}).` });
    } else {
      const why = found ? `${found.id} belongs to a different vendor` : `PO "${n.extraction.poReference}" doesn't exist`;
      checks.push({ stage: "match", code: "PO_NOT_FOUND", label: "PO reference", status: "fail", detail: `${capitalize(why)}.` });
      return { match: { ...empty, candidates }, checks };
    }
  } else {
    // 2. Infer
    const [top, second] = candidates;
    if (!top || top.score < 0.4) {
      checks.push({ stage: "match", code: "PO_NOT_FOUND", label: "PO reference", status: "fail", detail: "No PO reference on the invoice, and no open PO for this vendor fits." });
      return { match: { ...empty, candidates }, checks };
    }
    const margin = round2(top.score - (second?.score ?? 0));
    // A clear score lead isn't enough when another open PO covers the same items for a similar amount
    // (within 35%): billing the wrong one strands a balance, so a person picks.
    const rival = candidates.slice(1).find((c) => c.textOverlap >= 0.9 && c.amountCloseness >= 0.65);
    if (top.score >= s.inferAcceptScore && margin >= s.inferMargin && !rival) {
      po = pos.find((p) => p.id === top.poId)!;
      method = "inferred";
      checks.push({ stage: "match", code: "PO_INFERRED", label: "PO reference", status: "warn", detail: `No PO on the invoice. Inferred ${po.id} (score ${top.score}, ${margin} ahead of the next candidate).` });
    } else {
      const detail = rival
        ? `No PO on the invoice. ${top.poId} fits best, but ${rival.poId} is also open for the same items at a similar amount. A person should pick one.`
        : `No PO on the invoice, and two open POs fit almost equally well: ${candidates.slice(0, 2).map((c) => `${c.poId} (${c.score})`).join(" vs ")}. A person should pick one.`;
      checks.push({ stage: "match", code: "PO_AMBIGUOUS", label: "PO reference", status: "fail", detail });
      return { match: { ...empty, candidates }, checks };
    }
  }

  // 3. PO state
  if (po.status === "closed") checks.push({ stage: "match", code: "PO_CLOSED", label: "PO status", status: "fail", detail: `${po.id} is closed.` });
  if (n.currency !== po.currency) checks.push({ stage: "match", code: "CURRENCY_MISMATCH", label: "Currency", status: "fail", detail: `Invoice is in ${n.currency}, but ${po.id} is in ${po.currency}.` });

  // 4. Running balance (split invoices)
  const billed = billedToDate(po.id, history);
  const after = round2(billed + net);
  const tol = tolerance(net, s);
  const pct = Math.round((after / po.total) * 100);
  if (after > po.total + tol) {
    checks.push({ stage: "match", code: "PO_OVERBILLED", label: "PO balance", status: "fail", detail: `This invoice would take ${po.id} to ${usd(after)} of ${usd(po.total)} (${pct}%). ${usd(billed)} is already billed.` });
  } else {
    checks.push({ stage: "match", code: null, label: "PO balance", status: "pass", detail: billed > 0 ? `Partial billing: ${usd(billed)} already billed + ${usd(net)} now = ${pct}% of ${usd(po.total)}.` : `${usd(net)} against a PO value of ${usd(po.total)} (${pct}%).` });
  }

  // 5. Price variance on matched lines
  let variance = 0;
  const priced: string[] = [];
  for (const item of n.extraction.lineItems) {
    const line = findPoLine(item, po.lines);
    if (!line || item.unitPrice == null || item.qty == null) continue;
    // Tax-inclusive invoices print gross unit prices; compare the net price with the (pre-tax) PO price.
    const unit = n.extraction.taxInclusive && n.extraction.taxRate ? round2(item.unitPrice / (1 + n.extraction.taxRate / 100)) : item.unitPrice;
    const diff = round2((unit - line.unitPrice) * item.qty);
    if (Math.abs(diff) >= 0.01) {
      variance += diff;
      priced.push(`${line.sku} billed at ${usd(unit)}${unit !== item.unitPrice ? " net of tax" : ""} vs ${usd(line.unitPrice)} on the PO`);
    }
  }
  variance = round2(variance);
  if (Math.abs(variance) > tol) {
    checks.push({ stage: "match", code: "PRICE_VARIANCE", label: "Unit prices", status: "fail", detail: `${capitalize(priced.join("; "))}. Total variance ${usd(variance)} exceeds tolerance of ${usd(tol)}.` });
  } else if (priced.length) {
    checks.push({ stage: "match", code: "VARIANCE_WITHIN_TOLERANCE", label: "Unit prices", status: "warn", detail: `${capitalize(priced.join("; "))}. Variance ${usd(variance)} is within tolerance of ${usd(tol)}.` });
  } else {
    checks.push({ stage: "match", code: null, label: "Unit prices", status: "pass", detail: "Unit prices match the PO." });
  }

  // 6. 3-way match against goods receipts
  const grn = receipts.filter((r) => r.poId === po!.id);
  let threeWay = false;
  if (grn.length) {
    const received = new Map<string, number>();
    for (const r of grn) for (const l of r.lines) received.set(l.sku, (received.get(l.sku) ?? 0) + l.qtyReceived);
    const over: string[] = [];
    for (const item of n.extraction.lineItems) {
      const line = findPoLine(item, po.lines);
      if (!line || item.qty == null) continue;
      const got = received.get(line.sku) ?? 0;
      if (item.qty > got) over.push(`${line.sku}: billed ${item.qty}, received ${got}`);
    }
    if (over.length) {
      checks.push({ stage: "match", code: "QTY_EXCEEDS_RECEIVED", label: "Goods receipt", status: "fail", detail: `Billed more than received. ${over.join("; ")}.` });
    } else {
      threeWay = true;
      checks.push({ stage: "match", code: "THREE_WAY_MATCHED", label: "Goods receipt", status: "pass", detail: `Quantities agree with ${grn.map((g) => g.id).join(", ")} (3-way match).` });
    }
  } else {
    checks.push({ stage: "match", code: null, label: "Goods receipt", status: "pass", detail: "No goods receipt for this PO (services), so this is a 2-way match." });
  }

  return {
    match: { poId: po.id, method, candidates, poTotal: po.total, billedToDate: billed, billedAfter: after, variance, tolerance: tol, threeWay },
    checks,
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
