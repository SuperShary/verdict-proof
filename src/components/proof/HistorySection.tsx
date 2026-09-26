"use client";
import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { db, clearHistory, type BatchRecord } from "@/lib/store/db";
import { useLive } from "@/lib/store/live";
import type { Run } from "@/lib/types";
import { OutcomeChip } from "@/components/ui/Outcome";
import { fmtMs, usd } from "@/lib/util/text";

/** Every run this browser has made: stress-test months and real uploads. Nothing leaves the browser. */
export function HistorySection({ tick, onReplay }: { tick: number; onReplay: (seed: number) => void }) {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [confirm, setConfirm] = useState(false);
  const finish = useLive((s) => s.finish);
  const start = useLive((s) => s.start);

  const load = useCallback(async () => {
    setBatches(await db.batches.orderBy("createdAt").reverse().limit(30).toArray());
    setRuns(await db.runs.orderBy("createdAt").reverse().limit(30).toArray());
  }, []);
  useEffect(() => {
    load();
  }, [load, tick]);

  async function reopen(r: Run) {
    const f = await db.files.get(r.id);
    start(r.fileName, f ? URL.createObjectURL(f.blob) : "");
    finish(r);
    document.getElementById("upload")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const th = "px-3 py-2 text-left text-[11.5px] font-medium text-ink-3 whitespace-nowrap";
  const td = "px-3 py-2.5 align-top text-[13px]";

  return (
    <section id="history" aria-labelledby="history-h">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="history-h" className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">
              History
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] text-ink-2">Every month you ran and every invoice you uploaded, kept in this browser only. Re-run any month from its seed; reopen any upload with its full trail.</p>
          </div>
          {confirm ? (
            <span className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await clearHistory();
                  setConfirm(false);
                  load();
                }}
                className="h-9 rounded-full bg-reject px-4 text-[13px] font-medium text-canvas"
              >
                Clear history
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="h-9 rounded-full border border-rule-strong px-4 text-[13px]">
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="h-9 rounded-full border border-rule-strong px-4 text-[13px] text-ink-2 transition-colors hover:text-ink">
              Clear history
            </button>
          )}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <article className="min-w-0 rounded-lg bg-raised shadow-[inset_0_0_0_1px_var(--rule)]">
            <h3 className="border-b border-rule px-4 py-3 text-[13px] font-semibold">Stress-test months</h3>
            {batches.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="border-b border-rule">
                    <tr>
                      <th className={th}>Seed</th>
                      <th className={th}>When</th>
                      <th className={`${th} text-right`}>Caught</th>
                      <th className={`${th} text-right`}>Missed</th>
                      <th className={`${th} text-right`}>False alarms</th>
                      <th className={`${th} text-right`}>Stopped</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} className="border-b border-rule last:border-b-0">
                        <td className={`${td} num font-mono text-[12px]`}>#{b.seed}</td>
                        <td className={`${td} text-ink-2`}>{new Date(b.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className={`${td} num text-right`}>
                          {b.score.caught}/{b.score.planted}
                        </td>
                        <td className={`${td} num text-right ${b.score.missed ? "text-reject" : ""}`}>{b.score.missed}</td>
                        <td className={`${td} num text-right`}>
                          {b.score.falseAlarms}/{b.score.cleanTotal}
                        </td>
                        <td className={`${td} num whitespace-nowrap text-right`}>{usd(b.score.moneyStopped, { cents: false })}</td>
                        <td className={`${td} text-right`}>
                          <button type="button" onClick={() => onReplay(b.seed)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-surface hover:text-ink">
                            <RotateCcw className="size-3.5" aria-hidden="true" /> Re-run
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-[13px] text-ink-2">No months yet. The stage at the top runs one on arrival.</p>
            )}
          </article>

          <article className="min-w-0 rounded-lg bg-raised shadow-[inset_0_0_0_1px_var(--rule)]">
            <h3 className="border-b border-rule px-4 py-3 text-[13px] font-semibold">Uploaded invoices</h3>
            {runs.length ? (
              <ul className="divide-y divide-rule">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => reopen(r)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{r.normalized?.vendor?.name ?? r.extraction?.vendorName ?? "Unreadable document"}</span>
                        <span className="num block truncate font-mono text-[11px] text-ink-3">
                          {r.fileName} · {r.extraction?.invoiceNumber ?? "no number"} · {usd(r.normalized?.total ?? null)} · {fmtMs(r.durationMs)} · ${r.costUsd.toFixed(4)}
                        </span>
                      </span>
                      <OutcomeChip outcome={r.decision.outcome} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[13px] text-ink-2">No uploads yet. Drop a PDF above or pick a sample.</p>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
