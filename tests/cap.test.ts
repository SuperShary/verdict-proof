import { describe, expect, it } from "vitest";
import { dailyCap, DEFAULT_DAILY_CAP } from "@/lib/ai/capLimit";

describe("daily run cap", () => {
  it("falls back to the default for unset, blank, zero, negative or junk values", () => {
    for (const raw of [undefined, "", "  ", "0", "-5", "abc", "NaN"]) expect(dailyCap(raw)).toBe(DEFAULT_DAILY_CAP);
  });
  it("uses a positive number as given", () => {
    expect(dailyCap("50")).toBe(50);
    expect(dailyCap(" 12.9 ")).toBe(12);
  });
});
