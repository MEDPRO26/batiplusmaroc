"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { marketplacePushPresentation } from "./pushPresentation";
import {
  configureWebPush,
  isPermanentPushFailure,
  pushFailureStatus,
  sendWebPush,
} from "./webPush";

export const deliverMarketplacePush = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const leaseId = crypto.randomUUID();
    const claimed = await ctx.runMutation(
      internal.notifications.pushDeliveryModel.claimMarketplacePush,
      { ...args, leaseId },
    );
    if (!claimed) return null;

    const deliveredEndpoints: string[] = [];
    const permanentFailureEndpoints: string[] = [];
    const temporaryFailureEndpoints: string[] = [];
    try {
      configureWebPush();
      for (const subscription of claimed.subscriptions) {
        try {
          const { locale, ...webPushSubscription } = subscription;
          const payload = JSON.stringify(marketplacePushPresentation(
            claimed.notification,
            claimed.accountType,
            locale,
          ));
          await sendWebPush(webPushSubscription, payload);
          deliveredEndpoints.push(subscription.endpoint);
        } catch (error) {
          if (isPermanentPushFailure(error)) {
            permanentFailureEndpoints.push(subscription.endpoint);
          } else {
            temporaryFailureEndpoints.push(subscription.endpoint);
            console.error("Marketplace push delivery failed", {
              notificationId: args.notificationId,
              type: claimed.notification.type,
              statusCode: pushFailureStatus(error),
            });
          }
        }
      }
    } catch (error) {
      temporaryFailureEndpoints.push(
        ...claimed.subscriptions.map((subscription) => subscription.endpoint),
      );
      console.error("Marketplace push delivery unavailable", {
        notificationId: args.notificationId,
        type: claimed.notification.type,
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }

    await ctx.runMutation(
      internal.notifications.pushDeliveryModel.completeMarketplacePush,
      {
        notificationId: args.notificationId,
        recipientUserId: claimed.recipientUserId,
        leaseId,
        deliveredEndpoints,
        permanentFailureEndpoints,
        temporaryFailureEndpoints,
      },
    );
    console.info("Marketplace push delivery completed", {
      notificationId: args.notificationId,
      type: claimed.notification.type,
      attempted: claimed.subscriptions.length,
      delivered: deliveredEndpoints.length,
      permanentFailures: permanentFailureEndpoints.length,
      temporaryFailures: temporaryFailureEndpoints.length,
    });
    return null;
  },
});
