import { describe, expect, it } from "vitest";
import { SAMPLES } from "@/data/samples";
import { VENDORS } from "@/data/vendors";
import { PURCHASE_ORDERS } from "@/data/purchase-orders";
import { RECEIPTS } from "@/data/receipts";
import { evaluate, toHistoryEntry } from "@/lib/pipeline/evaluate";
import { DEFAULT_SETTINGS, type HistoryEntry } from "@/lib/types";

const master = { vendors: VENDORS, pos: PURCHASE_ORDERS, receipts: RECEIPTS };
const today = new Date("2026-09-24T12:00:00Z");

/** Runs every sample in demo order, carrying history forward like the real app does. */
function runAll() {
  const history: HistoryEntry[] = [];
  return SAMPLES.map((s, i) => {
    const out = evaluate({ extraction: s.truth, fileHash: `hash-${s.id}`, senderEmail: s.senderEmail, history, settings: DEFAULT_SETTINGS, master, today });
    history.push(toHistoryEntry({ id: `run-${i}`, createdAt: i, fileHash: `hash-${s.id}`, normalized: out.normalized, match: out.match, decision: out.decision, override: null }));
    return { s, out };
  });
}

describe("demo scenarios (ground truth through the rules engine)", () => {
  for (const { s, out } of runAll()) {
    it(`${s.id}: ${s.title} → ${s.expected}`, () => {
      expect(out.decision.outcome, out.decision.headline).toBe(s.expected);
      for (const r of s.expectedReasons) expect(out.decision.reasons).toContain(r);
    });
  }
});

describe("rule details", () => {
  const results = Object.fromEntries(runAll().map(({ s, out }) => [s.id, out]));

  it("E1b reports the cumulative PO position", () => {
    const m = results.E1b.match!;
    expect(m.billedToDate).toBe(24000);
    expect(m.billedAfter).toBe(44750);
    expect(results.E1b.decision.routeTo).toBe("Procurement");
  });

  it("E2 surfaces two ranked candidates instead of guessing", () => {
    expect(results.E2.normalized.vendor?.id).toBe("V-GREENLEAF");
    expect(results.E2.match?.poId).toBeNull(); // ambiguous → no PO bound
    expect(results.E2.match?.candidates.slice(0, 2).map((c) => c.poId).sort()).toEqual(["PO-1060", "PO-1061"]);
    const check = results.E2.checks.match!.find((c) => c.code === "PO_AMBIGUOUS")!;
    expect(check.detail).toMatch(/PO-1060|PO-1061/);
  });

  it("E4 blocks and routes to the finance controller", () => {
    expect(results.E4.decision.routeTo).toBe("Finance controller");
  });

  it("the same file twice is an exact duplicate", () => {
    const h1 = SAMPLES[0];
    const first = evaluate({ extraction: h1.truth, fileHash: "same", senderEmail: h1.senderEmail, history: [], settings: DEFAULT_SETTINGS, master, today });
    const again = evaluate({
      extraction: h1.truth,
      fileHash: "same",
      senderEmail: h1.senderEmail,
      history: [toHistoryEntry({ id: "r1", createdAt: 1, fileHash: "same", normalized: first.normalized, match: first.match, decision: first.decision, override: null })],
      settings: DEFAULT_SETTINGS,
      master,
      today,
    });
    expect(again.decision.reasons).toContain("DUPLICATE_FILE");
    expect(again.decision.outcome).toBe("REJECT");
  });

  it("low confidence on a critical field holds, never approves", () => {
    const h1 = SAMPLES[0].truth;
    const out = evaluate({ extraction: { ...h1, confidence: { ...h1.confidence, total: 0.42 } }, fileHash: "x", senderEmail: null, history: [], settings: DEFAULT_SETTINGS, master, today });
    expect(out.decision.outcome).toBe("HOLD");
    expect(out.decision.reasons).toContain("LOW_CONFIDENCE");
  });

  it("price variance beyond tolerance holds for procurement", () => {
    const h2 = SAMPLES[1].truth;
    const lines = h2.lineItems.map((l) => (l.sku === "BL-220" ? { ...l, unitPrice: 3.6, amount: 1080 } : l));
    const out = evaluate({ extraction: { ...h2, lineItems: lines, subtotal: 7080, taxAmount: 495.6, total: 7575.6 }, fileHash: "y", senderEmail: null, history: [], settings: DEFAULT_SETTINGS, master, today });
    expect(out.decision.reasons).toContain("PRICE_VARIANCE");
    expect(out.decision.outcome).toBe("HOLD");
  });
});
