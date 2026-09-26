import type { Check, ExtractedField, HistoryEntry, Normalized, Settings } from "@/lib/types";
import { digitsOnly, emailDomain, isLookalikeDomain, round2, usd } from "@/lib/util/text";

const CRITICAL: ExtractedField[] = ["vendorName", "invoiceNumber", "total", "poReference", "bankAccountNumber"];
const LABEL: Record<ExtractedField, string> = {
  vendorName: "vendor name",
  invoiceNumber: "invoice number",
  invoiceDate: "invoice date",
  dueDate: "due date",
  poReference: "PO reference",
  currency: "currency",
  subtotal: "subtotal",
  taxAmount: "tax",
  total: "total",
  bankAccountNumber: "bank account",
};

const pass = (stage: Check["stage"], label: string, detail: string, code: Check["code"] = null): Check => ({ stage, code, label, status: "pass", detail });

/** Stage 4: is it a payable invoice, is it complete, does it add up? */
export function runValidation(n: Normalized, s: Settings, today = new Date()): Check[] {
  const e = n.extraction;
  const out: Check[] = [];

  if (e.docType === "credit_note") {
    out.push({ stage: "validate", code: "CREDIT_NOTE", label: "Document type", status: "fail", detail: "This is a credit note, not an invoice. It gets applied to open invoices, not paid." });
  } else if (e.docType !== "invoice") {
    out.push({ stage: "validate", code: "NOT_AN_INVOICE", label: "Document type", status: "fail", detail: `This is a ${e.docType.replace("_", " ")}, not an invoice. Nothing is payable.` });
    return out; // nothing else is meaningful
  } else {
    out.push(pass("validate", "Document type", "Recognised as a vendor invoice."));
  }

  const missing = (["vendorName", "invoiceNumber", "invoiceDate", "total"] as const).filter((f) => e[f] == null || e[f] === "");
  if (missing.length) {
    out.push({ stage: "validate", code: "MISSING_FIELDS", label: "Required fields", status: "fail", detail: `Missing ${listJoin(missing.map((f) => LABEL[f]))}, so the invoice can't be matched or posted.` });
  } else {
    out.push(pass("validate", "Required fields", "Vendor, invoice number, date and total are all present."));
  }

  const weak = CRITICAL.filter((f) => e[f as keyof typeof e] != null && (e.confidence[f] ?? 1) < s.confidenceThreshold);
  if (weak.length) {
    const w = weak.map((f) => `${LABEL[f]} (${Math.round((e.confidence[f] ?? 0) * 100)}%)`).join(", ");
    out.push({ stage: "validate", code: "LOW_CONFIDENCE", label: "Read confidence", status: "fail", detail: `Low confidence on ${w}. A human should confirm before payment.` });
  } else {
    out.push(pass("validate", "Read confidence", `All critical fields read at ≥ ${Math.round(s.confidenceThreshold * 100)}% confidence.`));
  }

  // Arithmetic
  const lineSum = round2(e.lineItems.reduce((a, l) => a + (l.amount ?? 0), 0));
  const problems: string[] = [];
  if (e.lineItems.length && e.lineItems.every((l) => l.amount != null)) {
    const target = e.taxInclusive ? [e.total, n.netAmount] : [e.subtotal ?? n.netAmount];
    const ok = target.some((t) => t != null && Math.abs(lineSum - t) <= Math.max(1, Math.abs(t) * 0.01));
    if (!ok && target.some((t) => t != null)) problems.push(`line items sum to ${usd(lineSum)} but the subtotal reads ${usd(target.find((t) => t != null) ?? null)}`);
  }
  if (!e.taxInclusive && e.subtotal != null && e.total != null) {
    const expected = round2(e.subtotal + (e.taxAmount ?? 0));
    if (Math.abs(expected - e.total) > 1) problems.push(`subtotal + tax = ${usd(expected)} but the total reads ${usd(e.total)}`);
  }
  if (problems.length) {
    out.push({ stage: "validate", code: "ARITHMETIC_MISMATCH", label: "Arithmetic", status: "fail", detail: capitalize(problems.join("; ")) + "." });
  } else if (e.total != null) {
    out.push(pass("validate", "Arithmetic", e.taxInclusive ? `Tax is included in the total. Net ${usd(n.netAmount)} after removing ${usd(e.taxAmount)} tax.` : "Line items, subtotal, tax and total are consistent."));
  }

  if (n.invoiceDate) {
    const d = new Date(n.invoiceDate + "T00:00:00Z").getTime();
    const days = (today.getTime() - d) / 86_400_000;
    if (days < -1) out.push({ stage: "validate", code: "DATE_ANOMALY", label: "Invoice date", status: "fail", detail: `Invoice is dated ${n.invoiceDate}, which is in the future.` });
    else if (days > 180) out.push({ stage: "validate", code: "DATE_ANOMALY", label: "Invoice date", status: "fail", detail: `Invoice is dated ${n.invoiceDate}, more than 180 days ago.` });
    else out.push(pass("validate", "Invoice date", `Dated ${n.invoiceDate}.`));
  }
  return out;
}

/** Stage 5: can we trust who is asking to be paid? */
export function runVendorTrust(n: Normalized, senderEmail: string | null): Check[] {
  const out: Check[] = [];
  const v = n.vendor;
  const e = n.extraction;
  if (!v) {
    out.push({ stage: "vendor", code: "VENDOR_UNKNOWN", label: "Vendor master", status: "fail", detail: `"${e.vendorName ?? "Unknown"}" is not an approved vendor. It needs onboarding before payment.` });
    return out;
  }
  if (v.status === "blocked") {
    out.push({ stage: "vendor", code: "VENDOR_BLOCKED", label: "Vendor master", status: "fail", detail: `${v.name} is on the blocked-vendor list.` });
  } else {
    out.push(pass("vendor", "Vendor master", `Matched to approved vendor ${v.name} (${Math.round(n.vendorMatchScore * 100)}% name match).`));
  }

  const invAcct = digitsOnly(e.bankAccountNumber);
  if (invAcct) {
    const masterAcct = digitsOnly(v.bank.accountNumber);
    if (invAcct !== masterAcct) {
      out.push({ stage: "vendor", code: "BANK_DETAILS_CHANGED", label: "Bank details", status: "fail", detail: `The invoice asks for payment to account ••${invAcct.slice(-4)}${e.bankName ? ` at ${e.bankName}` : ""}, but ${v.name}'s account on file is ••${masterAcct.slice(-4)} at ${v.bank.bankName}.` });
    } else {
      out.push(pass("vendor", "Bank details", `Remit-to account ••${invAcct.slice(-4)} matches the vendor master.`));
    }
  } else {
    out.push(pass("vendor", "Bank details", "No bank details on the invoice. The master record will be used for payment."));
  }

  const dom = emailDomain(senderEmail);
  if (dom) {
    const real = v.emailDomain.toLowerCase();
    if (dom === real || dom.endsWith("." + real)) {
      out.push(pass("vendor", "Sender", `Sent from ${dom}, the vendor's known domain.`));
    } else if (isLookalikeDomain(dom, real)) {
      out.push({ stage: "vendor", code: "SENDER_LOOKALIKE_DOMAIN", label: "Sender", status: "fail", detail: `Sent from ${dom}, which imitates the vendor's real domain ${real}.` });
    } else {
      out.push({ stage: "vendor", code: "SENDER_DOMAIN_MISMATCH", label: "Sender", status: "fail", detail: `Sent from ${dom}, not the vendor's known domain ${real}.` });
    }
  }
  return out;
}

/** Stage 7: have we seen this invoice before? */
export function runDuplicateChecks(n: Normalized, fileHash: string, history: HistoryEntry[], s: Settings): Check[] {
  const exact = history.find((h) => h.fileHash === fileHash);
  if (exact) {
    return [{ stage: "duplicates", code: "DUPLICATE_FILE", label: "File fingerprint", status: "fail", detail: `This exact file was already processed in run ${exact.id.slice(0, 8)}.` }];
  }
  const out: Check[] = [pass("duplicates", "File fingerprint", "New file (SHA-256 not seen before).")];
  if (!n.vendor) return out;

  const same = history.find((h) => h.vendorId === n.vendor!.id && h.invoiceNumberKey && h.invoiceNumberKey === n.invoiceNumberKey && h.outcome !== "REJECT");
  if (same) {
    out.push({ stage: "duplicates", code: "DUPLICATE_INVOICE", label: "Invoice number", status: "fail", detail: `${n.vendor.name} already billed invoice "${n.extraction.invoiceNumber}". It matches an earlier invoice (canonical number ${n.invoiceNumberKey}) in run ${same.id.slice(0, 8)}.` });
    return out;
  }
  out.push(pass("duplicates", "Invoice number", `Invoice number is new for ${n.vendor.name}.`));

  if (n.total != null && n.invoiceDate) {
    const t = new Date(n.invoiceDate).getTime();
    const near = history.find(
      (h) =>
        h.vendorId === n.vendor!.id &&
        h.total != null &&
        Math.abs(h.total - n.total!) < 0.01 &&
        h.invoiceDate &&
        Math.abs(new Date(h.invoiceDate).getTime() - t) <= s.duplicateWindowDays * 86_400_000,
    );
    if (near) {
      out.push({ stage: "duplicates", code: "POSSIBLE_DUPLICATE", label: "Amount + date", status: "fail", detail: `Same vendor and same amount (${usd(n.total)}) as run ${near.id.slice(0, 8)} within ${s.duplicateWindowDays} days, under a different number.` });
    } else {
      out.push(pass("duplicates", "Amount + date", `No same-amount invoice from this vendor in the last ${s.duplicateWindowDays} days.`));
    }
  }
  return out;
}

const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
