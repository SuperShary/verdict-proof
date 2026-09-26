import type { Check, Decision, Outcome, ReasonCode } from "@/lib/types";
import { RULES, RULE_BY_CODE, SEVERITY_RANK } from "./catalog";

/**
 * Deterministic decision: the most severe failing rule wins.
 * Info codes ride along on approvals so the audit trail shows why it still cleared.
 */
export function decide(checks: Check[]): Decision {
  const failing = checks.filter((c) => c.status === "fail" && c.code) as (Check & { code: ReasonCode })[];

  if (!failing.length) {
    const info = checks.filter((c) => c.code && RULE_BY_CODE[c.code].severity === "INFO").map((c) => c.code!) as ReasonCode[];
    return {
      outcome: "APPROVE",
      reasons: unique(info),
      routeTo: "—",
      headline: "Cleared for payment: every check passed",
    };
  }

  const order = (code: ReasonCode) => RULES.findIndex((r) => r.code === code);
  const ranked = [...failing].sort(
    (a, b) =>
      SEVERITY_RANK[RULE_BY_CODE[b.code].severity] - SEVERITY_RANK[RULE_BY_CODE[a.code].severity] || order(a.code) - order(b.code),
  );
  const top = ranked[0];
  const outcome = RULE_BY_CODE[top.code].severity as Outcome;
  const verb = { BLOCK: "Blocked", REJECT: "Rejected", HOLD: "Held", APPROVE: "Approved" }[outcome];

  return {
    outcome,
    reasons: unique(ranked.map((c) => c.code)),
    routeTo: RULE_BY_CODE[top.code].owner,
    headline: `${verb}: ${top.detail}`,
  };
}

const unique = <T,>(xs: T[]) => [...new Set(xs)];
