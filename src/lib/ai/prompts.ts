export const EXTRACTION_PROMPT = `You are an accounts-payable document reader. Read the attached document exactly as printed and return JSON matching the schema.

Rules:
- Classify docType first. A quotation, estimate, pro-forma or statement of account is NOT an invoice.
- Copy identifiers exactly as printed (keep prefixes, spaces and dashes in invoice numbers).
- Numbers: plain numbers without currency symbols or thousands separators. Dates: ISO yyyy-mm-dd.
- Never invent a value. If something is not printed, return null and give it confidence 0. In particular, only fill poReference if a purchase order number is explicitly printed.
- taxInclusive = true when the prices/total already include tax (e.g. "incl. tax", "tax included"), in which case subtotal is null unless a pre-tax subtotal is printed.
- lineItems: one entry per billed line; amount is the line total as printed.
- Bank details: capture the remit-to bank name, account number and routing number if printed.
- confidence: be calibrated. Clean digital text is ~0.95+. Blurry scans, handwriting, or values you had to reconstruct should be lower.
- evidence: a short verbatim snippet from the document for each field you filled.
- notes: flag anything unusual an AP clerk should notice (changed bank details notice, "resubmitted", stamps, handwriting).`;

export function explainPrompt(input: {
  outcome: string;
  routeTo: string;
  recipient: string | null;
  vendor: string | null;
  invoiceNumber: string | null;
  total: string;
  checks: { label: string; status: string; detail: string }[];
}) {
  return `You write the explanation for an automated accounts-payable decision. The decision is FINAL and was made by deterministic rules. Explain it; do not change it or add new findings.

Decision: ${input.outcome}
Routed to: ${input.routeTo}
Vendor: ${input.vendor ?? "unknown"}
Invoice: ${input.invoiceNumber ?? "(no number)"} for ${input.total}
Rule results:
${input.checks.map((c) => `- [${c.status}] ${c.label}: ${c.detail}`).join("\n")}

Write:
1. rationale: 2-4 plain-English sentences a non-technical AP manager understands. Lead with the decision. Cite the specific numbers.
2. ${input.recipient ? `An email to ${input.recipient}. Subject + body. Short, polite, specific about exactly what is needed next. Sign off as "Accounts Payable, Halcyon Foods". ${input.outcome === "BLOCK" ? "This is an INTERNAL fraud alert: tell the controller not to reply to the sender and to verify the change by phone using the number already on file." : ""}` : "No email is needed: return null for subject and body."}`;
}
