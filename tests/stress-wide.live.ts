import { it } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { generateBatch } from "@/lib/batch/generate";
import { runBatch } from "@/lib/batch/run";

/**
 * The out-of-sample check (npm run stress:wide): 1,000 distinct months the rules were never fixed against
 * (seeds 7919·1 … 7919·1000), scored the same way as the page.
 * Writes src/data/stress-wide.json, which the proof section renders.
 */
it("holds on 1,000 unseen months", () => {
  const days = ["2026-09-26T12:00:00Z"];
  const a = { months: 0, invoices: 0, planted: 0, caught: 0, missed: 0, wrongOutcome: 0, clean: 0, falseAlarms: 0, trapFalseAlarms: 0 };
  const t0 = performance.now();
  for (const d of days) {
    const today = new Date(d);
    for (let i = 1; i <= 1000; i++) {
      const { results, score } = runBatch(generateBatch(i * 7919, 100, today), undefined, today);
      a.months++;
      a.invoices += score.n;
      a.planted += score.planted;
      a.caught += score.caught;
      a.missed += score.missed;
      a.wrongOutcome += score.stoppedWrongOutcome;
      a.clean += score.cleanTotal;
      a.falseAlarms += score.falseAlarms;
      a.trapFalseAlarms += results.filter((r) => r.verdict === "false_alarm" && r.invoice.kind === "recurring_legit").length;
    }
  }
  const out = { ranAt: new Date().toISOString(), seeds: "7919 × 1…1000", days: days.map((d) => d.slice(0, 10)), ...a, ms: Math.round(performance.now() - t0) };
  writeFileSync(path.resolve(import.meta.dirname, "../src/data/stress-wide.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(out);
}, 120_000);
