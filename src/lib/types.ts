// Domain types shared by the pipeline, rules engine, stores and UI.

export type VendorStatus = "approved" | "blocked";

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  routingNumber: string;
}

export interface Vendor {
  id: string;
  name: string;
  aliases: string[];
  emailDomain: string;
  taxId: string;
  bank: BankAccount;
  status: VendorStatus;
  paymentTermsDays: number;
}

export interface POLine {
  sku: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export type POStatus = "open" | "closed";

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  issuedOn: string; // ISO date
  currency: string;
  status: POStatus;
  lines: POLine[];
  total: number; // pre-tax
  description: string;
}

export interface Receipt {
  id: string;
  poId: string;
  receivedOn: string;
  lines: { sku: string; qtyReceived: number }[];
}

// ---------- AI extraction ----------

export type DocType = "invoice" | "credit_note" | "quote" | "statement" | "other";

export interface LineItem {
  description: string;
  sku: string | null;
  qty: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export type ExtractedField =
  | "vendorName"
  | "invoiceNumber"
  | "invoiceDate"
  | "dueDate"
  | "poReference"
  | "currency"
  | "subtotal"
  | "taxAmount"
  | "total"
  | "bankAccountNumber";

export interface Extraction {
  docType: DocType;
  vendorName: string | null;
  vendorAddress: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO yyyy-mm-dd when parseable
  dueDate: string | null;
  poReference: string | null;
  currency: string | null;
  lineItems: LineItem[];
  subtotal: number | null;
  taxAmount: number | null;
  taxRate: number | null; // percent, e.g. 8.5
  taxInclusive: boolean;
  total: number | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankRoutingNumber: string | null;
  isScanned: boolean;
  confidence: Partial<Record<ExtractedField, number>>; // 0..1
  evidence: Partial<Record<ExtractedField, string>>; // verbatim snippet from the document
  notes: string | null;
}

// ---------- Normalized ----------

export interface Normalized {
  extraction: Extraction;
  vendor: Vendor | null;
  vendorMatchScore: number;
  invoiceNumberKey: string | null; // canonical form used for duplicate detection
  invoiceDate: string | null;
  netAmount: number | null; // pre-tax amount comparable to PO totals
  total: number | null;
  currency: string;
}

// ---------- Checks & decisions ----------

export type Outcome = "APPROVE" | "HOLD" | "REJECT" | "BLOCK";

export type Owner = "AP clerk" | "Procurement" | "Warehouse" | "Vendor" | "Finance controller" | "—";

export type ReasonCode =
  // BLOCK
  | "BANK_DETAILS_CHANGED"
  | "SENDER_LOOKALIKE_DOMAIN"
  | "VENDOR_BLOCKED"
  // REJECT
  | "DUPLICATE_FILE"
  | "DUPLICATE_INVOICE"
  | "NOT_AN_INVOICE"
  // HOLD
  | "MISSING_FIELDS"
  | "LOW_CONFIDENCE"
  | "ARITHMETIC_MISMATCH"
  | "VENDOR_UNKNOWN"
  | "SENDER_DOMAIN_MISMATCH"
  | "PO_NOT_FOUND"
  | "PO_AMBIGUOUS"
  | "PO_CLOSED"
  | "PO_OVERBILLED"
  | "PRICE_VARIANCE"
  | "QTY_EXCEEDS_RECEIVED"
  | "CURRENCY_MISMATCH"
  | "POSSIBLE_DUPLICATE"
  | "DATE_ANOMALY"
  | "CREDIT_NOTE"
  | "AI_UNAVAILABLE"
  // informational
  | "VARIANCE_WITHIN_TOLERANCE"
  | "PO_INFERRED"
  | "THREE_WAY_MATCHED";

export type CheckStatus = "pass" | "warn" | "fail";

export type StageId =
  | "intake"
  | "read"
  | "normalize"
  | "validate"
  | "vendor"
  | "match"
  | "duplicates"
  | "decide"
  | "explain";

export interface Check {
  stage: StageId;
  code: ReasonCode | null; // null for a plain pass
  label: string; // short human label, e.g. "Totals add up"
  status: CheckStatus;
  detail: string; // one sentence with the actual numbers
}

export interface PoCandidate {
  poId: string;
  score: number;
  amountCloseness: number;
  textOverlap: number;
  remaining: number;
}

export interface MatchResult {
  poId: string | null;
  method: "explicit" | "inferred" | "none";
  candidates: PoCandidate[];
  poTotal: number | null;
  billedToDate: number | null;
  billedAfter: number | null;
  variance: number | null; // invoice net - expected
  tolerance: number | null;
  threeWay: boolean;
}

export interface Decision {
  outcome: Outcome;
  reasons: ReasonCode[];
  routeTo: Owner;
  headline: string; // one line, e.g. "Held: invoice pushes PO-1042 to 112% of its value"
}

// ---------- Runs ----------

export type StageStatus = "pending" | "running" | "pass" | "warn" | "fail" | "skipped";

export interface StageEvent {
  stage: StageId;
  status: StageStatus;
  startedAt: number | null;
  durationMs: number | null;
  summary: string;
}

export interface DraftEmail {
  to: string;
  subject: string;
  body: string;
}

export interface Override {
  outcome: Outcome;
  reason: string;
  at: number;
}

export interface Run {
  id: string;
  createdAt: number;
  fileName: string;
  fileHash: string;
  fileSize: number;
  sampleId: string | null;
  senderEmail: string | null;
  stages: StageEvent[];
  extraction: Extraction | null;
  normalized: Normalized | null;
  checks: Check[];
  match: MatchResult | null;
  decision: Decision;
  rationale: string;
  draftEmail: DraftEmail | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  override: Override | null;
}

/** Minimal view of prior runs that the duplicate + ledger checks need. */
export interface HistoryEntry {
  id: string;
  createdAt: number;
  fileHash: string;
  vendorId: string | null;
  invoiceNumberKey: string | null;
  total: number | null;
  netAmount: number | null;
  invoiceDate: string | null;
  poId: string | null;
  outcome: Outcome; // effective outcome (override wins)
}

export interface Settings {
  model: string;
  tolerancePct: number; // e.g. 2
  toleranceAbs: number; // e.g. 50
  confidenceThreshold: number; // e.g. 0.8
  duplicateWindowDays: number; // e.g. 14
  inferAcceptScore: number; // e.g. 0.85
  inferMargin: number; // e.g. 0.15
}

export const DEFAULT_SETTINGS: Settings = {
  model: "gemini-3.8-flash",
  tolerancePct: 2,
  toleranceAbs: 50,
  confidenceThreshold: 0.8,
  duplicateWindowDays: 14,
  inferAcceptScore: 0.85,
  inferMargin: 0.2,
};
