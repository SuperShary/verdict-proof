"use client";
import type { Check, DraftEmail, Extraction, HistoryEntry, MatchResult, Normalized, Run, Settings, StageEvent, StageId, StageStatus } from "@/lib/types";
import { normalize } from "./normalize";
import { shouldMatch, stageRunners, type EvalInput, type MasterData } from "./evaluate";
import { decide } from "@/lib/rules/decide";
import { recipientFor, templateExplanation } from "./explain";
import { sha256Hex, toBase64, kb } from "@/lib/util/file";
import { usd } from "@/lib/util/text";

export interface PipelineOptions {
  fileName: string;
  sampleId: string | null;
  senderEmail: string | null;
  history: HistoryEntry[];
  settings: Settings;
  master: MasterData;
  onEvent: (e: StageEvent) => void;
  explain?: boolean; // evals skip the explanation call
}

const statusOf = (checks: Check[]): StageStatus => (checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass");

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}

/**
 * Runs the nine stages against one PDF. Every event carries the real start time and
 * duration; nothing is delayed for effect. Returns the finished Run (the caller persists it).
 */
export async function runPipeline(file: Blob, o: PipelineOptions): Promise<Run> {
  const t0 = performance.now();
  const createdAt = Date.now();
  const stages = new Map<StageId, StageEvent>();
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;

  async function stage<T>(id: StageId, fn: () => Promise<{ value: T; status: StageStatus; summary: string }> | { value: T; status: StageStatus; summary: string }): Promise<T> {
    const startedAt = Date.now();
    const s0 = performance.now();
    o.onEvent({ stage: id, status: "running", startedAt, durationMs: null, summary: "" });
    try {
      const r = await fn();
      const ev = { stage: id, status: r.status, startedAt, durationMs: Math.round((performance.now() - s0) * 10) / 10, summary: r.summary };
      stages.set(id, ev);
      o.onEvent(ev);
      return r.value;
    } catch (e) {
      const ev = { stage: id, status: "fail" as const, startedAt, durationMs: Math.round(performance.now() - s0), summary: e instanceof Error ? e.message : String(e) };
      stages.set(id, ev);
      o.onEvent(ev);
      throw e;
    }
  }
  const skip = (id: StageId, summary: string) => {
    const ev: StageEvent = { stage: id, status: "skipped", startedAt: null, durationMs: null, summary };
    stages.set(id, ev);
    o.onEvent(ev);
  };

  // 1. Intake
  const intake = await stage("intake", async () => {
    const buf = await file.arrayBuffer();
    const hash = await sha256Hex(buf);
    return { value: { buf, hash }, status: "pass", summary: `${kb(buf.byteLength)} · sha256 ${hash.slice(0, 12)}…${o.senderEmail ? ` · from ${o.senderEmail}` : " · direct upload"}` };
  });

  // 2. Read (Gemini)
  let extraction: Extraction | null = null;
  let aiError: string | null = null;
  try {
    extraction = await stage("read", async () => {
      const r = await postJson<{ extraction: Extraction; inputTokens: number; outputTokens: number; costUsd: number }>("/api/extract", {
        pdfBase64: toBase64(intake.buf),
        model: o.settings.model,
      });
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      costUsd += r.costUsd;
      const e = r.extraction;
      const n = Object.values(e.confidence).filter((v) => (v ?? 0) > 0).length;
      return {
        value: e,
        status: "pass",
        summary: `${e.docType.replace("_", " ")}${e.isScanned ? " (scanned)" : ""} · ${n} fields · ${e.lineItems.length} line${e.lineItems.length === 1 ? "" : "s"} · ${r.inputTokens + r.outputTokens} tokens`,
      };
    });
  } catch (e) {
    aiError = e instanceof Error ? e.message : String(e);
  }

  let normalized: Normalized | null = null;
  let checks: Check[] = [];
  let match: MatchResult | null = null;

  if (!extraction) {
    for (const id of ["normalize", "validate", "vendor", "match", "duplicates"] as StageId[]) skip(id, "Skipped: the document could not be read");
    checks = [{ stage: "read", code: "AI_UNAVAILABLE", label: "Document read", status: "fail", detail: `The document could not be read (${aiError}). Held for a person; never auto-approved.` }];
  } else {
    const input: EvalInput = { extraction, fileHash: intake.hash, senderEmail: o.senderEmail, history: o.history, settings: o.settings, master: o.master };
    const n = await stage("normalize", () => {
      const v = normalize(extraction!, o.master.vendors);
      return {
        value: v,
        status: v.vendor ? "pass" : "warn",
        summary: `${v.vendor ? `${v.vendor.name} (${Math.round(v.vendorMatchScore * 100)}% match)` : "vendor not in master"} · #${v.invoiceNumberKey ?? "—"} · net ${usd(v.netAmount)}${extraction!.taxInclusive ? " (tax removed)" : ""}`,
      };
    });
    normalized = n;
    const run = (id: "validate" | "vendor" | "duplicates") =>
      stage(id, () => {
        const c = stageRunners[id](n, input);
        checks.push(...c);
        const f = c.filter((x) => x.status === "fail").length;
        return { value: c, status: statusOf(c), summary: f ? `${f} issue${f > 1 ? "s" : ""}: ${c.find((x) => x.status === "fail")!.label}` : `${c.length} checks passed` };
      });
    await run("validate");
    await run("vendor");
    if (shouldMatch(n)) {
      match = await stage("match", () => {
        const r = stageRunners.match(n, input);
        checks.push(...r.checks);
        const m = r.match;
        const summary = m.poId
          ? `${m.poId} (${m.method}) · ${usd(m.billedAfter)} of ${usd(m.poTotal)}${m.threeWay ? " · 3-way" : ""}`
          : r.checks[0]?.detail ?? "No PO";
        return { value: m, status: statusOf(r.checks), summary };
      });
    } else {
      skip("match", n.extraction.docType !== "invoice" ? "Skipped: not a payable invoice" : "Skipped: vendor not in master");
    }
    await run("duplicates");
  }

  // 8. Decide
  const decision = await stage("decide", () => {
    const d = decide(checks);
    return { value: d, status: d.outcome === "APPROVE" ? "pass" : d.outcome === "HOLD" ? "warn" : "fail", summary: `${d.outcome} · ${d.reasons.length ? d.reasons.join(", ") : "no exceptions"}${d.routeTo !== "—" ? ` → ${d.routeTo}` : ""}` };
  });

  // 9. Explain (Gemini, with deterministic fallback)
  const recipient = recipientFor(decision, normalized, o.senderEmail);
  let rationale = "";
  let draftEmail: DraftEmail | null = null;
  if (o.explain === false) {
    skip("explain", "Skipped in eval mode");
    ({ rationale, draftEmail } = templateExplanation(decision, checks, normalized, recipient));
  } else {
    await stage("explain", async () => {
      try {
        const r = await postJson<{ rationale: string; subject: string | null; body: string | null; inputTokens: number; outputTokens: number; costUsd: number }>("/api/explain", {
          model: o.settings.model,
          outcome: decision.outcome,
          routeTo: decision.routeTo,
          recipient,
          vendor: normalized?.vendor?.name ?? normalized?.extraction.vendorName ?? null,
          invoiceNumber: normalized?.extraction.invoiceNumber ?? null,
          total: usd(normalized?.total ?? null),
          checks: checks.filter((c) => c.status !== "pass" || c.code).map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
        });
        inputTokens += r.inputTokens;
        outputTokens += r.outputTokens;
        costUsd += r.costUsd;
        rationale = r.rationale;
        draftEmail = recipient && r.subject && r.body ? { to: recipient, subject: r.subject, body: r.body } : null;
        return { value: null, status: "pass", summary: draftEmail ? `Rationale + email to ${recipient}` : "Rationale written" };
      } catch (e) {
        ({ rationale, draftEmail } = templateExplanation(decision, checks, normalized, recipient));
        return { value: null, status: "warn", summary: `Template used: ${e instanceof Error ? e.message : "AI unavailable"}` };
      }
    });
  }

  return {
    id: crypto.randomUUID(),
    createdAt,
    fileName: o.fileName,
    fileHash: intake.hash,
    fileSize: intake.buf.byteLength,
    sampleId: o.sampleId,
    senderEmail: o.senderEmail,
    stages: [...stages.values()],
    extraction,
    normalized,
    checks,
    match,
    decision,
    rationale,
    draftEmail,
    model: o.settings.model,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs: Math.round(performance.now() - t0),
    override: null,
  };
}
