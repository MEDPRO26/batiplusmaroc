import { v } from "convex/values";

export const MIN_COMMISSION_RATE_BPS = 0;
export const MAX_COMMISSION_RATE_BPS = 3_000;
export const MAX_COMMISSION_TIERS = 20;

export const commissionTierValidator = v.object({
  minAmountMad: v.number(),
  maxAmountMad: v.union(v.number(), v.null()),
  commissionRateBps: v.number(),
});

export type CommissionTier = {
  minAmountMad: number;
  maxAmountMad: number | null;
  commissionRateBps: number;
};
