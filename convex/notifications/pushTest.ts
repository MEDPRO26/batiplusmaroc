"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import {
  configureWebPush,
  isPermanentPushFailure,
  pushFailureStatus,
  sendWebPush,
} from "./webPush";

export const sendMyTestPush = action({
  args: { locale: v.union(v.literal("en"), v.literal("fr")) },
  returns: v.object({
    sent: v.number(),
    removed: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");

    const subscriptions = await ctx.runQuery(
      internal.notifications.pushSubscriptions.listForAuthenticatedTestPush,
      { userId },
    );
    if (subscriptions.length === 0) {
      throw new ConvexError("PUSH_SUBSCRIPTION_NOT_FOUND");
    }

    configureWebPush();
    const payload = JSON.stringify({
      title: "Batiplus Maroc",
      body: args.locale === "fr"
        ? "Les notifications Batiplus sont activées."
        : "Batiplus notifications are enabled.",
      locale: args.locale,
      url: `/${args.locale}/notifications`,
      tag: "batiplus-push-test",
    });

    let sent = 0;
    let removed = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      try {
        await sendWebPush(subscription, payload);
        sent += 1;
        await ctx.runMutation(
          internal.notifications.pushSubscriptions.recordDeliveryResult,
          { userId, endpoint: subscription.endpoint, outcome: "delivered" },
        );
      } catch (error) {
        const statusCode = pushFailureStatus(error);
        if (isPermanentPushFailure(error)) {
          const deleted = await ctx.runMutation(
            internal.notifications.pushSubscriptions.recordDeliveryResult,
            { userId, endpoint: subscription.endpoint, outcome: "permanent_failure" },
          );
          if (deleted) removed += 1;
        } else {
          failed += 1;
          console.error("Test push delivery failed", {
            name: error instanceof Error ? error.name : "UnknownError",
            statusCode: typeof statusCode === "number" ? statusCode : null,
          });
        }
      }
    }
    return { sent, removed, failed };
  },
});
