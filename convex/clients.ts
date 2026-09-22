import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { ensureAccountFoundation } from "./lib/accountFoundation";

const onboardingProfileValidator = v.union(
  v.null(),
  v.object({
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    city: v.string(),
    onboardingStatus: v.union(v.literal("pending"), v.literal("completed")),
  }),
);

function normalizeName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length < 1 ||
    normalized.length > 80 ||
    !/^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u.test(normalized)
  ) {
    throw new ConvexError("INVALID_NAME");
  }
  return normalized;
}

function normalizeCity(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length < 2 ||
    normalized.length > 80 ||
    !/^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u.test(normalized)
  ) {
    throw new ConvexError("INVALID_CITY");
  }
  return normalized;
}

function normalizeMoroccanPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("00212") ? `+212${compact.slice(5)}` : compact;
  if (!/^(?:\+212[5-7]\d{8}|0[5-7]\d{8})$/.test(normalized)) {
    throw new ConvexError("INVALID_PHONE");
  }
  return normalized;
}

async function requireClientUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("NOT_AUTHENTICATED");
  }
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("USER_NOT_FOUND");
  }
  if (user.accountType !== "client") {
    throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
  }
  return { userId, user };
}

export const getOnboardingProfile = query({
  args: {},
  returns: onboardingProfileValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;
    if (user.accountType !== "client") {
      throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
    }

    const profiles = await ctx.db
      .query("clientProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(2);
    if (profiles.length > 1) {
      throw new ConvexError("DUPLICATE_ACCOUNT_FOUNDATION");
    }

    return {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      city: profiles[0]?.city ?? "",
      onboardingStatus: profiles[0]?.onboardingStatus ?? user.onboardingStatus ?? "pending",
    };
  },
});

export const completeOnboarding = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    city: v.string(),
  },
  returns: v.object({
    onboardingStatus: v.literal("completed"),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const firstName = normalizeName(args.firstName);
    const lastName = normalizeName(args.lastName);
    const phone = normalizeMoroccanPhone(args.phone);
    const city = normalizeCity(args.city);
    const now = Date.now();

    const foundation = await ensureAccountFoundation(ctx, {
      userId,
      accountType: "client",
      now,
    });
    if (foundation.accountType !== "client") {
      throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
    }

    await ctx.db.patch(userId, {
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone,
      onboardingStatus: "completed",
      updatedAt: now,
    });
    await ctx.db.patch(foundation.clientProfileId, {
      city,
      onboardingStatus: "completed",
      updatedAt: now,
    });

    return { onboardingStatus: "completed" as const };
  },
});
