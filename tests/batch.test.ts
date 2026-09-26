import { describe, expect, it } from "vitest";
import { generateBatch } from "@/lib/batch/generate";
import { runBatch } from "@/lib/batch/run";

const today = new Date("2026-09-26T12:00:00Z");

describe("batch generator", () => {
  it("is deterministic for a seed", () => {
    const a = generateBatch(424242, 100, today);
    const b = generateBatch(424242, 100, today);
    expect(JSON.stringify(a.invoices)).toBe(JSON.stringify(b.invoices));
    expect(a.invoices).toHaveLength(100);
  });

  it("different seeds give different months", () => {
    const a = generateBatch(1, 100, today);
    const b = generateBatch(2, 100, today);
    expect(JSON.stringify(a.invoices)).not.toBe(JSON.stringify(b.invoices));
  });

  it("plants a realistic share of problems", () => {
    const w = generateBatch(777, 100, today);
    const planted = w.invoices.filter((i) => i.expected !== "APPROVE").length;
    expect(planted).toBeGreaterThan(20);
    expect(planted).toBeLessThan(65);
  });
});

describe("rules stress test", () => {
  // Prints the per-case report and fails if any planted problem is approved or the pinned numbers drift.
  it("reports scores across 20 seeds", () => {
    const rows = Array.from({ length: 20 }, (_, i) => runBatch(generateBatch(1000 + i, 100, today), undefined, today).score);
    const sum = (f: (s: (typeof rows)[number]) => number) => rows.reduce((a, s) => a + f(s), 0);
    const planted = sum((s) => s.planted);
    const caught = sum((s) => s.caught);
    const missed = sum((s) => s.missed);
    const falseAlarms = sum((s) => s.falseAlarms);
    const clean = sum((s) => s.cleanTotal);
    const byKind = new Map<string, { c: number; n: number }>();
    for (const s of rows) for (const k of s.byKind) {
      const v = byKind.get(k.label) ?? { c: 0, n: 0 };
      v.c += k.correct;
      v.n += k.count;
      byKind.set(k.label, v);
    }
    console.log(`planted ${planted} · caught ${caught} · missed ${missed} · false alarms ${falseAlarms}/${clean} clean`);
    for (const [k, v] of [...byKind.entries()].sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n)) console.log(`${String(Math.round((v.c / v.n) * 100)).padStart(3)}%  ${v.c}/${v.n}  ${k}`);
    expect(missed).toBe(0);
    expect(caught).toBe(planted);
    expect(falseAlarms / clean).toBeLessThan(0.06);
  });
});
