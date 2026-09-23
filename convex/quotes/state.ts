import { ConvexError } from "convex/values";

export type QuoteStatus =
  | "draft"
  | "submitted"
  | "viewed"
  | "shortlisted"
  | "discussion_open"
  | "declined"
  | "withdrawn";

const transitions: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["submitted"],
  submitted: ["viewed", "shortlisted", "discussion_open", "declined", "withdrawn"],
  viewed: ["shortlisted", "discussion_open", "declined"],
  shortlisted: ["discussion_open", "declined"],
  discussion_open: [],
  declined: [],
  withdrawn: [],
};

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus) {
  if (!transitions[from].includes(to)) {
    throw new ConvexError("INVALID_QUOTE_STATUS_TRANSITION");
  }
}

export function isActiveQuoteStatus(status: QuoteStatus) {
  return status === "draft" || status === "submitted" || status === "viewed" || status === "shortlisted" || status === "discussion_open";
}
