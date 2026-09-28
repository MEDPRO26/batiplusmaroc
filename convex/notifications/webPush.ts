"use node";

import { ConvexError } from "convex/values";
import { env } from "../_generated/server";
import { sendNotification, setVapidDetails } from "web-push";

export type PushFailure = Error & { statusCode?: number };

export function configureWebPush() {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) {
    throw new ConvexError("PUSH_NOT_CONFIGURED");
  }
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    throw new ConvexError("PUSH_NOT_CONFIGURED");
  }
  setVapidDetails(subject, publicKey, privateKey);
}

export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
) {
  return await sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, payload, { TTL: 60, urgency: "normal" });
}

export function pushFailureStatus(error: unknown) {
  const statusCode = (error as PushFailure).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

export function isPermanentPushFailure(error: unknown) {
  const statusCode = pushFailureStatus(error);
  return statusCode === 404 || statusCode === 410;
}
