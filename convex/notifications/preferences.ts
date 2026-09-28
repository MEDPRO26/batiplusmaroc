import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPushCategoriesValidator,
} from "./deliveryPolicy";

const preferenceResultValidator = v.object({
  pushEnabled: v.boolean(),
  pushCategories: notificationPushCategoriesValidator,
  updatedAt: v.union(v.number(), v.null()),
});

async function requirePreferenceUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.isAnonymous || !user.accountType) {
    throw new ConvexError("NOTIFICATION_PREFERENCES_FORBIDDEN");
  }
  return userId;
}

async function preferenceDocument(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("notificationPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

function preferenceResult(
  preference: Awaited<ReturnType<typeof preferenceDocument>>,
) {
  return preference
    ? {
        pushEnabled: preference.pushEnabled,
        pushCategories: preference.pushCategories,
        updatedAt: preference.updatedAt,
      }
    : { ...DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: null };
}

export const getMyNotificationPreferences = query({
  args: {},
  returns: preferenceResultValidator,
  handler: async (ctx) => {
    const userId = await requirePreferenceUserId(ctx);
    return preferenceResult(await preferenceDocument(ctx, userId));
  },
});

export const updateMyNotificationPreferences = mutation({
  args: {
    pushEnabled: v.optional(v.boolean()),
    pushCategories: v.optional(notificationPushCategoriesValidator.partial()),
  },
  returns: preferenceResultValidator,
  handler: async (ctx, args) => {
    const userId = await requirePreferenceUserId(ctx);
    const hasCategoryUpdate = args.pushCategories !== undefined
      && Object.keys(args.pushCategories).length > 0;
    if (args.pushEnabled === undefined && !hasCategoryUpdate) {
      throw new ConvexError("NOTIFICATION_PREFERENCES_UPDATE_REQUIRED");
    }

    const existing = await preferenceDocument(ctx, userId);
    const current = existing ?? DEFAULT_NOTIFICATION_PREFERENCES;
    const now = Date.now();
    const next = {
      pushEnabled: args.pushEnabled ?? current.pushEnabled,
      pushCategories: {
        ...current.pushCategories,
        ...args.pushCategories,
      },
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, next);
    } else {
      await ctx.db.insert("notificationPreferences", { userId, ...next });
    }
    return next;
  },
});
