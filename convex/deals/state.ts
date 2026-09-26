import { ConvexError } from "convex/values";
import type { DealStatus } from "./constants";

export function assertDealCompletable(status: DealStatus) {
  if (status === "completed") throw new ConvexError("DEAL_ALREADY_COMPLETED");
  if (status !== "active") throw new ConvexError("DEAL_NOT_COMPLETABLE");
}

export function isDealReviewEligible(status: DealStatus) {
  return status === "completed";
}
