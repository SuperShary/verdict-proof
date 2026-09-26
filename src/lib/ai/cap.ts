import "server-only";
import { dailyCap } from "./capLimit";

/**
 * Per-instance daily cap on PDF reads, a brake on a public demo link rather than a spend limit.
 * In-memory by design (no database): each new or cold-started instance starts a fresh count.
 */
let day = "";
let used = 0;

export function takeFromCap(): { ok: boolean; remaining: number; cap: number } {
  const cap = dailyCap();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    used = 0;
  }
  if (used >= cap) return { ok: false, remaining: 0, cap };
  used++;
  return { ok: true, remaining: cap - used, cap };
}
