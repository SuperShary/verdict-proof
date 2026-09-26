import type { Check, Decision, DraftEmail, Normalized } from "@/lib/types";
import { BUYER } from "@/data/samples";
import { emailDomain, isLookalikeDomain, usd } from "@/lib/util/text";

const INTERNAL: Record<string, string> = {
  "Finance controller": "controller@halcyonfoods.com",
  Procurement: "procurement@halcyonfoods.com",
  Warehouse: "receiving@halcyonfoods.com",
  "AP clerk": "ap-team@halcyonfoods.com",
};

/**
 * Who the next message goes to is decided by code, not the model.
 * Fraud never replies to the sender; vendor-facing issues go to the vendor's known domain.
 */
export function recipientFor(d: Decision, n: Normalized | null, senderEmail: string | null): string | null {
  if (d.outcome === "APPROVE") return null;
  const vendorFacing = d.routeTo === "Vendor" || d.reasons.includes("DUPLICATE_INVOICE") || d.reasons.includes("NOT_AN_INVOICE");
  if (d.outcome !== "BLOCK" && vendorFacing) {
    const dom = emailDomain(senderEmail);
    const known = n?.vendor?.emailDomain;
    if (senderEmail && known && dom && (dom === known || dom.endsWith("." + known)) && !isLookalikeDomain(dom, known)) return senderEmail;
    if (known) return `billing@${known}`;
    return senderEmail;
  }
  return INTERNAL[d.routeTo] ?? BUYER.apEmail;
}

/** Deterministic fallback when the explanation model is unavailable. */
export function templateExplanation(d: Decision, checks: Check[], n: Normalized | null, recipient: string | null): { rationale: string; draftEmail: DraftEmail | null } {
  const failing = checks.filter((c) => c.status === "fail");
  const vendor = n?.vendor?.name ?? n?.extraction.vendorName ?? "the vendor";
  const inv = n?.extraction.invoiceNumber ?? "(no number)";
  const rationale =
    d.outcome === "APPROVE"
      ? `Approved. Invoice ${inv} from ${vendor} for ${usd(n?.total ?? null)} passed every check: vendor, bank details, PO balance, prices and duplicates.`
      : `${d.headline} ${failing.slice(1, 3).map((c) => c.detail).join(" ")}`.trim();
  if (!recipient) return { rationale, draftEmail: null };
  return {
    rationale,
    draftEmail: {
      to: recipient,
      subject: `${d.outcome === "BLOCK" ? "[Fraud check] " : ""}Invoice ${inv} from ${vendor}: action needed`,
      body: `Hello,\n\nInvoice ${inv} (${usd(n?.total ?? null)}) could not be processed:\n\n${failing.map((c) => `• ${c.detail}`).join("\n")}\n\nThanks,\nAccounts Payable, ${BUYER.name}`,
    },
  };
}
