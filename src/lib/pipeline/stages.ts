import type { StageId } from "@/lib/types";

/** The nine stages, in order. `ai` marks the two that call Gemini; everything else is deterministic code. */
export const STAGES: { id: StageId; n: number; name: string; does: string; ai: boolean }[] = [
  { id: "intake", n: 1, name: "Intake", does: "Fingerprint the file (SHA-256) and capture the sender", ai: false },
  { id: "read", n: 2, name: "Read", does: "Gemini reads every field, with confidence and evidence", ai: true },
  { id: "normalize", n: 3, name: "Normalize", does: "Dates, invoice number, tax treatment, vendor match", ai: false },
  { id: "validate", n: 4, name: "Validate", does: "Document type, required fields, arithmetic, dates", ai: false },
  { id: "vendor", n: 5, name: "Vendor trust", does: "Approved vendor, bank details, sender domain", ai: false },
  { id: "match", n: 6, name: "PO match", does: "PO reference or inference, running balance, prices, receipts", ai: false },
  { id: "duplicates", n: 7, name: "Duplicates", does: "File hash, invoice number, amount and date window", ai: false },
  { id: "decide", n: 8, name: "Decide", does: "Deterministic rules pick the most severe outcome", ai: false },
  { id: "explain", n: 9, name: "Explain", does: "Gemini writes the rationale and the next email", ai: true },
];
