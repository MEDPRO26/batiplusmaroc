import { v } from "convex/values";

/**
 * Acceptance starts the commercial relationship, so a new V1 Deal is active.
 * Completion and cancellation are reserved for explicit later-step transitions.
 */
export const dealStatusValidator = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export type DealStatus = "active" | "completed" | "cancelled";

export const commissionStatusValidator = v.union(
  v.literal("due"),
  v.literal("paid"),
);

export type CommissionStatus = "due" | "paid";
