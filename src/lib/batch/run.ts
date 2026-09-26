import type { Check, Decision, HistoryEntry, MatchResult, Normalized, Outcome, Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { evaluate, toHistoryEntry } from "@/lib/pipeline/evaluate";
import type { BatchInvoice, BatchWorld, CaseKind } from "./generate";
import { CASE_INFO } from "./generate";

export type Verdict = "correct" | "missed" | "false_alarm" | "wrong_call";

export interface BatchResult {
  invoice: BatchInvoice;
  normalized: Normalized;
  checks: Check[];
  match: MatchResult | null;
  decision: Decision;
  verdict: Verdict;
  microseconds: number;
}

export interface BatchScore {
  seed: number;
  n: number;
  planted: number; // invoices whose answer key is not APPROVE
  caught: number; // planted problems stopped with the right outcome
  stoppedWrongOutcome: number; // planted problems stopped, but with a different outcome (e.g. HOLD instead of REJECT)
  missed: number; // planted problems that were approved
  cleanTotal: number;
  cleanApproved: number;
  falseAlarms: number; // clean invoices that were not approved
  moneyStopped: number; // total value of planted-problem invoices that were not paid
  moneyLeaked: number; // total value of planted-problem invoices that were approved anyway
  byOutcome: Record<Outcome, number>;
  computeMs: number;
  byKind: { kind: CaseKind; label: string; count: number; correct: number; hard: boolean }[];
}

/** Classify one decision against the answer key. */
export function judge(expected: Outcome, got: Outcome): Verdict {
  if (expected === got) return "correct";
  if (expected === "APPROVE") return "false_alarm";
  if (got === "APPROVE") return "missed";
  return "wrong_call";
}

/**
 * Run the whole batch through the real engine, in order, carrying history forward exactly as the app does
 * (so split billing and duplicates depend on what came before). Nothing here is precomputed.
 */
export function runBatch(world: BatchWorld, settings: Settings = DEFAULT_SETTINGS, today = new Date()): { results: BatchResult[]; score: BatchScore } {
  const history: HistoryEntry[] = [];
  const results: BatchResult[] = [];
  const master = { vendors: world.vendors, pos: world.pos, receipts: world.receipts };
  const t0 = performance.now();

  for (const inv of world.invoices) {
    const s0 = performance.now();
    const out = evaluate({ extraction: inv.extraction, fileHash: inv.fileHash, senderEmail: inv.senderEmail, history, settings, master, today });
    const microseconds = Math.round((performance.now() - s0) * 1000);
    const checks = [...(out.checks.validate ?? []), ...(out.checks.vendor ?? []), ...(out.checks.match ?? []), ...(out.checks.duplicates ?? [])];
    history.push(
      toHistoryEntry({ id: inv.id, createdAt: inv.seq, fileHash: inv.fileHash, normalized: out.normalized, match: out.match, decision: out.decision, override: null }),
    );
    results.push({ invoice: inv, normalized: out.normalized, checks, match: out.match, decision: out.decision, verdict: judge(inv.expected, out.decision.outcome), microseconds });
  }
  const computeMs = Math.round((performance.now() - t0) * 10) / 10;

  const total = (r: BatchResult) => r.invoice.extraction.total ?? r.normalized.netAmount ?? 0;
  const planted = results.filter((r) => r.invoice.expected !== "APPROVE");
  const clean = results.filter((r) => r.invoice.expected === "APPROVE");
  const kinds = new Map<CaseKind, { count: number; correct: number }>();
  for (const r of results) {
    const k = kinds.get(r.invoice.kind) ?? { count: 0, correct: 0 };
    k.count++;
    if (r.verdict === "correct") k.correct++;
    kinds.set(r.invoice.kind, k);
  }

  const score: BatchScore = {
    seed: world.seed,
    n: results.length,
    planted: planted.length,
    caught: planted.filter((r) => r.verdict === "correct").length,
    stoppedWrongOutcome: planted.filter((r) => r.verdict === "wrong_call").length,
    missed: planted.filter((r) => r.verdict === "missed").length,
    cleanTotal: clean.length,
    cleanApproved: clean.filter((r) => r.verdict === "correct").length,
    falseAlarms: clean.filter((r) => r.verdict === "false_alarm").length,
    moneyStopped: Math.round(planted.filter((r) => r.decision.outcome !== "APPROVE").reduce((a, r) => a + total(r), 0) * 100) / 100,
    moneyLeaked: Math.round(planted.filter((r) => r.decision.outcome === "APPROVE").reduce((a, r) => a + total(r), 0) * 100) / 100,
    byOutcome: { APPROVE: 0, HOLD: 0, REJECT: 0, BLOCK: 0, ...Object.fromEntries(ORDER.map((o) => [o, results.filter((r) => r.decision.outcome === o).length])) },
    computeMs,
    byKind: [...kinds.entries()]
      .map(([kind, v]) => ({ kind, label: CASE_INFO[kind].label, count: v.count, correct: v.correct, hard: !!CASE_INFO[kind].hard }))
      .sort((a, b) => a.correct / a.count - b.correct / b.count || b.count - a.count),
  };
  return { results, score };
}

const ORDER: Outcome[] = ["APPROVE", "HOLD", "REJECT", "BLOCK"];
