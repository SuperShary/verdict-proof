import type { Outcome, Owner, ReasonCode } from "@/lib/types";

export type Severity = Outcome | "INFO";

export interface RuleDef {
  code: ReasonCode;
  severity: Severity;
  owner: Owner;
  title: string;
  why: string; // plain-English rationale, shown on the Decision rules page
}

/** Single source of truth for every reason code. Order within a severity = routing priority. */
export const RULES: RuleDef[] = [
  { code: "BANK_DETAILS_CHANGED", severity: "BLOCK", owner: "Finance controller", title: "Bank details changed", why: "The invoice asks for payment to an account that differs from the vendor master, which is the most common business-email-compromise pattern. Payment stays blocked until the change is verified by phone with a known contact." },
  { code: "SENDER_LOOKALIKE_DOMAIN", severity: "BLOCK", owner: "Finance controller", title: "Look-alike sender domain", why: "The sending domain imitates the vendor's real domain (swapped characters, extra letters, different TLD). Typical of impersonation fraud." },
  { code: "VENDOR_BLOCKED", severity: "BLOCK", owner: "Finance controller", title: "Vendor is blocked", why: "The vendor is on the blocked list in the master, so no invoice from them can be paid." },
  { code: "DUPLICATE_FILE", severity: "REJECT", owner: "AP clerk", title: "Exact duplicate file", why: "The same file (identical SHA-256) was already processed." },
  { code: "DUPLICATE_INVOICE", severity: "REJECT", owner: "AP clerk", title: "Duplicate invoice", why: "The same vendor has already billed this invoice number. Numbers are compared in canonical form, so INV-0042 and INV 42 are the same invoice." },
  { code: "NOT_AN_INVOICE", severity: "REJECT", owner: "AP clerk", title: "Not a payable document", why: "Quotes, statements and other documents cannot be paid. They are routed back instead of entering the AP queue." },
  { code: "MISSING_FIELDS", severity: "HOLD", owner: "Vendor", title: "Critical fields missing", why: "Without an invoice number, date, vendor or total the invoice cannot be matched, deduplicated or posted, so the vendor is asked to reissue." },
  { code: "PO_OVERBILLED", severity: "HOLD", owner: "Procurement", title: "PO would be over-billed", why: "Billed-to-date plus this invoice exceeds the PO value by more than tolerance. Split invoices are tracked against a running PO balance." },
  { code: "PRICE_VARIANCE", severity: "HOLD", owner: "Procurement", title: "Price differs from PO", why: "Unit prices differ from the agreed PO prices by more than tolerance." },
  { code: "QTY_EXCEEDS_RECEIVED", severity: "HOLD", owner: "Warehouse", title: "Billed more than received", why: "3-way match: the invoice bills more units than the goods receipt records." },
  { code: "PO_CLOSED", severity: "HOLD", owner: "Procurement", title: "PO is closed", why: "The referenced PO is closed, so it can't take new charges without procurement re-opening it." },
  { code: "VENDOR_UNKNOWN", severity: "HOLD", owner: "Procurement", title: "Vendor not in master", why: "No approved vendor matches this name. The vendor has to go through onboarding before we can pay them." },
  { code: "PO_AMBIGUOUS", severity: "HOLD", owner: "AP clerk", title: "PO match is ambiguous", why: "There is no PO reference, and more than one open PO fits equally well. A human picks from the ranked candidates instead of the system guessing." },
  { code: "PO_NOT_FOUND", severity: "HOLD", owner: "AP clerk", title: "No matching PO", why: "The referenced PO doesn't exist for this vendor, and no open PO fits." },
  { code: "LOW_CONFIDENCE", severity: "HOLD", owner: "AP clerk", title: "Low extraction confidence", why: "A critical field was read with low confidence (a poor scan, handwriting). A human confirms the field before any money moves." },
  { code: "ARITHMETIC_MISMATCH", severity: "HOLD", owner: "AP clerk", title: "Totals don't add up", why: "The line items, subtotal, tax and total are internally inconsistent." },
  { code: "SENDER_DOMAIN_MISMATCH", severity: "HOLD", owner: "AP clerk", title: "Unexpected sender", why: "Sent from a domain that isn't the vendor's, though not an obvious imitation. Worth a check." },
  { code: "CURRENCY_MISMATCH", severity: "HOLD", owner: "AP clerk", title: "Currency mismatch", why: "The invoice currency differs from the PO currency." },
  { code: "POSSIBLE_DUPLICATE", severity: "HOLD", owner: "AP clerk", title: "Possible duplicate", why: "Same vendor, same amount, within the duplicate window, but a different invoice number. It could be a resubmission." },
  { code: "DATE_ANOMALY", severity: "HOLD", owner: "AP clerk", title: "Unusual invoice date", why: "The date is in the future or more than 180 days old." },
  { code: "CREDIT_NOTE", severity: "HOLD", owner: "AP clerk", title: "Credit note", why: "A credit note reduces what we owe. It's applied against open invoices, not paid." },
  { code: "AI_UNAVAILABLE", severity: "HOLD", owner: "AP clerk", title: "Could not read document", why: "The AI step failed or returned invalid output. The system fails safe: never approve what it couldn't read." },
  { code: "VARIANCE_WITHIN_TOLERANCE", severity: "INFO", owner: "—", title: "Variance within tolerance", why: "A small difference from the PO that is inside tolerance. It's noted on the audit trail and doesn't block payment." },
  { code: "PO_INFERRED", severity: "INFO", owner: "—", title: "PO inferred", why: "There was no PO reference, but exactly one open PO fits clearly. It was matched with the reasoning recorded." },
  { code: "THREE_WAY_MATCHED", severity: "INFO", owner: "—", title: "3-way matched", why: "Invoice, PO and goods receipt quantities agree." },
];

export const RULE_BY_CODE = Object.fromEntries(RULES.map((r) => [r.code, r])) as Record<ReasonCode, RuleDef>;

export const SEVERITY_RANK: Record<Severity, number> = { BLOCK: 4, REJECT: 3, HOLD: 2, APPROVE: 1, INFO: 0 };
