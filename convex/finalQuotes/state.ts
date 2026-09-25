import { ConvexError } from "convex/values";

export type FinalQuoteStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "accepted"
  | "declined"
  | "withdrawn";

const transitions: Record<FinalQuoteStatus, readonly FinalQuoteStatus[]> = {
  draft: ["submitted"],
  submitted: ["accepted", "changes_requested", "declined", "withdrawn"],
  changes_requested: ["submitted"],
  accepted: [],
  declined: [],
  withdrawn: [],
};

export function assertFinalQuoteTransition(from: FinalQuoteStatus, to: FinalQuoteStatus) {
  if (!transitions[from].includes(to)) {
    throw new ConvexError("INVALID_FINAL_QUOTE_STATUS_TRANSITION");
  }
}

export function isFinalQuoteTerminal(status: FinalQuoteStatus) {
  return status === "accepted" || status === "declined" || status === "withdrawn";
}
