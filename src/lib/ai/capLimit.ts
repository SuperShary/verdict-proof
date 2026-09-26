export const DEFAULT_DAILY_CAP = 200;

/**
 * DAILY_RUN_CAP as a positive whole number. Unset, empty, zero, negative or non-numeric values fall back to the
 * default: a blank env var on the host must never silently switch every upload off. To turn AI off, remove the key.
 */
export function dailyCap(raw: string | undefined = process.env.DAILY_RUN_CAP): number {
  const n = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_DAILY_CAP;
}
