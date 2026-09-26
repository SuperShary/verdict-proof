/** Small, dependency-free text helpers used by matching and fraud checks. */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Lowercased word tokens, minus filler words and very short tokens. */
const STOP = new Set(["the", "and", "of", "for", "inc", "llc", "co", "corp", "company", "ltd", "with", "per"]);
export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Jaccard overlap of the token sets, 0..1. */
export function tokenOverlap(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Similarity of two names, 0..1, tolerant of suffixes like "LLC" and small typos. */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a).join(" ");
  const tb = tokens(b).join(" ");
  if (!ta || !tb) return 0;
  if (ta === tb) return 1;
  const edit = 1 - levenshtein(ta, tb) / Math.max(ta.length, tb.length);
  return Math.max(edit, tokenOverlap(a, b));
}

/**
 * Canonical invoice number, compared within one vendor. Vendors reformat their own numbers on resubmission
 * ("INV-0042", "INV 42", "inv0042", "#42", "BLP-004567" vs "BLP 4567"), so when a number carries at least three
 * digits the digits alone (leading zeros dropped) identify it. Short numbers keep their letters.
 */
export function normalizeInvoiceNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  s = s.replace(/^(INVOICE|INV|NO|NUMBER)/, "");
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 3) return digits.replace(/^0+(?=\d)/, "");
  if (/^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, "");
  return s || null;
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : null;
}

/** Common character swaps used in spoofed domains (0→o, 1→l, rn→m, vv→w). */
function deconfuse(d: string): string {
  return d.replace(/rn/g, "m").replace(/vv/g, "w").replace(/0/g, "o").replace(/1/g, "l").replace(/3/g, "e").replace(/5/g, "s");
}

/** True when `candidate` imitates `real` without being it. */
export function isLookalikeDomain(candidate: string, real: string): boolean {
  const c = candidate.toLowerCase();
  const r = real.toLowerCase();
  if (c === r) return false;
  if (deconfuse(c) === deconfuse(r)) return true;
  const strip = (d: string) => d.replace(/\.[a-z.]+$/, "");
  // same name, different TLD (cortex-supply.co vs cortex-supply.com)
  if (strip(c) === strip(r)) return true;
  // the real brand embedded in another registrable domain (greenleafproduce-billing.com, pay-cortex-supply.net)
  const brand = strip(r);
  if (brand.length >= 5 && strip(c).includes(brand)) return true;
  return levenshtein(c, r) <= 2;
}

export const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const usd = (n: number | null | undefined, opts: { cents?: boolean } = {}) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: opts.cents === false ? 0 : 2,
        maximumFractionDigits: opts.cents === false ? 0 : 2,
      });

/** One duration format everywhere: under a second in ms, otherwise seconds with one decimal. */
export const fmtMs = (ms: number | null | undefined) =>
  ms == null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
