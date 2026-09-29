import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";

const MAX_ENDPOINT_LENGTH = 2_048;
const MAX_KEY_LENGTH = 512;
const MAX_SUBSCRIPTIONS_PER_USER = 20;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;
const pushLocaleValidator = v.union(v.literal("fr"), v.literal("en"));

const subscriptionStateValidator = v.object({
  registered: v.boolean(),
  updatedAt: v.union(v.number(), v.null()),
});

const privateSubscriptionValidator = v.object({
  endpoint: v.string(),
  p256dh: v.string(),
  auth: v.string(),
});

async function requirePushUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.isAnonymous || !user.accountType) {
    throw new ConvexError("PUSH_SUBSCRIPTIONS_FORBIDDEN");
  }
  return userId;
}

function validateEndpoint(endpoint: string) {
  if (endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw new ConvexError("INVALID_PUSH_SUBSCRIPTION");
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new ConvexError("INVALID_PUSH_SUBSCRIPTION");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ConvexError("INVALID_PUSH_SUBSCRIPTION");
  }
}

function validateKey(value: string) {
  if (
    value.length < 16
    || value.length > MAX_KEY_LENGTH
    || !BASE64_URL_PATTERN.test(value)
  ) {
    throw new ConvexError("INVALID_PUSH_SUBSCRIPTION");
  }
}

export const getMyPushSubscriptionState = query({
  args: { endpoint: v.union(v.string(), v.null()) },
  returns: subscriptionStateValidator,
  handler: async (ctx, args) => {
    const userId = await requirePushUserId(ctx);
    if (args.endpoint === null) return { registered: false, updatedAt: null };
    validateEndpoint(args.endpoint);
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint!))
      .unique();
    return subscription?.userId === userId
      ? { registered: true, updatedAt: subscription.updatedAt }
      : { registered: false, updatedAt: null };
  },
});

export const registerMyPushSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    locale: pushLocaleValidator,
  },
  returns: v.object({ created: v.boolean(), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requirePushUserId(ctx);
    validateEndpoint(args.endpoint);
    validateKey(args.p256dh);
    validateKey(args.auth);

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();

    const now = Date.now();
    if (existing) {
      if (existing.userId !== userId) {
        // The auth secret proves this caller controls the same browser subscription.
        // Never transfer an endpoint based on its URL alone.
        if (existing.p256dh !== args.p256dh || existing.auth !== args.auth) {
          throw new ConvexError("PUSH_SUBSCRIPTION_NOT_FOUND");
        }
        const current = await ctx.db
          .query("pushSubscriptions")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(MAX_SUBSCRIPTIONS_PER_USER);
        if (current.length >= MAX_SUBSCRIPTIONS_PER_USER) {
          throw new ConvexError("PUSH_SUBSCRIPTION_LIMIT_REACHED");
        }
      }
      await ctx.db.patch(existing._id, {
        userId,
        p256dh: args.p256dh,
        auth: args.auth,
        locale: args.locale,
        updatedAt: now,
        ...(existing.userId !== userId ? { lastUsedAt: undefined } : {}),
      });
      return { created: false, updatedAt: now };
    }

    const current = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_SUBSCRIPTIONS_PER_USER);
    if (current.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      throw new ConvexError("PUSH_SUBSCRIPTION_LIMIT_REACHED");
    }

    await ctx.db.insert("pushSubscriptions", {
      userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      locale: args.locale,
      createdAt: now,
      updatedAt: now,
    });
    return { created: true, updatedAt: now };
  },
});

export const unregisterMyPushSubscription = mutation({
  args: { endpoint: v.string() },
  returns: v.object({ removed: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = await requirePushUserId(ctx);
    validateEndpoint(args.endpoint);
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (!subscription || subscription.userId !== userId) {
      return { removed: false };
    }
    await ctx.db.delete(subscription._id);
    return { removed: true };
  },
});

export const listForAuthenticatedTestPush = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(privateSubscriptionValidator),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.isAnonymous || !user.accountType) {
      throw new ConvexError("PUSH_SUBSCRIPTIONS_FORBIDDEN");
    }
    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(MAX_SUBSCRIPTIONS_PER_USER);
    return subscriptions.map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth }));
  },
});

export const recordDeliveryResult = internalMutation({
  args: {
    userId: v.id("users"),
    endpoint: v.string(),
    outcome: v.union(v.literal("delivered"), v.literal("permanent_failure")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (!subscription || subscription.userId !== args.userId) return false;
    if (args.outcome === "permanent_failure") {
      await ctx.db.delete(subscription._id);
      return true;
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, { lastUsedAt: now, updatedAt: now });
    return true;
  },
});
