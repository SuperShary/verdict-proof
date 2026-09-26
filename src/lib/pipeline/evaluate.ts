import type { Check, Decision, Extraction, HistoryEntry, MatchResult, Normalized, PurchaseOrder, Receipt, Run, Settings, StageId, Vendor } from "@/lib/types";
import { normalize } from "./normalize";
import { runDuplicateChecks, runValidation, runVendorTrust } from "@/lib/rules/checks";
import { matchPurchaseOrder } from "@/lib/rules/match";
import { decide } from "@/lib/rules/decide";

export interface MasterData {
  vendors: Vendor[];
  pos: PurchaseOrder[];
  receipts: Receipt[];
}

export interface EvalInput {
  extraction: Extraction;
  fileHash: string;
  senderEmail: string | null;
  history: HistoryEntry[];
  settings: Settings;
  master: MasterData;
  today?: Date;
}

export interface EvalOutput {
  normalized: Normalized;
  checks: Record<Exclude<StageId, "intake" | "read" | "decide" | "explain" | "normalize">, Check[] | null>; // null = skipped
  match: MatchResult | null;
  decision: Decision;
}

/** Stage-by-stage runners. The live pipeline times each one; tests and evals call evaluate(). */
export const stageRunners = {
  validate: (n: Normalized, i: EvalInput) => runValidation(n, i.settings, i.today),
  vendor: (n: Normalized, i: EvalInput) => runVendorTrust(n, i.senderEmail),
  match: (n: Normalized, i: EvalInput) => matchPurchaseOrder(n, i.master.pos, i.master.receipts, i.history, i.settings),
  duplicates: (n: Normalized, i: EvalInput) => runDuplicateChecks(n, i.fileHash, i.history, i.settings),
};

/** Matching needs a known vendor and a payable document. */
export const shouldMatch = (n: Normalized) => n.vendor != null && n.extraction.docType === "invoice";

export function evaluate(i: EvalInput): EvalOutput {
  const n = normalize(i.extraction, i.master.vendors);
  const validate = stageRunners.validate(n, i);
  const vendor = stageRunners.vendor(n, i);
  const m = shouldMatch(n) ? stageRunners.match(n, i) : null;
  const duplicates = stageRunners.duplicates(n, i);
  const all = [...validate, ...vendor, ...(m?.checks ?? []), ...duplicates];
  return {
    normalized: n,
    checks: { validate, vendor, match: m?.checks ?? null, duplicates },
    match: m?.match ?? null,
    decision: decide(all),
  };
}

export function toHistoryEntry(r: Pick<Run, "id" | "createdAt" | "fileHash" | "normalized" | "match" | "decision" | "override">): HistoryEntry {
  return {
    id: r.id,
    createdAt: r.createdAt,
    fileHash: r.fileHash,
    vendorId: r.normalized?.vendor?.id ?? null,
    invoiceNumberKey: r.normalized?.invoiceNumberKey ?? null,
    total: r.normalized?.total ?? null,
    netAmount: r.normalized?.netAmount ?? null,
    invoiceDate: r.normalized?.invoiceDate ?? null,
    poId: r.match?.poId ?? null,
    outcome: r.override?.outcome ?? r.decision.outcome,
  };
}
