import { v } from "convex/values";

export const supportRequestKinds = ["free_help", "coordination_discussion"] as const;
export type SupportRequestKind = (typeof supportRequestKinds)[number];
export type SupportSenderType = "client" | "admin";

export const supportRequestKindValidator = v.union(
  ...supportRequestKinds.map((kind) => v.literal(kind)),
);
export const supportSenderTypeValidator = v.union(v.literal("client"), v.literal("admin"));

// Translation keys are stable protocol values. Request entries never store prose.
export const supportRequestEventKeys = {
  free_help: "clientSupport.events.freeHelpRequested",
  coordination_discussion: "clientSupport.events.coordinationDiscussionRequested",
} as const;
export const supportRequestEventKeyValidator = v.union(
  v.literal(supportRequestEventKeys.free_help),
  v.literal(supportRequestEventKeys.coordination_discussion),
);

export const SUPPORT_MAX_BODY_LENGTH = 5_000;
export const SUPPORT_MAX_IDEMPOTENCY_KEY_LENGTH = 100;
export const SUPPORT_MAX_MESSAGE_PAGE_SIZE = 50;
export const SUPPORT_MAX_INBOX_PAGE_SIZE = 30;
