"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import clsx from "clsx";
import { SAMPLES, type Sample } from "@/data/samples";
import { VENDORS } from "@/data/vendors";
import { PURCHASE_ORDERS } from "@/data/purchase-orders";
import { RECEIPTS } from "@/data/receipts";
import { db, saveRun } from "@/lib/store/db";
import { useLive } from "@/lib/store/live";
import { runPipeline } from "@/lib/pipeline/run";
import { toHistoryEntry } from "@/lib/pipeline/evaluate";
import { DEFAULT_SETTINGS, type Run } from "@/lib/types";
import { StageLedger } from "@/components/run/StageLedger";
import { VerdictPanel } from "@/components/run/VerdictPanel";
import { FieldsPanel } from "@/components/run/FieldsPanel";
import { PdfView } from "@/components/run/PdfView";
import { OutcomeChip } from "@/components/ui/Outcome";

const MASTER = { vendors: VENDORS, pos: PURCHASE_ORDERS, receipts: RECEIPTS };

/** The real pipeline on a real PDF: Gemini reads it, the same rules decide, every stage streams live. */
export function UploadSection({ onRun }: { onRun: () => void }) {
  const live = useLive();
  const [history, setHistory] = useState<Run[]>([]);
  const [sender, setSender] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ai, setAi] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setHistory(await db.runs.orderBy("createdAt").toArray()), []);
  useEffect(() => {
    load();
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setAi(Boolean(j.ai)))
      .catch(() => setAi(false));
  }, [load]);

  const readable = useMemo(() => history.filter((r) => r.extraction), [history]);
  const ranSamples = useMemo(() => new Map(readable.filter((r) => r.sampleId).map((r) => [r.sampleId!, r])), [readable]);
  const running = live.status === "running";

  async function execute(blob: Blob, fileName: string, sampleId: string | null, senderEmail: string | null) {
    setError(null);
    live.start(fileName, URL.createObjectURL(blob));
    try {
      const run = await runPipeline(blob, { fileName, sampleId, senderEmail, history: readable.map(toHistoryEntry), settings: DEFAULT_SETTINGS, master: MASTER, onEvent: live.update });
      await saveRun(run, blob);
      live.finish(run);
      await load();
      onRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      live.clear();
    }
  }

  async function runSample(s: Sample) {
    if (running) return;
    setSender(s.senderEmail ?? "");
    const blob = await (await fetch(`/samples/${s.file}`)).blob();
    await execute(blob, s.file, s.id, s.senderEmail);
  }

  async function runFile(f: File | undefined) {
    if (!f || running) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("That file isn't a PDF. Verdict reads invoice PDFs, digital or scanned.");
      return;
    }
    await execute(f, f.name, null, sender.trim() || null);
  }

  const run = live.run;

  return (
    <section id="upload" aria-labelledby="upload-h" className="border-b border-rule">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <h2 id="upload-h" className="text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]">
              Now drop a real invoice.
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-ink-2">
              Gemini 3.8 Flash reads the actual document (clean PDFs, scans, tax inside the total) and the same rules decide. Watch all nine stages run. Invoices are checked against the demo company&apos;s vendor master (Halcyon Foods), so a PDF from a vendor that isn&apos;t onboarded is correctly held for procurement.
            </p>
          </div>
          <div className="lg:justify-self-end">
            {ai === false && (
              <p role="status" className="rounded-lg bg-hold-soft px-4 py-3 text-[13px] text-hold">
                Reading is switched off on this deployment (no Gemini key). Every stage still runs, and an unreadable document is held, never approved.
              </p>
            )}
          </div>
        </div>

        <div className="-mx-4 mt-8 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:-mx-8 sm:px-8 xl:mx-0 xl:overflow-visible xl:px-0 xl:[mask-image:none]">
          <ol className="grid auto-cols-[184px] grid-flow-col gap-2 pr-10 xl:grid-flow-row xl:grid-cols-9 xl:pr-0" aria-label="Sample invoices, in demo order">
            {SAMPLES.map((s) => {
              const done = ranSamples.get(s.id);
              const current = live.fileName === s.file;
              return (
                <li key={s.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => runSample(s)}
                    disabled={running}
                    title={s.scenario}
                    className={clsx(
                      "flex h-full w-full flex-col items-start rounded-md border px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 disabled:cursor-not-allowed",
                      current ? "border-ink bg-raised" : "border-rule bg-surface hover:border-rule-strong hover:bg-raised",
                    )}
                  >
                    <span className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="font-mono text-[11px] text-ink-3">{s.id}</span>
                      {done ? <OutcomeChip outcome={done.decision.outcome} size="sm" /> : <span className="text-[11px] text-ink-3">expects {s.expected.toLowerCase()}</span>}
                    </span>
                    <span className="mt-1 text-balance text-[13px] font-medium leading-tight">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-reject/30 bg-reject-soft px-4 py-3 text-[13px] text-reject">
            {error}
          </p>
        )}

        <div className="mt-5 grid overflow-clip rounded-lg border border-rule bg-raised lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <section
            aria-label="Document"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              runFile(e.dataTransfer.files[0]);
            }}
            className={clsx("min-w-0 border-b border-rule bg-surface lg:border-b-0 lg:border-r", dragging && "shadow-[inset_0_0_0_2px_var(--live)]")}
          >
            <div className="flex min-h-[560px] flex-col lg:sticky lg:top-14 lg:max-h-[calc(100dvh-3.5rem)]">
              <header className="flex items-center justify-between gap-3 border-b border-rule bg-raised px-4 py-2.5">
                <h3 className="min-w-0 truncate font-mono text-[12px] text-ink-2">{live.fileName ?? "No document"}</h3>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={running}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[12.5px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {running ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <FileUp className="size-3.5" aria-hidden="true" />} Upload PDF
                </button>
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => runFile(e.target.files?.[0])} />
              </header>
              {live.fileUrl ? (
                <PdfView url={live.fileUrl} title={live.fileName ?? "Invoice"} />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
                  <div className="grid size-12 place-items-center rounded-full border border-dashed border-rule-strong">
                    <FileUp className="size-5 text-ink-3" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium">Drop an invoice PDF here, or pick a sample above</p>
                    <p className="mt-1 max-w-[42ch] text-[13px] text-ink-2">Digital or scanned. Say who sent it and the sender check runs too.</p>
                  </div>
                  <label className="w-full max-w-[300px] text-left">
                    <span className="text-[12px] text-ink-3">Sender email (optional)</span>
                    <input
                      value={sender}
                      onChange={(e) => setSender(e.target.value)}
                      placeholder="billing@vendor.com"
                      className="mt-1 h-9 w-full rounded-md border border-rule bg-canvas px-3 font-mono text-[12.5px] outline-none transition-colors placeholder:text-ink-3 focus:border-live"
                    />
                  </label>
                </div>
              )}
            </div>
          </section>

          <div className="min-w-0 border-b border-rule xl:border-b-0 xl:border-r">
            <StageLedger stages={live.stages} checks={run?.checks ?? []} totalMs={run?.durationMs} />
            {run?.extraction && (
              <div className="border-t border-rule">
                <FieldsPanel e={run.extraction} threshold={DEFAULT_SETTINGS.confidenceThreshold} />
              </div>
            )}
          </div>

          <div className={clsx("min-w-0 lg:col-span-2 xl:col-span-1", run && "order-first border-b border-rule lg:order-none lg:border-b-0")}>
            {run ? (
              <VerdictPanel run={run} showAuditLink={false} />
            ) : (
              <section aria-label="Decision" className="px-5 py-6">
                <h3 className="text-[13px] font-semibold">{running ? "Deciding…" : "No verdict yet"}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
                  {running
                    ? "The verdict lands here the moment the rules finish. Gemini never makes the decision: it reads the document and explains the outcome."
                    : "Run the samples in order: each upload is remembered, so the second split invoice and the resubmitted duplicate behave the way they would in a real AP queue."}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
