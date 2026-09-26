import { Check, Pause, ShieldAlert, X } from "lucide-react";
import clsx from "clsx";
import type { Outcome } from "@/lib/types";

export const OUTCOME_META: Record<Outcome, { word: string; past: string; Icon: typeof Check; chip: string; text: string }> = {
  APPROVE: { word: "Approve", past: "Approved", Icon: Check, chip: "bg-approve-soft text-approve", text: "text-approve" },
  HOLD: { word: "Hold", past: "Held", Icon: Pause, chip: "bg-hold-soft text-hold", text: "text-hold" },
  REJECT: { word: "Reject", past: "Rejected", Icon: X, chip: "bg-reject-soft text-reject", text: "text-reject" },
  BLOCK: { word: "Block", past: "Blocked", Icon: ShieldAlert, chip: "bg-block text-block-fg", text: "text-ink" },
};

/** Small status chip. Always icon + word, never colour alone. */
export function OutcomeChip({ outcome, className, size = "md" }: { outcome: Outcome; className?: string; size?: "sm" | "md" }) {
  const m = OUTCOME_META[outcome];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11.5px]" : "px-2.5 py-1 text-[12.5px]",
        m.chip,
        className,
      )}
    >
      <m.Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.4} aria-hidden="true" />
      {m.past}
    </span>
  );
}
