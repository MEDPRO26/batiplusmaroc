import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureAccountFoundation } from "./lib/accountFoundation";
import { isPublicAccountType } from "./lib/constants";

const V1_COUNTRY_CODE = "MA" as const;

const currentUserValidator = v.union(
  v.null(),
  v.object({
    _id: v.id("users"),
    email: v.union(v.string(), v.null()),
    firstName: v.union(v.string(), v.null()),
    lastName: v.union(v.string(), v.null()),
    accountType: v.union(v.literal("client"), v.literal("company"), v.literal("admin"), v.null()),
    acceptedTerms: v.boolean(),
    countryCode: v.union(v.literal("MA"), v.null()),
    marketingOptIn: v.boolean(),
    onboardingStatus: v.union(v.literal("pending"), v.literal("completed"), v.null()),
  }),
);

export const currentUser = query({
  args: {},
  returns: currentUserValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    return {
      _id: user._id,
      email: user.email ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      accountType: user.accountType ?? null,
      acceptedTerms: user.termsAcceptedAt !== undefined || user.acceptedTerms === true,
      countryCode: user.countryCode ?? null,
      marketingOptIn: user.marketingOptIn === true,
      onboardingStatus: user.onboardingStatus ?? null,
    };
  },
});

/**
 * Repairs users created before the Step 1.2 account foundation existed.
 * The role and consent are derived only from the stored user document; the
 * caller cannot choose a different account type or create cross-role data.
 */
export const ensureCurrentUserFoundation = mutation({
  args: {},
  returns: v.object({
    accountType: v.union(v.literal("client"), v.literal("company")),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError("USER_NOT_FOUND");
    }
    if (!isPublicAccountType(user.accountType)) {
      throw new ConvexError("INVALID_ACCOUNT_TYPE");
    }
    if (user.termsAcceptedAt === undefined && user.acceptedTerms !== true) {
      throw new ConvexError("TERMS_REQUIRED");
    }

    const now = Date.now();
    const metadataMissing =
      user.countryCode !== V1_COUNTRY_CODE ||
      user.termsAcceptedAt === undefined ||
      user.marketingOptIn === undefined ||
      user.onboardingStatus === undefined ||
      user.createdAt === undefined ||
      user.updatedAt === undefined;

    if (metadataMissing) {
      await ctx.db.patch(userId, {
        countryCode: V1_COUNTRY_CODE,
        termsAcceptedAt: user.termsAcceptedAt ?? user._creationTime,
        marketingOptIn: user.marketingOptIn === true,
        onboardingStatus: user.onboardingStatus ?? "pending",
        createdAt: user.createdAt ?? user._creationTime,
        updatedAt: now,
      });
    }

    await ensureAccountFoundation(ctx, {
      userId,
      accountType: user.accountType,
      now,
    });
    return { accountType: user.accountType };
  },
});

/**
 * Completes Google (OAuth) signup after redirect.
 * Only sets accountType once; rejects privileged roles.
 */
export const finalizeOAuthSignup = mutation({
  args: {
    accountType: v.union(v.literal("client"), v.literal("company")),
    acceptedTerms: v.boolean(),
    marketingOptIn: v.boolean(),
  },
  returns: v.object({
    accountType: v.union(v.literal("client"), v.literal("company")),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError("USER_NOT_FOUND");
    }

    if (!isPublicAccountType(args.accountType)) {
      throw new ConvexError("INVALID_ACCOUNT_TYPE");
    }

    if (args.acceptedTerms !== true) {
      throw new ConvexError("TERMS_REQUIRED");
    }

    // Already finalized — keep existing public role; never overwrite admin.
    if (user.accountType === "client" || user.accountType === "company") {
      if (user.accountType !== args.accountType) {
        throw new ConvexError("ACCOUNT_TYPE_MISMATCH");
      }
      await ensureAccountFoundation(ctx, {
        userId,
        accountType: user.accountType,
        now: Date.now(),
      });
      return { accountType: user.accountType };
    }
    if (user.accountType === "admin") {
      throw new ConvexError("INVALID_ACCOUNT_TYPE");
    }

    const now = Date.now();
    await ctx.db.patch(userId, {
      accountType: args.accountType,
      acceptedTerms: true,
      termsAcceptedAt: now,
      marketingOptIn: args.marketingOptIn,
      countryCode: V1_COUNTRY_CODE,
      onboardingStatus: "pending",
      createdAt: user.createdAt ?? now,
      updatedAt: now,
    });
    await ensureAccountFoundation(ctx, {
      userId,
      accountType: args.accountType,
      now,
    });

    return { accountType: args.accountType };
  },
});
