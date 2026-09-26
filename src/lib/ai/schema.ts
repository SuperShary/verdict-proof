import { z } from "zod";
import type { Extraction } from "@/lib/types";

/** Fields that carry a confidence score and an evidence snippet. Keep in sync with ExtractedField. */
export const SCORED_FIELDS = [
  "vendorName",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "poReference",
  "currency",
  "subtotal",
  "taxAmount",
  "total",
  "bankAccountNumber",
] as const;

const str = { type: ["string", "null"] } as const;
const num = { type: ["number", "null"] } as const;

/** JSON Schema sent to Gemini as the response format. */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    docType: { type: "string", enum: ["invoice", "credit_note", "quote", "statement", "other"] },
    vendorName: str,
    vendorAddress: str,
    vendorTaxId: str,
    invoiceNumber: str,
    invoiceDate: { ...str, description: "ISO yyyy-mm-dd" },
    dueDate: { ...str, description: "ISO yyyy-mm-dd" },
    poReference: { ...str, description: "Only if a purchase order number is printed on the document" },
    currency: { ...str, description: "ISO 4217 code, e.g. USD" },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: { description: { type: "string" }, sku: str, qty: num, unitPrice: num, amount: num },
        required: ["description", "sku", "qty", "unitPrice", "amount"],
      },
    },
    subtotal: num,
    taxAmount: num,
    taxRate: { ...num, description: "Percent, e.g. 8.5" },
    taxInclusive: { type: "boolean", description: "True when the printed total already includes tax and no separate pre-tax subtotal is billed" },
    total: num,
    bankName: str,
    bankAccountNumber: str,
    bankRoutingNumber: str,
    isScanned: { type: "boolean", description: "True when the page is a photo or scan rather than digital text" },
    confidence: {
      type: "object",
      description: "0..1 per field; how sure you are the value is correct. Use 0 for fields that are absent.",
      properties: Object.fromEntries(SCORED_FIELDS.map((f) => [f, { type: "number" }])),
      required: [...SCORED_FIELDS],
    },
    evidence: {
      type: "object",
      description: "Verbatim text from the document supporting each field (max 80 chars); null when absent.",
      properties: Object.fromEntries(SCORED_FIELDS.map((f) => [f, str])),
      required: [...SCORED_FIELDS],
    },
    notes: { ...str, description: "Anything a careful AP clerk would flag (handwriting, stamps, 'new bank details' notices)." },
  },
  required: [
    "docType", "vendorName", "vendorAddress", "vendorTaxId", "invoiceNumber", "invoiceDate", "dueDate", "poReference",
    "currency", "lineItems", "subtotal", "taxAmount", "taxRate", "taxInclusive", "total", "bankName", "bankAccountNumber",
    "bankRoutingNumber", "isScanned", "confidence", "evidence", "notes",
  ],
} as const;

const nstr = z.string().nullable();
const nnum = z.number().nullable();

/** Runtime validation of the model's answer. Anything that fails this is treated as unreadable. */
export const ExtractionZ = z.object({
  docType: z.enum(["invoice", "credit_note", "quote", "statement", "other"]),
  vendorName: nstr,
  vendorAddress: nstr,
  vendorTaxId: nstr,
  invoiceNumber: nstr,
  invoiceDate: nstr,
  dueDate: nstr,
  poReference: nstr,
  currency: nstr,
  lineItems: z.array(z.object({ description: z.string(), sku: nstr, qty: nnum, unitPrice: nnum, amount: nnum })),
  subtotal: nnum,
  taxAmount: nnum,
  taxRate: nnum,
  taxInclusive: z.boolean(),
  total: nnum,
  bankName: nstr,
  bankAccountNumber: nstr,
  bankRoutingNumber: nstr,
  isScanned: z.boolean(),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
  evidence: z.record(z.string(), z.string().nullable()),
  notes: nstr,
});

export function parseExtraction(raw: unknown): Extraction {
  const e = ExtractionZ.parse(raw);
  // Drop null evidence so the UI only renders real snippets; empty strings become null values.
  const evidence = Object.fromEntries(Object.entries(e.evidence).filter(([, v]) => v)) as Extraction["evidence"];
  const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);
  return {
    ...e,
    vendorName: blank(e.vendorName),
    invoiceNumber: blank(e.invoiceNumber),
    poReference: blank(e.poReference),
    bankAccountNumber: blank(e.bankAccountNumber),
    confidence: e.confidence as Extraction["confidence"],
    evidence,
  };
}

export const ExplainZ = z.object({ rationale: z.string(), subject: z.string().nullable(), body: z.string().nullable() });

export const EXPLAIN_JSON_SCHEMA = {
  type: "object",
  properties: {
    rationale: { type: "string", description: "2-4 sentences for an AP manager: what was decided and why, citing the actual numbers." },
    subject: { type: ["string", "null"], description: "Email subject, or null when no email is needed" },
    body: { type: ["string", "null"], description: "Plain-text email body, or null when no email is needed" },
  },
  required: ["rationale", "subject", "body"],
} as const;
