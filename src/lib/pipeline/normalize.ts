import type { Extraction, Normalized, Vendor } from "@/lib/types";
import { nameSimilarity, normalizeInvoiceNumber, round2 } from "@/lib/util/text";

export const VENDOR_MATCH_MIN = 0.72;

/** Best vendor-master match for an extracted name (name + aliases). */
export function matchVendor(name: string | null, vendors: Vendor[]): { vendor: Vendor; score: number } | null {
  if (!name) return null;
  let best: { vendor: Vendor; score: number } | null = null;
  for (const v of vendors) {
    const score = Math.max(...[v.name, ...v.aliases].map((n) => nameSimilarity(name, n)));
    if (!best || score > best.score) best = { vendor: v, score };
  }
  return best && best.score >= VENDOR_MATCH_MIN ? best : null;
}

/** Accepts ISO, US (MM/DD/YYYY) and long-form dates; returns yyyy-mm-dd or null. */
export function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const us = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/**
 * Pre-tax amount that is comparable with PO totals.
 * Tax-inclusive invoices carry tax inside the total, so net = total − tax
 * (or total / (1 + rate) when only the rate is printed).
 */
export function netAmount(e: Extraction): number | null {
  if (e.subtotal != null && !e.taxInclusive) return round2(e.subtotal);
  if (e.total != null) {
    if (e.taxAmount != null) return round2(e.total - e.taxAmount);
    if (e.taxRate != null) return round2(e.total / (1 + e.taxRate / 100));
    return round2(e.total);
  }
  if (e.subtotal != null) return round2(e.subtotal);
  const lines = e.lineItems.map((l) => l.amount).filter((a): a is number => a != null);
  return lines.length ? round2(lines.reduce((a, b) => a + b, 0)) : null;
}

export function normalize(e: Extraction, vendors: Vendor[]): Normalized {
  const m = matchVendor(e.vendorName, vendors);
  return {
    extraction: e,
    vendor: m?.vendor ?? null,
    vendorMatchScore: m?.score ?? 0,
    invoiceNumberKey: normalizeInvoiceNumber(e.invoiceNumber),
    invoiceDate: normalizeDate(e.invoiceDate),
    netAmount: netAmount(e),
    total: e.total,
    currency: (e.currency ?? "USD").toUpperCase(),
  };
}
