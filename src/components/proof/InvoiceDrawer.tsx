"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import type { BatchResult } from "@/lib/batch/run";
import { OUTCOME_META, OutcomeChip } from "@/components/ui/Outcome";
import { CheckRow } from "@/components/run/StageLedger";
import { STAGES } from "@/lib/pipeline/stages";
import { RULE_BY_CODE } from "@/lib/rules/catalog";
import { usd } from "@/lib/util/text";
import { VERDICT_TEXT } from "./Theatre";

const VERDICT_TONE = { correct: "bg-approve-soft text-approve", missed: "bg-reject-soft text-reject", false_alarm: "bg-hold-soft text-hold", wrong_call: "bg-hold-soft text-hold" } as const;

/** Everything about one batch invoice: the hidden answer, the engine's decision, and every rule that fired. */
export function InvoiceDrawer({ result, onClose }: { result: BatchResult | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (result && !d.open) d.showModal();
    if (!result && d.open) d.close();
  }, [result]);

  const r = result;
  const e = r?.invoice.extraction;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(ev) => {
        if (ev.target === ref.current) onClose();
      }}
      className="fixed inset-y-0 right-0 m-0 ml-auto h-dvh max-h-dvh w-full max-w-[560px] overflow-y-auto border-l border-rule bg-surface p-0 text-ink backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {r && e && (
        <div className="rise">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-rule bg-surface/90 px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <p className="num font-mono text-[12px] text-ink-3">
                {r.invoice.id} · {e.invoiceNumber ?? "no invoice number"}
              </p>
              <h2 className="mt-0.5 truncate text-[18px] font-semibold tracking-[-0.02em]">{e.vendorName ?? "Unknown vendor"}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-ink-2 transition-colors hover:bg-raised hover:text-ink">
              <X className="size-5" />
            </button>
          </header>

          <div className="space-y-5 px-5 py-5">
            <div className={clsx("rounded-lg px-4 py-3 text-[13.5px] font-medium", VERDICT_TONE[r.verdict])}>{VERDICT_TEXT[r.verdict]}</div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-raised p-3 shadow-[inset_0_0_0_1px_var(--rule)]">
                <p className="text-[11.5px] text-ink-3">Answer key (hidden from the engine)</p>
                <p className="mt-1.5">
                  <OutcomeChip outcome={r.invoice.expected} size="sm" />
                </p>
                <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{r.invoice.plantedNote}</p>
              </div>
              <div className="rounded-lg bg-raised p-3 shadow-[inset_0_0_0_1px_var(--rule)]">
                <p className="text-[11.5px] text-ink-3">Engine decided</p>
                <p className="mt-1.5">
                  <OutcomeChip outcome={r.decision.outcome} size="sm" />
                </p>
                <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{r.decision.headline.replace(/^\w+:\s*/, "")}</p>
                {r.decision.routeTo !== "—" && <p className="mt-1 text-[12px] text-ink-3">Routed to {r.decision.routeTo}</p>}
              </div>
            </div>

            {r.decision.reasons.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Reason codes">
                {r.decision.reasons.map((c) => (
                  <li key={c} title={RULE_BY_CODE[c].why} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--rule)]">
                    {c}
                  </li>
                ))}
              </ul>
            )}

            <section>
              <h3 className="text-[12px] font-medium text-ink-3">The invoice (as fed to the engine)</h3>
              <dl className="mt-2 grid grid-cols-[120px_1fr] gap-y-1.5 text-[13px]">
                {[
                  ["Document", e.docType.replace("_", " ")],
                  ["Invoice no.", e.invoiceNumber ?? "missing"],
                  ["Date", e.invoiceDate ?? "missing"],
                  ["PO reference", e.poReference ?? "none printed"],
                  ["Sender", r.invoice.senderEmail ?? "direct upload"],
                  ["Remit-to", e.bankAccountNumber ? `${e.bankName ?? ""} ••${e.bankAccountNumber.replace(/\D/g, "").slice(-4)}` : "not printed"],
                  ["Tax", e.taxInclusive ? `${e.taxRate}% included in prices` : e.taxAmount != null ? `${usd(e.taxAmount)} (${e.taxRate}%)` : "—"],
                  ["Total", e.total != null ? usd(e.total) : "missing"],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="num min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-3 space-y-1 border-t border-rule pt-3">
                {e.lineItems.map((l, i) => (
                  <li key={i} className="num flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="min-w-0 truncate text-ink-2">
                      {l.sku && <span className="mr-1.5 font-mono text-[11px] text-ink-3">{l.sku}</span>}
                      {l.description}
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px]">
                      {l.qty ?? "—"} × {l.unitPrice != null ? usd(l.unitPrice) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-[12px] font-medium text-ink-3">Every rule that ran</h3>
              <ol className="mt-2 space-y-3">
                {STAGES.filter((s) => r.checks.some((c) => c.stage === s.id)).map((s) => (
                  <li key={s.id}>
                    <p className="text-[12.5px] font-semibold">
                      <span className="num mr-2 font-mono text-[11px] text-ink-3">{String(s.n).padStart(2, "0")}</span>
                      {s.name}
                    </p>
                    <ul className="mt-1 border-l border-rule pl-3">
                      {r.checks
                        .filter((c) => c.stage === s.id)
                        .map((c, i) => (
                          <CheckRow key={i} c={c} />
                        ))}
                    </ul>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[12px] text-ink-3">
                Decided in {(r.microseconds / 1000).toFixed(2)} ms · outcome {OUTCOME_META[r.decision.outcome].past.toLowerCase()} because the most severe failing rule wins (block &gt; reject &gt; hold).
              </p>
            </section>
          </div>
        </div>
      )}
    </dialog>
  );
}
