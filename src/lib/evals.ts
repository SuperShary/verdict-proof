import type { Extraction, Outcome, Run } from "@/lib/types";
import { matchVendor, normalizeDate } from "@/lib/pipeline/normalize";
import { digitsOnly, normalizeInvoiceNumber } from "@/lib/util/text";
import { VENDORS } from "@/data/vendors";

export interface FieldResult {
  field: string;
  expected: string;
  got: string;
  ok: boolean;
}

export interface EvalRow {
  sampleId: string;
  title: string;
  expected: Outcome;
  got: Outcome;
  decisionOk: boolean;
  fields: FieldResult[];
  ms: number;
  costUsd: number;
  error: string | null;
}

const fmt = (v: unknown) => (v == null || v === "" ? "∅" : String(v));
const money = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.011);

/** Field-level comparison with the same canonicalisation the rules use, so an eval failure is a real failure. */
export function compareFields(got: Extraction | null, truth: Extraction): FieldResult[] {
  const g = got;
  const vend = (n: string | null) => (n ? matchVendor(n, VENDORS)?.vendor.id ?? `unknown:${n}` : null);
  const rows: [string, unknown, unknown, boolean][] = [
    ["Document type", truth.docType, g?.docType, g?.docType === truth.docType],
    ["Vendor", truth.vendorName, g?.vendorName, vend(g?.vendorName ?? null) === vend(truth.vendorName)],
    ["Invoice no.", truth.invoiceNumber, g?.invoiceNumber, normalizeInvoiceNumber(g?.invoiceNumber) === normalizeInvoiceNumber(truth.invoiceNumber)],
    ["Invoice date", truth.invoiceDate, g?.invoiceDate, normalizeDate(g?.invoiceDate ?? null) === normalizeDate(truth.invoiceDate)],
    ["PO reference", truth.poReference, g?.poReference, digitsOnly(g?.poReference) === digitsOnly(truth.poReference)],
    ["Tax treatment", truth.taxInclusive ? "inclusive" : "exclusive", g ? (g.taxInclusive ? "inclusive" : "exclusive") : null, g?.taxInclusive === truth.taxInclusive],
    ["Tax", truth.taxAmount, g?.taxAmount, money(g?.taxAmount ?? null, truth.taxAmount) || (truth.taxAmount === 0 && g?.taxAmount == null)],
    ["Total", truth.total, g?.total, money(g?.total ?? null, truth.total)],
    ["Remit-to account", truth.bankAccountNumber, g?.bankAccountNumber, digitsOnly(g?.bankAccountNumber) === digitsOnly(truth.bankAccountNumber)],
  ];
  return rows.map(([field, e, v, ok]) => ({ field, expected: fmt(e), got: fmt(v), ok }));
}

export const evalRowFrom = (run: Run, s: { id: string; title: string; expected: Outcome; truth: Extraction }, error: string | null = null): EvalRow => ({
  sampleId: s.id,
  title: s.title,
  expected: s.expected,
  got: run.decision.outcome,
  decisionOk: run.decision.outcome === s.expected,
  fields: compareFields(run.extraction, s.truth),
  ms: run.durationMs,
  costUsd: run.costUsd,
  error,
});
