"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { generateBatch } from "@/lib/batch/generate";
import { runBatch, type BatchResult, type BatchScore } from "@/lib/batch/run";
import { OutcomeChip } from "@/components/ui/Outcome";
import { usd } from "@/lib/util/text";
import { VERDICT_TEXT } from "./Theatre";
import READ from "@/data/read-eval.json";
import WIDE from "@/data/stress-wide.json";

interface Aggregate {
  months: number;
  invoices: number;
  planted: number;
  caught: number;
  stoppedOther: number;
  missed: number;
  clean: number;
  falseAlarms: number;
  ms: number;
  kinds: { label: string; correct: number; count: number; hard: boolean }[];
}

const FIXED_SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i);
// Pinned so the 20 months are identical on every day and match `npm test` (tests/batch.test.ts).
const PROOF_DAY = new Date("2026-09-26T12:00:00Z");

function aggregate(): Aggregate {
  const t0 = performance.now();
  const scores = FIXED_SEEDS.map((s) => runBatch(generateBatch(s, 100, PROOF_DAY), undefined, PROOF_DAY).score);
  const kinds = new Map<string, { correct: number; count: number; hard: boolean }>();
  for (const s of scores)
    for (const k of s.byKind) {
      const v = kinds.get(k.label) ?? { correct: 0, count: 0, hard: k.hard };
      v.correct += k.correct;
      v.count += k.count;
      kinds.set(k.label, v);
    }
  const sum = (f: (s: BatchScore) => number) => scores.reduce((a, s) => a + f(s), 0);
  return {
    months: scores.length,
    invoices: sum((s) => s.n),
    planted: sum((s) => s.planted),
    caught: sum((s) => s.caught),
    stoppedOther: sum((s) => s.stoppedWrongOutcome),
    missed: sum((s) => s.missed),
    clean: sum((s) => s.cleanTotal),
    falseAlarms: sum((s) => s.falseAlarms),
    ms: Math.round(performance.now() - t0),
    kinds: [...kinds.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => a.correct / a.count - b.correct / b.count),
  };
}

const FOUND = [
  {
    t: "Tax-inclusive prices were compared with pre-tax PO prices",
    d: "Every honest tax-inclusive invoice was held for “price variance”. The nine hand-made samples never reached that path; the stress test did on its first run. Now the net price is compared.",
  },
  {
    t: "Resubmitted invoice numbers slipped past the duplicate check",
    d: "“BLP-004567”, “BLP 4567” and “#4567” read as different invoices. They were still held (never paid) but not recognised as duplicates. Numbers are now compared by their digits within one vendor.",
  },
  {
    t: "Brand-plus-suffix phishing domains were only held",
    d: "greenleafproduce-billing.com imitates greenleafproduce.com without being a one-letter typo. It's now blocked as a look-alike, the same as c0rtex-supply.com.",
  },
  {
    t: "PO inference was too eager",
    d: "With no PO number printed, the engine bound an invoice on its score lead alone, even when a second open PO for the same items was close in amount. Now another same-items PO within 35% of the amount always sends it to a person.",
  },
  {
    t: "The same seed built a different month in Node and in the browser",
    d: "A shuffle used a random sort comparator, whose result depends on the JavaScript engine. It's now a seeded Fisher–Yates shuffle, so this page and npm test print identical numbers.",
  },
];

export function ProofSection({ score, results, onOpen }: { score: BatchScore | null; results: BatchResult[]; onOpen: (r: BatchResult) => void }) {
  const [agg, setAgg] = useState<Aggregate | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setAgg(aggregate()), 400);
    return () => clearTimeout(id);
  }, []);
  const off = results.filter((r) => r.verdict !== "correct");

  return (
    <section id="proof" aria-labelledby="proof-h" className="border-b border-rule">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-8">
        <h2 id="proof-h" className="text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">
          How it&apos;s proven
        </h2>
        <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
          The AI reads, rules decide, the AI explains. Reading and deciding are tested separately, because they fail in different ways.
        </p>

        <ol className="mt-8 grid gap-px overflow-hidden rounded-lg bg-rule md:grid-cols-4">
          {[
            ["Generate", "A seed produces a month: purchase orders, goods receipts and 100 invoices across six vendors, in six kinds of mess."],
            ["Plant", "About 45% get a real AP problem, chosen at random. Each carries the answer a careful AP policy expects: the answer key."],
            ["Decide", "Every invoice goes through the same engine as a real upload, in order, with history carried forward. The engine never sees the key."],
            ["Score", "Caught, missed, false alarm or a different outcome. Every miss is listed with the rule that let it through."],
          ].map(([t, d], i) => (
            <li key={t} className="bg-surface px-5 py-5">
              <span className="num font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-1 text-[16px] font-semibold">{t}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{d}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {/* Across 20 months */}
          <article className="rounded-lg bg-raised p-5 shadow-[inset_0_0_0_1px_var(--rule)]">
            <h3 className="text-[16px] font-semibold">Across 20 fixed months</h3>
            <p className="mt-1 text-[13px] text-ink-2">Seeds 1000–1019 as of 26 Sep 2026, recomputed in your browser right now{agg ? ` (${agg.ms} ms)` : ""}. <code className="font-mono text-[12px]">npm test</code> prints the same numbers.</p>
            {agg ? (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["Invoices", agg.invoices.toLocaleString()],
                    ["Planted caught", `${agg.caught}/${agg.planted}`],
                    ["Missed", String(agg.missed)],
                    ["False alarms", `${agg.falseAlarms}/${agg.clean}`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[12px] text-ink-3">{k}</dt>
                      <dd className="num mt-1 text-[26px] font-semibold leading-none tracking-[-0.03em]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <table className="mt-5 w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-rule text-left text-[11.5px] text-ink-3">
                      <th className="py-2 font-medium">Case</th>
                      <th className="py-2 text-right font-medium">Right</th>
                      <th className="w-[38%] py-2 pl-3 font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.kinds.map((k) => {
                      const pct = Math.round((k.correct / k.count) * 100);
                      return (
                        <tr key={k.label} className="border-b border-rule last:border-b-0">
                          <td className="py-1.5 pr-2">
                            {k.label}
                            {k.hard && <span className="ml-2 rounded bg-hold-soft px-1.5 py-px font-mono text-[10px] text-hold">trap</span>}
                          </td>
                          <td className="num py-1.5 text-right font-mono text-[12px] text-ink-2">
                            {k.correct}/{k.count}
                          </td>
                          <td className="py-1.5 pl-3">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                                <span className={clsx("block h-full rounded-full", pct === 100 ? "bg-approve" : pct >= 80 ? "bg-hold-mark" : "bg-reject")} style={{ width: `${pct}%` }} />
                              </span>
                              <span className="num w-9 text-right font-mono text-[11.5px]">{pct}%</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="mt-6 text-[13px] text-ink-3">Running 2,000 invoices…</p>
            )}
            <p className="mt-5 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-2">
              <span className="font-medium text-ink">Months it was never fixed against.</span> The rules were corrected on these 20 months, so they are checked again on {WIDE.months.toLocaleString("en-US")} others (
              <code className="font-mono text-[12px]">npm run stress:wide</code>, {WIDE.invoices.toLocaleString("en-US")} invoices): {WIDE.missed} of {WIDE.planted.toLocaleString("en-US")} planted problems approved,{" "}
              {WIDE.falseAlarms.toLocaleString("en-US")} clean invoices held ({((WIDE.falseAlarms / WIDE.clean) * 100).toFixed(1)}%), {Math.round((WIDE.trapFalseAlarms / WIDE.falseAlarms) * 100)}% of them the weekly-charge trap.
            </p>
          </article>

          <div className="flex flex-col gap-6">
            {/* This month */}
            <article className="rounded-lg bg-raised p-5 shadow-[inset_0_0_0_1px_var(--rule)]">
              <h3 className="text-[16px] font-semibold">This month{score ? `, seed #${score.seed}` : ""}: where it disagreed</h3>
              {score ? (
                off.length ? (
                  <ul className="mt-3 divide-y divide-rule">
                    {off.map((r) => (
                      <li key={r.invoice.id}>
                        <button type="button" onClick={() => onOpen(r)} className="grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface">
                          <span className="num font-mono text-[12px] text-ink-3">{r.invoice.id}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium">{VERDICT_TEXT[r.verdict]}</span>
                            <span className="block truncate text-[12px] text-ink-3">{r.invoice.plantedNote}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <OutcomeChip outcome={r.invoice.expected} size="sm" />
                            <span className="text-ink-3" aria-hidden="true">→</span>
                            <OutcomeChip outcome={r.decision.outcome} size="sm" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[13px] text-ink-2">No disagreements this month. Try another seed: the traps don&apos;t show up every time.</p>
                )
              ) : (
                <p className="mt-3 text-[13px] text-ink-3">Waiting for the stage to finish.</p>
              )}
              {score && <p className="mt-3 text-[12px] text-ink-3">Money stopped: {usd(score.moneyStopped, { cents: false })} · leaked: {usd(score.moneyLeaked, { cents: false })}</p>}
            </article>

            {/* Reading */}
            <article className="rounded-lg bg-raised p-5 shadow-[inset_0_0_0_1px_var(--rule)]">
              <h3 className="text-[16px] font-semibold">Reading is tested on PDF files</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                Nine invoices rendered as PDFs in six vendor layouts, one rasterised to look like a phone photo with no text layer, scored field by field against the data they were rendered from
                (<code className="font-mono text-[12px]">npm run eval:read</code>). Last run on {new Date(READ.ranAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} with {READ.model}:{" "}
                <strong className="text-ink">
                  {READ.fieldsCorrect}/{READ.fieldsTotal} fields
                </strong>{" "}
                read correctly and{" "}
                <strong className="text-ink">
                  {READ.decisionsCorrect}/{READ.samples} decisions
                </strong>{" "}
                right, at ${(READ.costUsd / READ.samples).toFixed(4)} an invoice. Upload any PDF above to test it yourself.
              </p>
            </article>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <article className="rounded-lg bg-raised p-5 shadow-[inset_0_0_0_1px_var(--rule)]">
            <h3 className="text-[16px] font-semibold">What the stress test found, and what changed</h3>
            <p className="mt-1 text-[13px] text-ink-2">Each of these was invisible with nine hand-made samples. The fixes are rules anyone can read, not tuning hidden in a model.</p>
            <ol className="mt-4 space-y-4">
              {FOUND.map((f) => (
                <li key={f.t} className="border-l border-rule pl-3">
                  <div>
                    <p className="text-[14px] font-medium">{f.t}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{f.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </article>
          <article className="rounded-lg bg-hold-soft p-5">
            <h3 className="text-[16px] font-semibold text-hold">Still open, on purpose</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink">
              A genuine weekly charge for the same amount as last week is held as a <em>possible duplicate</em>. The rule can&apos;t tell a repeat service from a resubmission, and a person confirming it costs seconds while paying a duplicate costs the whole amount.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">The production fix is a recurring-charge schedule on the vendor record, so expected repeats are pre-approved. That&apos;s why this trap is scored as a false alarm, not hidden.</p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">A few clean invoices with no PO number are held for the same reason: a second open PO for the same items has a similar balance left, and a person picks the right one in a click.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
