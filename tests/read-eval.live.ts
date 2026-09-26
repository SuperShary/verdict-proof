/**
 * Live reading eval: sends the nine sample PDFs to a running app's /api/extract (Gemini) and scores
 * every field against the hand-written answer key, then runs the same rules for the decision.
 * Costs about $0.03. Run: npm run eval:read (the app must be running on EVAL_URL, default :3218).
 */
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLES } from "@/data/samples";
import { VENDORS } from "@/data/vendors";
import { PURCHASE_ORDERS } from "@/data/purchase-orders";
import { RECEIPTS } from "@/data/receipts";
import { compareFields } from "@/lib/evals";
import { evaluate, toHistoryEntry } from "@/lib/pipeline/evaluate";
import { DEFAULT_SETTINGS, type Extraction, type HistoryEntry } from "@/lib/types";

const URL = process.env.EVAL_URL ?? "http://localhost:3218";

it("reads the nine samples", { timeout: 300_000 }, async () => {
  const history: HistoryEntry[] = [];
  const rows = [];
  let cost = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const pdf = readFileSync(join(process.cwd(), "public/samples", s.file)).toString("base64");
    const t0 = Date.now();
    const r = await fetch(`${URL}/api/extract`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pdfBase64: pdf, model: DEFAULT_SETTINGS.model }) });
    const j = (await r.json()) as { extraction?: Extraction; costUsd?: number; error?: string };
    if (!j.extraction) throw new Error(`${s.id}: ${j.error}`);
    cost += j.costUsd ?? 0;
    const out = evaluate({ extraction: j.extraction, fileHash: `eval-${s.id}`, senderEmail: s.senderEmail, history, settings: DEFAULT_SETTINGS, master: { vendors: VENDORS, pos: PURCHASE_ORDERS, receipts: RECEIPTS } });
    history.push(toHistoryEntry({ id: `e${i}`, createdAt: i, fileHash: `eval-${s.id}`, normalized: out.normalized, match: out.match, decision: out.decision, override: null }));
    const fields = compareFields(j.extraction, s.truth);
    rows.push({ id: s.id, ms: Date.now() - t0, fields, expected: s.expected, got: out.decision.outcome });
    console.log(`${s.id} ${fields.filter((f) => f.ok).length}/${fields.length} ${out.decision.outcome}`);
  }
  const all = rows.flatMap((r) => r.fields);
  const result = {
    ranAt: new Date().toISOString(),
    model: DEFAULT_SETTINGS.model,
    samples: rows.length,
    fieldsCorrect: all.filter((f) => f.ok).length,
    fieldsTotal: all.length,
    decisionsCorrect: rows.filter((r) => r.expected === r.got).length,
    costUsd: Math.round(cost * 10000) / 10000,
    rows,
  };
  writeFileSync(join(process.cwd(), "src/data/read-eval.json"), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ ...result, rows: undefined }));
});
