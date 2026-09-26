"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Dices, FastForward, FlaskConical, Play, RotateCcw } from "lucide-react";
import clsx from "clsx";
import type { Outcome } from "@/lib/types";
import { generateBatch, newSeed } from "@/lib/batch/generate";
import { runBatch, type BatchResult, type BatchScore } from "@/lib/batch/run";
import { OUTCOME_META } from "@/components/ui/Outcome";
import { ShaderStage } from "./ShaderStage";
import { usd } from "@/lib/util/text";
import { saveBatch } from "@/lib/store/db";

const LANES: Outcome[] = ["APPROVE", "HOLD", "REJECT", "BLOCK"];
const STEP_MS = 70;

const LANE_STYLE: Record<Outcome, { tile: string; ring: string; label: string; lane: string; icon: string }> = {
  APPROVE: { tile: "bg-approve/85", ring: "ring-ink ring-offset-canvas", label: "text-approve", lane: "bg-canvas/30 shadow-[inset_0_0_0_1px_var(--rule)]", icon: "" },
  HOLD: { tile: "bg-hold-mark/90", ring: "ring-ink ring-offset-canvas", label: "text-hold", lane: "bg-canvas/30 shadow-[inset_0_0_0_1px_var(--rule)]", icon: "" },
  REJECT: { tile: "bg-reject/90", ring: "ring-ink ring-offset-canvas", label: "text-reject", lane: "bg-canvas/30 shadow-[inset_0_0_0_1px_var(--rule)]", icon: "" },
  // Blocked is the one inverted, paper-white panel on the stage.
  BLOCK: { tile: "bg-block-fg", ring: "ring-block-mark ring-offset-block", label: "text-block-fg", lane: "bg-block text-block-fg shadow-[0_24px_60px_-24px_rgb(229_72_77/0.45)]", icon: "text-block-mark" },
};

export const VERDICT_TEXT = { correct: "Matches the answer key", missed: "Missed: approved a planted problem", false_alarm: "False alarm: stopped a clean invoice", wrong_call: "Stopped, but with a different outcome" } as const;

function partialScore(done: BatchResult[]) {
  const planted = done.filter((r) => r.invoice.expected !== "APPROVE");
  const clean = done.length - planted.length;
  const total = (r: BatchResult) => r.invoice.extraction.total ?? r.normalized.netAmount ?? 0;
  return {
    planted: planted.length,
    caught: planted.filter((r) => r.verdict === "correct").length,
    stoppedOther: planted.filter((r) => r.verdict === "wrong_call").length,
    missed: planted.filter((r) => r.verdict === "missed").length,
    clean,
    falseAlarms: done.filter((r) => r.verdict === "false_alarm").length,
    stopped: planted.filter((r) => r.decision.outcome !== "APPROVE").reduce((a, r) => a + total(r), 0),
  };
}

export function Theatre({ onOpen, onComplete, registerStart }: { onOpen: (r: BatchResult) => void; onComplete: (score: BatchScore, results: BatchResult[]) => void; registerStart?: (fn: (seed: number) => void) => void }) {
  const [seed, setSeed] = useState<number | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [data, setData] = useState<{ results: BatchResult[]; score: BatchScore } | null>(null);
  const [shown, setShown] = useState(0);
  const pulses = useRef<number[]>([0, 0, 0, 0]);
  // Lane centres as a fraction of the stage width (+ whether they sit in one row), read by the shader.
  const lanes = useRef<number[]>([0.125, 0.375, 0.625, 0.875, 1]);
  const lanesRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stage = useRef<HTMLElement>(null);
  const started = useRef(false);

  const playing = !!data && shown < data.results.length;

  const start = useCallback((s: number) => {
    if (timer.current) clearInterval(timer.current);
    const out = runBatch(generateBatch(s, 100), undefined, new Date());
    setSeed(s);
    setSeedInput(String(s));
    setData(out);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(out.results.length);
      return;
    }
    setShown(0);
    let i = 0;
    timer.current = setInterval(() => {
      i++;
      const r = out.results[i - 1];
      if (r) pulses.current[LANES.indexOf(r.decision.outcome)] += 0.55;
      setShown(i);
      if (i >= out.results.length && timer.current) clearInterval(timer.current);
    }, STEP_MS);
  }, []);

  useEffect(() => {
    registerStart?.((s) => {
      started.current = true;
      start(s);
      stage.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [registerStart, start]);

  useEffect(() => {
    const grid = lanesRef.current;
    const sec = stage.current;
    if (!grid || !sec) return;
    const measure = () => {
      const box = sec.getBoundingClientRect();
      const kids = Array.from(grid.children) as HTMLElement[];
      const rects = kids.map((k) => k.getBoundingClientRect());
      const oneRow = rects.length === 4 && rects.every((r) => Math.abs(r.top - rects[0].top) < 2);
      lanes.current = [...rects.map((r) => (r.left + r.width / 2 - box.left) / box.width), oneRow ? 1 : 0];
    };
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    ro.observe(grid);
    measure();
    return () => ro.disconnect();
  }, []);

  // First visit: run a fresh month as soon as the stage is on screen.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        start(newSeed());
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer.current) clearInterval(timer.current);
    };
  }, [start]);

  // Persist and report each finished batch once.
  const reported = useRef<number | null>(null);
  useEffect(() => {
    if (!data || shown < data.results.length || reported.current === data.score.seed) return;
    reported.current = data.score.seed;
    saveBatch({ id: `${data.score.seed}-${Date.now()}`, createdAt: Date.now(), seed: data.score.seed, score: data.score }).catch(() => {});
    onComplete(data.score, data.results);
  }, [data, shown, onComplete]);

  const done = useMemo(() => (data ? data.results.slice(0, shown) : []), [data, shown]);
  const live = partialScore(done);
  const current = playing ? data!.results[Math.max(0, shown - 1)] : null;
  const skip = () => {
    if (timer.current) clearInterval(timer.current);
    if (data) setShown(data.results.length);
  };
  const seedValid = /^\d{1,9}$/.test(seedInput.trim());

  return (
    <section ref={stage} id="stage" aria-label="Rules stress test" className="grain relative isolate overflow-hidden border-b border-rule">
      <ShaderStage pulses={pulses} lanes={lanes} active={playing} className="absolute inset-0 -z-10" />

      <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-10 sm:px-8 sm:pt-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h1 className="max-w-[24ch] text-balance text-[36px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[56px]">
              A month of invoices. Problems planted at random.
              <span className="text-ink-3"> Watch it decide.</span>
            </h1>
            <p className="mt-4 max-w-[70ch] text-pretty text-[15px] leading-relaxed text-ink-2">
              Each run generates 100 invoices from a random seed and plants real AP problems: duplicates, over-billed POs, changed bank details, look-alike senders. The engine never sees the answer key. The same rules decide real uploads.
            </p>
            <p className="mt-3 flex max-w-[70ch] items-start gap-2 text-[13px] leading-snug text-ink-3">
              <FlaskConical className="mt-px size-4 shrink-0" aria-hidden="true" />
              Rules stress test: invoice data is generated and fed straight to the decision engine. No PDF reading, no AI, no API cost.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => start(newSeed())}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-canvas transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Dices className="size-4" aria-hidden="true" /> Run a fresh month
              </button>
              {playing ? (
                <button type="button" onClick={skip} className="inline-flex h-11 items-center gap-2 rounded-full border border-rule-strong bg-raised px-4 text-[13px] transition-colors hover:border-ink-3">
                  <FastForward className="size-4" aria-hidden="true" /> Skip to result
                </button>
              ) : (
                seed !== null && (
                  <button type="button" onClick={() => start(seed)} className="inline-flex h-11 items-center gap-2 rounded-full border border-rule-strong bg-raised px-4 text-[13px] transition-colors hover:border-ink-3">
                    <RotateCcw className="size-4" aria-hidden="true" /> Replay this month
                  </button>
                )
              )}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (seedValid) start(Number(seedInput.trim()));
              }}
            >
              <label className="flex items-center gap-2 rounded-full border border-rule-strong bg-raised pl-3 focus-within:border-live">
                <span className="font-mono text-[11.5px] text-ink-3">seed</span>
                <input
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  inputMode="numeric"
                  aria-label="Seed: any number gives its own month of invoices"
                  className="num h-9 w-28 bg-transparent font-mono text-[13px] outline-none"
                />
              </label>
              <button type="submit" disabled={!seedValid} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-ink-2 transition-colors hover:text-ink disabled:opacity-40">
                <Play className="size-3.5" aria-hidden="true" /> Run this seed
              </button>
            </form>
            <p className="max-w-[40ch] text-[12px] text-ink-3 lg:text-right">Pick any number. The same seed always produces the same month, so anyone can reproduce a result.</p>
          </div>
        </div>

        {/* Scoreboard */}
        <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-rule shadow-[inset_0_0_0_1px_var(--rule)] md:grid-cols-5">
          {[
            { k: "Planted problems caught", v: data ? `${live.caught}/${live.planted}` : "—", note: live.stoppedOther ? `+${live.stoppedOther} stopped with a different outcome` : "right outcome, right reason" },
            { k: "Missed", v: data ? String(live.missed) : "—", note: "planted problems that got approved", tone: live.missed ? "text-reject" : "" },
            { k: "False alarms", v: data ? `${live.falseAlarms}` : "—", note: data ? `of ${live.clean} clean invoices` : "clean invoices stopped" },
            { k: "Money stopped", v: data ? usd(live.stopped, { cents: false }) : "—", note: "planted-problem invoices not paid" },
            { k: "Engine time", v: data ? `${data.score.computeMs} ms` : "—", note: "all 100 decided; shown at reading speed" },
          ].map((c) => (
            <div key={c.k} className="bg-canvas/90 px-4 py-4 last:col-span-2 md:last:col-span-1">
              <dt className="text-[12px] text-ink-3">{c.k}</dt>
              <dd className={clsx("num mt-1 text-[30px] font-semibold leading-none tracking-[-0.03em]", c.tone)}>{c.v}</dd>
              <dd className="mt-2 text-[12px] leading-snug text-ink-2">{c.note}</dd>
            </div>
          ))}
        </dl>

        {/* Now deciding */}
        <div className="mt-3 min-h-[60px]" aria-live="polite">
          {current ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-raised px-4 py-3 shadow-[inset_0_0_0_1px_var(--rule)]">
              <span className="num w-12 font-mono text-[12px] text-ink-3">{current.invoice.id}</span>
              <span className="min-w-0 w-[220px] truncate text-[14px] font-medium">{current.normalized.vendor?.name ?? current.invoice.extraction.vendorName}</span>
              <span className="num w-[110px] font-mono text-[13px] text-ink-2">{usd(current.invoice.extraction.total ?? current.normalized.netAmount)}</span>
              {(() => {
                const M = OUTCOME_META[current.decision.outcome];
                return (
                  <motion.span
                    key={current.invoice.id}
                    initial={{ opacity: 0.35 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.08 }}
                    className={clsx("inline-flex w-[104px] items-center gap-1 text-[13px] font-semibold", current.decision.outcome === "BLOCK" ? "text-block-mark" : LANE_STYLE[current.decision.outcome].label)}
                  >
                    <M.Icon className="size-4" strokeWidth={2.6} aria-hidden="true" /> {M.past}
                  </motion.span>
                );
              })()}
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">Answer key: {current.invoice.plantedNote}</span>
            </div>
          ) : data ? (
            <AnimatePresence>
              <motion.p key="done" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="py-3 text-[13px] text-ink-2">
                Month <span className="num font-mono text-ink">#{data.score.seed}</span> decided: {live.caught} of {live.planted} planted problems caught, {live.missed} missed, {live.falseAlarms} false alarm{live.falseAlarms === 1 ? "" : "s"}. Click any tile to see the invoice, the hidden answer and every rule that fired.
              </motion.p>
            </AnimatePresence>
          ) : null}
        </div>

        {/* Lanes */}
        <div ref={lanesRef} className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LANES.map((o) => {
            const inLane = done.filter((r) => r.decision.outcome === o);
            const M = OUTCOME_META[o];
            const amount = inLane.reduce((a, r) => a + (r.invoice.extraction.total ?? r.normalized.netAmount ?? 0), 0);
            return (
              <section key={o} aria-label={`${M.past}: ${inLane.length}`} className={clsx("flex min-h-[170px] flex-col rounded-lg p-3", LANE_STYLE[o].lane)}>
                <header className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className={clsx("inline-flex items-center gap-1.5 text-[14px] font-semibold", LANE_STYLE[o].label)}>
                    <M.Icon className={clsx("size-4", LANE_STYLE[o].icon)} strokeWidth={2.6} aria-hidden="true" /> {M.past}
                  </h2>
                  <span className="num text-[26px] font-semibold leading-none tracking-[-0.03em]">{inLane.length}</span>
                </header>
                <p className={clsx("num mt-1 px-1 font-mono text-[11px]", o === "BLOCK" ? "text-block-fg/60" : "text-ink-3")}>{usd(amount, { cents: false })}</p>
                <ul className="mt-3 flex flex-wrap content-start gap-1.5">
                  {inLane.map((r) => {
                    const off = r.verdict !== "correct";
                    return (
                      <li key={r.invoice.id}>
                        <motion.button
                          type="button"
                          initial={{ scale: 0.3, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 520, damping: 28 }}
                          onClick={() => onOpen(r)}
                          title={`${r.invoice.id} · ${r.normalized.vendor?.name ?? r.invoice.extraction.vendorName} · ${VERDICT_TEXT[r.verdict]}`}
                          aria-label={`${r.invoice.id}, ${M.past}, ${VERDICT_TEXT[r.verdict]}`}
                          className={clsx(
                            "relative block h-6 w-8 rounded-[3px] transition-transform duration-150 hover:scale-125 focus-visible:scale-125",
                            LANE_STYLE[o].tile,
                            off && clsx("ring-2 ring-offset-2", LANE_STYLE[o].ring),
                          )}
                        >
                          {off && <span className={clsx("absolute -right-1 -top-1 size-2 rounded-full", o === "BLOCK" ? "bg-block-mark" : "bg-ink")} aria-hidden="true" />}
                        </motion.button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-3">
          <span className="inline-block h-3 w-4 rounded-[2px] bg-ink-3 ring-2 ring-ink ring-offset-2 ring-offset-canvas" aria-hidden="true" />
          Outlined tiles disagree with the answer key (a miss, a false alarm, or a different outcome). They're shown, not hidden.
        </p>
      </div>
    </section>
  );
}
