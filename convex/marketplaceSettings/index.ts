import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireAdminUser } from "../admin/access";

export const MIN_COMMISSION_RATE_BPS = 0;
export const MAX_COMMISSION_RATE_BPS = 3_000;

type SettingsCtx = QueryCtx | MutationCtx;

function assertValidCommissionRateBps(value: number) {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < MIN_COMMISSION_RATE_BPS ||
    value > MAX_COMMISSION_RATE_BPS
  ) {
    throw new ConvexError("INVALID_COMMISSION_RATE");
  }
  return value;
}

async function getGlobalSettings(ctx: SettingsCtx) {
  return await ctx.db
    .query("marketplaceSettings")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .unique();
}

/** Trusted helper used by Deal creation. There is deliberately no fallback. */
export async function getCurrentCommissionRateBps(ctx: SettingsCtx) {
  const settings = await getGlobalSettings(ctx);
  if (!settings) throw new ConvexError("COMMISSION_CONFIGURATION_REQUIRED");
  return assertValidCommissionRateBps(settings.commissionRateBps);
}

export const getCommissionSetting = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    commissionRateBps: v.union(v.number(), v.null()),
    updatedAt: v.union(v.number(), v.null()),
    updatedByUserId: v.union(v.id("users"), v.null()),
  }),
  handler: async (ctx) => {
    await requireAdminUser(ctx);
    const settings = await getGlobalSettings(ctx);
    if (!settings) {
      return {
        configured: false,
        commissionRateBps: null,
        updatedAt: null,
        updatedByUserId: null,
      };
    }
    return {
      configured: true,
      commissionRateBps: assertValidCommissionRateBps(settings.commissionRateBps),
      updatedAt: settings.updatedAt,
      updatedByUserId: settings.updatedByUserId,
    };
  },
});

export const updateCommissionRate = mutation({
  args: { commissionRateBps: v.number() },
  returns: v.object({ commissionRateBps: v.number(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const commissionRateBps = assertValidCommissionRateBps(args.commissionRateBps);
    const settings = await getGlobalSettings(ctx);
    if (settings?.commissionRateBps === commissionRateBps) {
      return { commissionRateBps, changed: false };
    }

    const now = Date.now();
    if (settings) {
      await ctx.db.patch(settings._id, {
        commissionRateBps,
        updatedAt: now,
        updatedByUserId: admin._id,
      });
    } else {
      await ctx.db.insert("marketplaceSettings", {
        key: "global",
        commissionRateBps,
        updatedAt: now,
        updatedByUserId: admin._id,
      });
    }
    await ctx.db.insert("marketplaceSettingsHistory", {
      settingKey: "commission_rate_bps",
      oldCommissionRateBps: settings?.commissionRateBps ?? null,
      newCommissionRateBps: commissionRateBps,
      actorUserId: admin._id,
      createdAt: now,
    });

    return { commissionRateBps, changed: true };
  },
});
