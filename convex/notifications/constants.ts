import { v } from "convex/values";

export const NOTIFICATION_TYPES = [
  "proposal_received",
  "proposal_accepted",
  "invitation_received",
  "invitation_accepted",
  "invitation_declined",
  "message_received",
  "site_visit_proposed",
  "site_visit_confirmed",
  "site_visit_rescheduled",
  "site_visit_cancelled",
  "final_quote_submitted",
  "final_quote_accepted",
  "deal_created",
  "commission_due",
  "commission_paid",
  "deal_completed",
  "review_received",
  "company_verification_approved",
  "company_verification_rejected",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notificationTypeValidator = v.union(
  v.literal("proposal_received"),
  v.literal("proposal_accepted"),
  v.literal("invitation_received"),
  v.literal("invitation_accepted"),
  v.literal("invitation_declined"),
  v.literal("message_received"),
  v.literal("site_visit_proposed"),
  v.literal("site_visit_confirmed"),
  v.literal("site_visit_rescheduled"),
  v.literal("site_visit_cancelled"),
  v.literal("final_quote_submitted"),
  v.literal("final_quote_accepted"),
  v.literal("deal_created"),
  v.literal("commission_due"),
  v.literal("commission_paid"),
  v.literal("deal_completed"),
  v.literal("review_received"),
  v.literal("company_verification_approved"),
  v.literal("company_verification_rejected"),
);

/**
 * A constrained navigation reference. The client derives the localized route
 * and copy from `type`; arbitrary URLs and table names are never stored.
 */
export const notificationEntityValidator = v.union(
  v.object({ type: v.literal("project"), id: v.id("projects") }),
  v.object({ type: v.literal("proposal"), id: v.id("projectQuotes") }),
  v.object({ type: v.literal("invitation"), id: v.id("invitations") }),
  v.object({ type: v.literal("conversation"), id: v.id("conversations") }),
  v.object({ type: v.literal("site_visit"), id: v.id("siteVisits") }),
  v.object({ type: v.literal("final_quote"), id: v.id("finalQuotes") }),
  v.object({ type: v.literal("deal"), id: v.id("deals") }),
  v.object({ type: v.literal("review"), id: v.id("reviews") }),
  v.object({ type: v.literal("company_verification"), id: v.id("companyVerifications") }),
);

/**
 * Locale-neutral interpolation data only. Rendered FR/EN strings do not
 * belong in persisted notification data.
 */
export const notificationPayloadValidator = v.object({
  actorDisplayName: v.optional(v.string()),
  projectTitle: v.optional(v.string()),
  companyName: v.optional(v.string()),
  messagePreview: v.optional(v.string()),
  scheduledAt: v.optional(v.number()),
  amountMad: v.optional(v.number()),
  rating: v.optional(v.number()),
});
