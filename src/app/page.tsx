"use client";
import { useCallback, useRef, useState } from "react";
import { Mark } from "@/components/shell/Mark";
import { Theatre } from "@/components/proof/Theatre";
import { InvoiceDrawer } from "@/components/proof/InvoiceDrawer";
import { UploadSection } from "@/components/proof/UploadSection";
import { ProofSection } from "@/components/proof/ProofSection";
import { HistorySection } from "@/components/proof/HistorySection";
import type { BatchResult, BatchScore } from "@/lib/batch/run";

const NAV = [
  { href: "#stage", label: "Stress test" },
  { href: "#upload", label: "Real invoice" },
  { href: "#proof", label: "How it's proven" },
  { href: "#history", label: "History" },
];

export default function Home() {
  const [open, setOpen] = useState<BatchResult | null>(null);
  const [month, setMonth] = useState<{ score: BatchScore; results: BatchResult[] } | null>(null);
  const [tick, setTick] = useState(0);
  const startRef = useRef<((seed: number) => void) | null>(null);

  const onComplete = useCallback((score: BatchScore, results: BatchResult[]) => {
    setMonth({ score, results });
    setTick((t) => t + 1);
  }, []);
  const registerStart = useCallback((fn: (seed: number) => void) => {
    startRef.current = fn;
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-rule/70 bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 sm:px-8">
          <a href="#stage" className="flex items-center gap-2.5 font-semibold tracking-[-0.01em]" aria-label="Verdict, back to the top">
            <Mark />
            <span className="text-[15px]">Verdict</span>
          </a>
          <nav aria-label="Sections" className="-mx-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_80%,transparent)] sm:[mask-image:none]">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-raised hover:text-ink">
                {n.label}
              </a>
            ))}
          </nav>
          <span className="hidden text-[12.5px] text-ink-3 md:block">Every invoice, a reasoned decision</span>
        </div>
      </header>

      <main>
        <Theatre onOpen={setOpen} onComplete={onComplete} registerStart={registerStart} />
        <UploadSection onRun={() => setTick((t) => t + 1)} />
        <ProofSection score={month?.score ?? null} results={month?.results ?? []} onOpen={setOpen} />
        <HistorySection tick={tick} onReplay={(s) => startRef.current?.(s)} />
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-8 text-[12.5px] text-ink-3 sm:px-8">
          <p>
            Built by Shagun Choudhary for the Zamp AI Solutions case study (PS-1). The AI reads, rules decide, the AI explains.
          </p>
          <p>Gemini 3.8 Flash reads · deterministic rules decide · synthetic data, real runs</p>
        </div>
      </footer>

      <InvoiceDrawer result={open} onClose={() => setOpen(null)} />
    </>
  );
}
