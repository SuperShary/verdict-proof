"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Renders a PDF to canvases with pdf.js, so the document shows the same way in every browser
 * (embedded viewers are missing in some, and each styles its own toolbar).
 */
export function PdfView({ url, title }: { url: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    if (!el) return;
    setState("loading");
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        el.replaceChildren();
        const width = el.clientWidth - 32;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = `${width}px`;
          canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
          canvas.className = "mx-auto block rounded-sm bg-white shadow-lift";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title}, page ${i} of ${doc.numPages}`);
          el.appendChild(canvas);
          await page.render({ canvas, viewport: vp }).promise;
        }
        if (!cancelled) setState("ready");
      } catch (e) {
        console.error("PDF preview failed", e);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, title]);

  return (
    <div className="relative min-h-0 flex-1 overflow-auto bg-surface">
      <div ref={host} className="flex flex-col gap-4 p-4" />
      {state === "loading" && <p className="absolute inset-x-0 top-6 text-center text-[12.5px] text-ink-3">Rendering document…</p>}
      {state === "error" && (
        <p className="absolute inset-x-0 top-6 px-6 text-center text-[12.5px] text-ink-2">
          This PDF can&apos;t be previewed here, but it was still processed.{" "}
          <a href={url} target="_blank" rel="noreferrer" className="underline">Open the file</a>
        </p>
      )}
    </div>
  );
}
