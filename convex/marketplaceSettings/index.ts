import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireAdminUser } from "../admin/access";
import {
  commissionTierValidator,
  type CommissionTier,
  MAX_COMMISSION_RATE_BPS,
  MAX_COMMISSION_TIERS,
  MIN_COMMISSION_RATE_BPS,
} from "./constants";

const BPS_DENOMINATOR = 10_000;
const MAD_MINOR_UNITS = 100;

type SettingsCtx = QueryCtx | MutationCtx;

function fail(code: string): never {
  throw new ConvexError(code);
}

function isWholeMad(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateCommissionTiers(
  tiers: readonly CommissionTier[],
): CommissionTier[] {
  if (tiers.length < 1 || tiers.length > MAX_COMMISSION_TIERS) {
    fail("COMMISSION_TIERS_REQUIRED");
  }

  const validated = tiers.map((tier) => ({ ...tier }));
  for (let index = 0; index < validated.length; index += 1) {
    const tier = validated[index];
    if (
      !isWholeMad(tier.minAmountMad) ||
      (tier.maxAmountMad !== null && !isWholeMad(tier.maxAmountMad)) ||
      (tier.maxAmountMad !== null && tier.minAmountMad > tier.maxAmountMad)
    ) {
      fail("INVALID_COMMISSION_TIER_BOUNDARY");
    }
    if (
      !Number.isFinite(tier.commissionRateBps) ||
      !Number.isInteger(tier.commissionRateBps) ||
      tier.commissionRateBps < MIN_COMMISSION_RATE_BPS ||
      tier.commissionRateBps > MAX_COMMISSION_RATE_BPS
    ) {
      fail("INVALID_COMMISSION_RATE");
    }
    if (tier.maxAmountMad === null && index !== validated.length - 1) {
      fail("COMMISSION_MULTIPLE_OPEN_TIERS");
    }
  }

  if (validated[0].minAmountMad !== 0) {
    fail("COMMISSION_FIRST_TIER_ZERO_REQUIRED");
  }
  if (validated[validated.length - 1].maxAmountMad !== null) {
    fail("COMMISSION_FINAL_TIER_OPEN_REQUIRED");
  }

  for (let index = 1; index < validated.length; index += 1) {
    const previous = validated[index - 1];
    const current = validated[index];
    if (current.minAmountMad <= previous.minAmountMad) {
      fail("COMMISSION_TIERS_UNORDERED");
    }
    if (previous.maxAmountMad === null) {
      fail("COMMISSION_MULTIPLE_OPEN_TIERS");
    }
    const expectedMin = previous.maxAmountMad + 1;
    if (current.minAmountMad < expectedMin) fail("COMMISSION_TIERS_OVERLAP");
    if (current.minAmountMad > expectedMin) fail("COMMISSION_TIERS_GAP");
  }

  return validated;
}

function sameTiers(left: readonly CommissionTier[], right: readonly CommissionTier[]) {
  return left.length === right.length && left.every((tier, index) => {
    const other = right[index];
    return tier.minAmountMad === other.minAmountMad &&
      tier.maxAmountMad === other.maxAmountMad &&
      tier.commissionRateBps === other.commissionRateBps;
  });
}

async function getGlobalSettings(ctx: SettingsCtx) {
  return await ctx.db
    .query("marketplaceSettings")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .unique();
}

function validateStoredConfiguration(
  tiers: readonly CommissionTier[],
  version: number,
) {
  try {
    const commissionTiers = validateCommissionTiers(tiers);
    if (!Number.isSafeInteger(version) || version < 1) {
      fail("COMMISSION_CONFIGURATION_INVALID");
    }
    return { commissionTiers, commissionConfigVersion: version };
  } catch {
    fail("COMMISSION_CONFIGURATION_INVALID");
  }
}

function calculateFlatBracketCommission(amountMad: number, commissionRateBps: number) {
  if (!Number.isFinite(amountMad) || amountMad <= 0) {
    fail("INVALID_DEAL_AMOUNT");
  }
  const amountCentimes = Math.round(amountMad * MAD_MINOR_UNITS);
  if (!Number.isSafeInteger(amountCentimes)) fail("INVALID_DEAL_AMOUNT");
  const weightedCentimes = amountCentimes * commissionRateBps;
  if (!Number.isSafeInteger(weightedCentimes)) fail("INVALID_DEAL_AMOUNT");
  const commissionCentimes = Math.floor(
    (weightedCentimes + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR,
  );
  return {
    agreedAmountMad: amountCentimes / MAD_MINOR_UNITS,
    commissionAmountMad: commissionCentimes / MAD_MINOR_UNITS,
  };
}

/**
 * Trusted resolver for future Deal creation. A single matched rate applies to
 * the complete accepted Deal value; this is deliberately not progressive.
 */
export async function resolveCommissionForDealAmount(
  ctx: SettingsCtx,
  amountMad: number,
) {
  const settings = await getGlobalSettings(ctx);
  if (!settings) fail("COMMISSION_CONFIGURATION_REQUIRED");
  const configuration = validateStoredConfiguration(
    settings.commissionTiers,
    settings.commissionConfigVersion,
  );
  const normalized = calculateFlatBracketCommission(amountMad, 0);
  const wholeMadBracketValue = Math.floor(normalized.agreedAmountMad);
  const matches = configuration.commissionTiers.filter(
    (tier) => wholeMadBracketValue >= tier.minAmountMad &&
      (tier.maxAmountMad === null || wholeMadBracketValue <= tier.maxAmountMad),
  );
  if (matches.length !== 1) fail("COMMISSION_CONFIGURATION_INVALID");
  const matchedTier = matches[0];
  const calculated = calculateFlatBracketCommission(
    normalized.agreedAmountMad,
    matchedTier.commissionRateBps,
  );
  return {
    ...calculated,
    commissionRateBps: matchedTier.commissionRateBps,
    matchedTier: {
      minAmountMad: matchedTier.minAmountMad,
      maxAmountMad: matchedTier.maxAmountMad,
    },
    configurationVersion: configuration.commissionConfigVersion,
  };
}

export const getCommissionSetting = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    commissionTiers: v.array(commissionTierValidator),
    commissionConfigVersion: v.union(v.number(), v.null()),
    updatedAt: v.union(v.number(), v.null()),
    updatedByUserId: v.union(v.id("users"), v.null()),
  }),
  handler: async (ctx) => {
    await requireAdminUser(ctx);
    const settings = await getGlobalSettings(ctx);
    if (!settings) {
      return {
        configured: false,
        commissionTiers: [],
        commissionConfigVersion: null,
        updatedAt: null,
        updatedByUserId: null,
      };
    }
    const configuration = validateStoredConfiguration(
      settings.commissionTiers,
      settings.commissionConfigVersion,
    );
    return {
      configured: true,
      ...configuration,
      updatedAt: settings.updatedAt,
      updatedByUserId: settings.updatedByUserId,
    };
  },
});

export const updateCommissionTiers = mutation({
  args: { commissionTiers: v.array(commissionTierValidator) },
  returns: v.object({
    commissionTiers: v.array(commissionTierValidator),
    commissionConfigVersion: v.number(),
    changed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const commissionTiers = validateCommissionTiers(args.commissionTiers);
    const settings = await getGlobalSettings(ctx);
    if (settings && sameTiers(settings.commissionTiers, commissionTiers)) {
      const configuration = validateStoredConfiguration(
        settings.commissionTiers,
        settings.commissionConfigVersion,
      );
      return { ...configuration, changed: false };
    }

    const previousVersion = settings?.commissionConfigVersion ?? null;
    const versionBaseline = previousVersion !== null &&
      Number.isSafeInteger(previousVersion) && previousVersion >= 1
      ? previousVersion
      : 0;
    const commissionConfigVersion = versionBaseline + 1;
    if (!Number.isSafeInteger(commissionConfigVersion)) {
      fail("COMMISSION_CONFIGURATION_INVALID");
    }
    const now = Date.now();
    const nextSettings = {
      key: "global" as const,
      commissionTiers,
      commissionConfigVersion,
      updatedAt: now,
      updatedByUserId: admin._id,
    };
    if (settings) await ctx.db.replace(settings._id, nextSettings);
    else await ctx.db.insert("marketplaceSettings", nextSettings);

    await ctx.db.insert("marketplaceSettingsHistory", {
      settingKey: "commission_tiers",
      oldCommissionTiers: settings?.commissionTiers ?? [],
      newCommissionTiers: commissionTiers,
      oldCommissionConfigVersion: previousVersion,
      newCommissionConfigVersion: commissionConfigVersion,
      actorUserId: admin._id,
      createdAt: now,
    });
    return { commissionTiers, commissionConfigVersion, changed: true };
  },
});
