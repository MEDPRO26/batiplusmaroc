import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { notificationEntityValidator, notificationPayloadValidator, notificationTypeValidator } from "./constants";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  resolveNotificationDelivery,
} from "./deliveryPolicy";

const MAX_SUBSCRIPTIONS_PER_USER = 20;
export const PUSH_DELIVERY_LEASE_MS = 15 * 60_000;
const pushLocaleValidator = v.union(v.literal("fr"), v.literal("en"));

const privateSubscriptionValidator = v.object({
  endpoint: v.string(),
  p256dh: v.string(),
  auth: v.string(),
  locale: pushLocaleValidator,
});

export const claimMarketplacePush = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    leaseId: v.string(),
  },
  returns: v.union(v.null(), v.object({
    notification: v.object({
      _id: v.id("notifications"),
      type: notificationTypeValidator,
      entity: notificationEntityValidator,
      payload: notificationPayloadValidator,
    }),
    recipientUserId: v.id("users"),
    accountType: v.union(
      v.literal("client"),
      v.literal("company"),
      v.literal("admin"),
      v.literal("seo_team"),
    ),
    subscriptions: v.array(privateSubscriptionValidator),
  })),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;

    const now = Date.now();
    if (
      notification.pushDeliveryStatus === "completed"
      || notification.pushDeliveryStatus === "skipped"
      || (
        notification.pushDeliveryStatus === "processing"
        && notification.pushAttemptedAt !== undefined
        && notification.pushAttemptedAt > now - PUSH_DELIVERY_LEASE_MS
      )
    ) return null;

    const recipient = await ctx.db.get(notification.recipientUserId);
    const preference = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", notification.recipientUserId))
      .unique();
    const preferences = preference
      ? { pushEnabled: preference.pushEnabled, pushCategories: preference.pushCategories }
      : DEFAULT_NOTIFICATION_PREFERENCES;
    const delivery = resolveNotificationDelivery(notification.type, preferences);

    if (!recipient?.accountType || !delivery.pushEnabledForUser) {
      await ctx.db.patch(notification._id, {
        pushDeliveryStatus: "skipped",
        pushDeliveryLeaseId: undefined,
        pushAttemptedAt: now,
        pushCompletedAt: now,
        pushDeliveredCount: 0,
        pushRemovedCount: 0,
        pushFailedCount: 0,
      });
      return null;
    }

    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", notification.recipientUserId))
      .take(MAX_SUBSCRIPTIONS_PER_USER);
    const localizedSubscriptions = subscriptions.filter(
      (subscription): subscription is typeof subscription & { locale: "fr" | "en" } =>
        subscription.locale !== undefined,
    );
    if (localizedSubscriptions.length === 0) {
      await ctx.db.patch(notification._id, {
        pushDeliveryStatus: "skipped",
        pushDeliveryLeaseId: undefined,
        pushAttemptedAt: now,
        pushCompletedAt: now,
        pushDeliveredCount: 0,
        pushRemovedCount: 0,
        pushFailedCount: 0,
      });
      return null;
    }

    await ctx.db.patch(notification._id, {
      pushDeliveryStatus: "processing",
      pushDeliveryLeaseId: args.leaseId,
      pushAttemptedAt: now,
    });
    // The schedule is committed atomically with the lease. A successful attempt
    // makes this watchdog a no-op; an abandoned attempt becomes reclaimable.
    await ctx.scheduler.runAfter(
      PUSH_DELIVERY_LEASE_MS,
      internal.notifications.pushDelivery.deliverMarketplacePush,
      { notificationId: notification._id },
    );
    return {
      notification: {
        _id: notification._id,
        type: notification.type,
        entity: notification.entity,
        payload: notification.payload,
      },
      recipientUserId: notification.recipientUserId,
      accountType: recipient.accountType,
      subscriptions: localizedSubscriptions.map(({ endpoint, p256dh, auth, locale }) => ({
        endpoint,
        p256dh,
        auth,
        locale,
      })),
    };
  },
});

export const completeMarketplacePush = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    recipientUserId: v.id("users"),
    leaseId: v.string(),
    deliveredEndpoints: v.array(v.string()),
    permanentFailureEndpoints: v.array(v.string()),
    failedCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (
      !notification
      || notification.recipientUserId !== args.recipientUserId
      || notification.pushDeliveryStatus !== "processing"
      || notification.pushDeliveryLeaseId !== args.leaseId
    ) return null;

    const now = Date.now();
    for (const endpoint of args.deliveredEndpoints) {
      const subscription = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .unique();
      if (subscription?.userId === args.recipientUserId) {
        await ctx.db.patch(subscription._id, { lastUsedAt: now, updatedAt: now });
      }
    }
    let removedCount = 0;
    for (const endpoint of args.permanentFailureEndpoints) {
      const subscription = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .unique();
      if (subscription?.userId === args.recipientUserId) {
        await ctx.db.delete(subscription._id);
        removedCount += 1;
      }
    }
    await ctx.db.patch(notification._id, {
      pushDeliveryStatus: "completed",
      pushDeliveryLeaseId: undefined,
      pushCompletedAt: now,
      pushDeliveredCount: args.deliveredEndpoints.length,
      pushRemovedCount: removedCount,
      pushFailedCount: args.failedCount,
    });
    return null;
  },
});
