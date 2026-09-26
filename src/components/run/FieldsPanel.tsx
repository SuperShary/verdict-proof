"use client";
import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import type { Extraction, ExtractedField } from "@/lib/types";
import { usd } from "@/lib/util/text";

const ROWS: { key: ExtractedField; label: string; money?: boolean }[] = [
  { key: "vendorName", label: "Vendor" },
  { key: "invoiceNumber", label: "Invoice no." },
  { key: "invoiceDate", label: "Date" },
  { key: "poReference", label: "PO reference" },
  { key: "subtotal", label: "Subtotal", money: true },
  { key: "taxAmount", label: "Tax", money: true },
  { key: "total", label: "Total", money: true },
  { key: "bankAccountNumber", label: "Remit-to account" },
];

/** What Gemini read: value, calibrated confidence against the threshold, and the verbatim evidence behind it. Frameless. */
export function FieldsPanel({ e, threshold }: { e: Extraction; threshold: number }) {
  return (
    <section aria-label="Extracted fields">
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <h2 className="text-[13px] font-semibold">What was read</h2>
        <span className="font-mono text-[11px] text-ink-3">
          {e.docType.replace("_", " ")}
          {e.isScanned ? " · scan" : ""}
          {e.taxInclusive ? " · tax incl." : ""} · threshold {threshold.toFixed(2)}
        </span>
      </header>
      <dl>
        {ROWS.map(({ key, label, money }) => {
          const raw = e[key as keyof Extraction] as string | number | null;
          const conf = e.confidence[key] ?? 0;
          const low = raw != null && conf < threshold;
          const value = raw == null ? null : money ? usd(raw as number) : String(raw);
          return (
            <div key={key} className="grid grid-cols-[104px_1fr_76px] items-start gap-x-3 border-b border-rule px-4 py-2 last:border-b-0">
              <dt className="pt-px text-[12px] text-ink-3">{label}</dt>
              <dd className="min-w-0">
                {value ? <span className={clsx("num break-words text-[13px] font-medium", low && "text-hold")}>{value}</span> : <span className="text-[13px] text-ink-3">Not on document</span>}
                {e.evidence[key] && (
                  <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-3" title={e.evidence[key]}>
                    “{e.evidence[key]}”
                  </span>
                )}
              </dd>
              <dd className="pt-0.5" aria-label={raw != null ? `Confidence ${conf.toFixed(2)}${low ? ", below threshold" : ""}` : undefined}>
                {raw != null && (
                  <>
                    <span className={clsx("num flex items-center justify-end gap-1 font-mono text-[11px]", low ? "text-hold" : "text-ink-2")}>
                      {low && <TriangleAlert className="size-3" aria-hidden="true" />}
                      {low && "low "}
                      {conf.toFixed(2)}
                    </span>
                    <span className="relative mt-1 block h-[2px] bg-rule">
                      <span className={clsx("absolute inset-y-0 left-0", low ? "bg-hold-mark" : "bg-ink")} style={{ width: `${Math.round(conf * 100)}%` }} />
                      <span className="absolute -top-[3px] h-2 w-px bg-ink-3" style={{ left: `${threshold * 100}%` }} aria-hidden="true" />
                    </span>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {e.lineItems.length > 0 && (
        <div className="border-t border-rule px-4 py-3">
          <h3 className="text-[12px] text-ink-3">
            {e.lineItems.length} line item{e.lineItems.length > 1 ? "s" : ""}
          </h3>
          <ul className="mt-1.5 space-y-1">
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
        </div>
      )}
      {e.notes && (
        <p className="border-t border-rule px-4 py-3 text-[12.5px] text-ink-2">
          <span className="text-ink-3">Reader&apos;s note: </span>
          {e.notes}
        </p>
      )}
    </section>
  );
}
