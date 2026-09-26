import { describe, expect, it } from "vitest";
import { isLookalikeDomain, normalizeInvoiceNumber, tokenOverlap } from "@/lib/util/text";
import { matchVendor, netAmount } from "@/lib/pipeline/normalize";
import { VENDORS } from "@/data/vendors";
import { SAMPLES } from "@/data/samples";

describe("normalizeInvoiceNumber", () => {
  it("treats formatting variants as the same invoice", () => {
    for (const v of ["INV-0042", "INV 42", "inv0042", "Invoice #42", "0042"]) expect(normalizeInvoiceNumber(v)).toBe("42");
  });
  it("identifies reformatted resubmissions by their digits", () => {
    for (const v of ["BLP-004567", "BLP 4567", "blp004567", "#4567", "BLP/4567"]) expect(normalizeInvoiceNumber(v)).toBe("4567");
    expect(normalizeInvoiceNumber("A-12")).toBe("A12");
    expect(normalizeInvoiceNumber(null)).toBeNull();
  });
});

describe("isLookalikeDomain", () => {
  it("flags character swaps, typos and TLD swaps", () => {
    expect(isLookalikeDomain("c0rtex-supply.com", "cortex-supply.com")).toBe(true);
    expect(isLookalikeDomain("cortex-suppIy.com", "cortex-supply.com")).toBe(true);
    expect(isLookalikeDomain("cortex-supply.co", "cortex-supply.com")).toBe(true);
    expect(isLookalikeDomain("cortexx-supply.com", "cortex-supply.com")).toBe(true);
    expect(isLookalikeDomain("greenleafproduce-billing.com", "greenleafproduce.com")).toBe(true);
  });
  it("does not flag the real domain or unrelated domains", () => {
    expect(isLookalikeDomain("cortex-supply.com", "cortex-supply.com")).toBe(false);
    expect(isLookalikeDomain("gmail.com", "cortex-supply.com")).toBe(false);
  });
});

describe("vendor + amounts", () => {
  it("matches vendors through legal suffixes and aliases", () => {
    expect(matchVendor("Brightline Packaging LLC", VENDORS)?.vendor.id).toBe("V-BRIGHTLINE");
    expect(matchVendor("SUMMIT FREIGHT AND LOGISTICS INC.", VENDORS)?.vendor.id).toBe("V-SUMMIT");
    expect(matchVendor("Totally Unknown Traders", VENDORS)).toBeNull();
  });
  it("removes embedded tax from tax-inclusive totals", () => {
    const e2 = SAMPLES.find((s) => s.id === "E2")!.truth;
    expect(netAmount(e2)).toBe(4885);
  });
  it("token overlap is symmetric and bounded", () => {
    const a = tokenOverlap("Roma tomatoes, 25lb case", "Roma tomatoes 25lb case");
    expect(a).toBe(1);
    expect(tokenOverlap("abc", "")).toBe(0);
  });
});
