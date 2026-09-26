"use client";
import { Check, ChevronDown, Circle, Minus, TriangleAlert, X } from "lucide-react";
import clsx from "clsx";
import type { Check as CheckT, StageEvent, StageId } from "@/lib/types";
import { STAGES } from "@/lib/pipeline/stages";
import { fmtMs } from "@/lib/util/text";
import { useState } from "react";

const GLYPH = {
  pending: { Icon: Circle, cls: "text-rule-strong" },
  running: { Icon: Circle, cls: "text-live" },
  pass: { Icon: Check, cls: "text-approve" },
  warn: { Icon: TriangleAlert, cls: "text-hold-mark" },
  fail: { Icon: X, cls: "text-reject" },
  skipped: { Icon: Minus, cls: "text-ink-3" },
} as const;

export function AiTag() {
  return <span className="rounded bg-raised px-1.5 py-px font-mono text-[10px] text-ink-3 shadow-[inset_0_0_0_1px_var(--rule)]">Gemini</span>;
}

export function CheckRow({ c }: { c: CheckT }) {
  const g = GLYPH[c.status];
  return (
    <li className="grid grid-cols-[16px_1fr] gap-x-2.5 py-1.5">
      <g.Icon className={clsx("mt-[3px] size-3.5", g.cls)} strokeWidth={2.4} aria-label={c.status} />
      <div className="min-w-0">
        <span className="font-medium text-ink">{c.label}</span>
        {c.code && <span className="ml-2 font-mono text-[10.5px] tracking-tight text-ink-3">{c.code}</span>}
        <p className="text-[13px] leading-snug text-ink-2">{c.detail}</p>
      </div>
    </li>
  );
}

/**
 * The nine stages as a ruled ledger. Rows fill in as real events arrive; a stage that
 * found something shows its findings inline, passing stages expand on demand.
 */
export function StageLedger({ stages, checks, totalMs }: { stages: StageEvent[]; checks: CheckT[]; totalMs?: number | null }) {
  const [open, setOpen] = useState<StageId | null>(null);
  const total = totalMs ?? (stages.reduce((a, s) => a + (s.durationMs ?? 0), 0) || null);

  return (
    <section aria-label="Run stages">
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <h2 className="text-[13px] font-semibold">Run</h2>
        <span className="num font-mono text-[11.5px] text-ink-3">{total ? fmtMs(total) : "—"}</span>
      </header>
      <ol>
        {STAGES.map((def) => {
          const s = stages.find((x) => x.stage === def.id)!;
          const g = GLYPH[s.status];
          const cs = checks.filter((c) => c.stage === def.id);
          const findings = cs.filter((c) => c.status !== "pass");
          const passes = cs.filter((c) => c.status === "pass");
          const isOpen = open === def.id;
          return (
            <li key={def.id} className="relative border-b border-rule last:border-b-0">
              <div className={clsx("grid grid-cols-[22px_1fr_auto] items-start gap-x-3 px-4 py-2.5", s.status === "pending" && "opacity-60")}>
                <span className="num pt-px font-mono text-[11px] text-ink-3">{String(def.n).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <span className="flex items-center gap-2">
                    <g.Icon className={clsx("size-3.5 shrink-0", g.cls, s.status === "running" && "animate-pulse")} strokeWidth={2.6} aria-hidden="true" />
                    <span className="font-medium">{def.name}</span>
                    {def.ai && <AiTag />}
                  </span>
                  <p className={clsx("mt-0.5 line-clamp-3 break-words font-mono text-[11.5px] leading-relaxed", s.summary ? "text-ink-2" : "text-ink-3")}>
                    {s.status === "running" ? "running…" : s.summary || def.does}
                  </p>
                  {findings.length > 0 && (
                    <ul className="mt-1 border-l border-rule pl-3">
                      {findings.map((c, i) => (
                        <CheckRow key={i} c={c} />
                      ))}
                    </ul>
                  )}
                  {passes.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : def.id)}
                        aria-expanded={isOpen}
                        className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-ink-3 transition-colors hover:text-ink"
                      >
                        <ChevronDown className={clsx("size-3 transition-transform duration-150", isOpen && "rotate-180")} aria-hidden="true" />
                        {passes.length} passed check{passes.length > 1 ? "s" : ""}
                      </button>
                      {isOpen && (
                        <ul className="rise mt-1 border-l border-rule pl-3">
                          {passes.map((c, i) => (
                            <CheckRow key={i} c={c} />
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
                <span className="num pt-0.5 font-mono text-[11px] text-ink-3">{fmtMs(s.durationMs)}</span>
              </div>
              {s.status === "running" && <span className="scanline" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
