"use client";
import { ArrowUpRight, ChevronDown, Copy, CornerDownRight, Mail } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { useState } from "react";
import type { Run } from "@/lib/types";
import { OUTCOME_META } from "@/components/ui/Outcome";
import { RULE_BY_CODE } from "@/lib/rules/catalog";
import { fmtMs, usd } from "@/lib/util/text";

const PANEL = {
  APPROVE: "bg-approve-soft",
  HOLD: "bg-hold-soft",
  REJECT: "bg-reject-soft",
  BLOCK: "bg-block text-block-fg",
} as const;

const MARK = { APPROVE: "bg-approve", HOLD: "bg-hold-mark", REJECT: "bg-reject", BLOCK: "bg-block-mark" } as const;

/** The verdict: outcome, the one-line reason, the owner, the rationale and the next message. Frameless; the parent draws the rules. */
export function VerdictPanel({ run, showAuditLink = true }: { run: Run; showAuditLink?: boolean }) {
  const d = run.decision;
  const m = OUTCOME_META[d.outcome];
  const inverted = d.outcome === "BLOCK";
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(false);
  const headline = d.headline.replace(/^(Approved|Held|Rejected|Blocked):\s*/, "");
  const long = (run.draftEmail?.body.length ?? 0) > 420;

  return (
    <section aria-label="Decision" className="flex flex-col">
      <div className={clsx("px-5 pb-5 pt-5", PANEL[d.outcome])}>
        <div className="strike flex items-center gap-3" key={run.id}>
          <span className={clsx("grid size-11 shrink-0 place-items-center rounded-full text-white", MARK[d.outcome])}>
            <m.Icon className="size-6" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <h2 className={clsx("text-[40px] font-semibold leading-none tracking-[-0.035em]", !inverted && m.text)}>{m.past}</h2>
        </div>
        <p className={clsx("mt-3 text-[15px] leading-snug", inverted ? "text-block-fg" : "text-ink")}>{headline}</p>
        {d.routeTo !== "—" && (
          <p className={clsx("mt-3 flex items-center gap-1.5 text-[14px] font-medium", inverted ? "text-block-fg" : "text-ink")}>
            <CornerDownRight className="size-4 shrink-0" aria-hidden="true" />
            Routed to {d.routeTo}
            {run.draftEmail && <span className={clsx("font-normal", inverted ? "text-block-fg/70" : "text-ink-2")}>· message drafted below</span>}
          </p>
        )}
        {d.reasons.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Reason codes">
            {d.reasons.map((r) => (
              <li key={r} title={RULE_BY_CODE[r].why} className={clsx("rounded px-1.5 py-0.5 font-mono text-[10.5px]", inverted ? "bg-block-fg/12 text-block-fg" : "bg-raised/80 text-ink-2")}>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="num grid grid-cols-[1.4fr_1fr_1fr] border-y border-rule">
        <div className="border-r border-rule px-5 py-3">
          <dt className="text-[12px] text-ink-3">At stake</dt>
          <dd className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{usd(run.normalized?.total ?? null)}</dd>
        </div>
        <div className="border-r border-rule px-4 py-3">
          <dt className="text-[12px] text-ink-3">Decided in</dt>
          <dd className="mt-1 text-[14px] font-medium">{fmtMs(run.durationMs)}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[12px] text-ink-3">AI cost</dt>
          <dd className="mt-1 text-[14px] font-medium">${run.costUsd.toFixed(4)}</dd>
        </div>
      </dl>

      <div className="px-5 py-4">
        <h3 className="text-[12px] font-medium text-ink-3">Why</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-ink">{run.rationale}</p>
      </div>

      {run.draftEmail && (
        <div className="border-t border-rule px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-ink-3">
              <Mail className="size-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">To {run.draftEmail.to}</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`To: ${run.draftEmail!.to}\nSubject: ${run.draftEmail!.subject}\n\n${run.draftEmail!.body}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
            >
              <Copy className="size-3.5" aria-hidden="true" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-2 rounded border border-rule bg-surface p-3">
            <p className="text-[13px] font-medium">{run.draftEmail.subject}</p>
            <p
              className={clsx("mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2", long && !full && "max-h-48 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]")}
            >
              {run.draftEmail.body}
            </p>
            {long && (
              <button type="button" onClick={() => setFull(!full)} aria-expanded={full} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink">
                <ChevronDown className={clsx("size-3.5 transition-transform", full && "rotate-180")} aria-hidden="true" />
                {full ? "Show less" : "Show full message"}
              </button>
            )}
          </div>
        </div>
      )}

      {showAuditLink && (
        <Link href={`/runs/${run.id}`} className="flex items-center justify-between border-t border-rule px-5 py-3 text-[13px] font-medium transition-colors hover:bg-surface">
          Full audit trail <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
