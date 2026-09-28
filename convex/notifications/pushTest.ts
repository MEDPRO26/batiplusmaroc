"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { sendNotification, setVapidDetails } from "web-push";
import { internal } from "../_generated/api";
import { action, env } from "../_generated/server";

type PushFailure = Error & { statusCode?: number };

function requireVapidConfiguration() {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) {
    throw new ConvexError("PUSH_NOT_CONFIGURED");
  }
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    throw new ConvexError("PUSH_NOT_CONFIGURED");
  }
  return { publicKey, privateKey, subject };
}

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

    const vapid = requireVapidConfiguration();
    setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const payload = JSON.stringify({
      title: "Batiplus Maroc",
      body: args.locale === "fr"
        ? "Les notifications Batiplus sont activées."
        : "Batiplus notifications are enabled.",
      url: `/${args.locale}/notifications`,
      tag: "batiplus-push-test",
    });

    let sent = 0;
    let removed = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      try {
        await sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: 60, urgency: "normal" });
        sent += 1;
        await ctx.runMutation(
          internal.notifications.pushSubscriptions.recordDeliveryResult,
          { userId, endpoint: subscription.endpoint, outcome: "delivered" },
        );
      } catch (error) {
        const statusCode = (error as PushFailure).statusCode;
        if (statusCode === 404 || statusCode === 410) {
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
