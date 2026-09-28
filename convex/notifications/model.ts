import { ConvexError, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import {
  notificationEntityValidator,
  notificationPayloadValidator,
  notificationTypeValidator,
} from "./constants";

type NotificationType = Infer<typeof notificationTypeValidator>;
type NotificationEntity = Infer<typeof notificationEntityValidator>;
type NotificationPayload = Infer<typeof notificationPayloadValidator>;

const MAX_DEDUPE_KEY_LENGTH = 200;
const MAX_PAYLOAD_TEXT_LENGTH = 240;
const MAX_MESSAGE_PREVIEW_LENGTH = 160;

const ENTITY_TYPE_BY_NOTIFICATION_TYPE: Record<NotificationType, NotificationEntity["type"]> = {
  proposal_received: "proposal",
  proposal_accepted: "proposal",
  invitation_received: "invitation",
  invitation_accepted: "invitation",
  invitation_declined: "invitation",
  message_received: "conversation",
  site_visit_proposed: "site_visit",
  site_visit_confirmed: "site_visit",
  site_visit_rescheduled: "site_visit",
  site_visit_cancelled: "site_visit",
  final_quote_submitted: "final_quote",
  final_quote_accepted: "final_quote",
  deal_created: "deal",
  commission_due: "deal",
  commission_paid: "deal",
  deal_completed: "deal",
  review_received: "review",
  company_verification_approved: "company_verification",
  company_verification_rejected: "company_verification",
};

export type CreateNotificationArgs = {
  recipientUserId: Id<"users">;
  type: NotificationType;
  entity: NotificationEntity;
  payload: NotificationPayload;
  actorUserId?: Id<"users">;
  dedupeKey?: string;
};

type CreateCompanyNotificationArgs = Omit<CreateNotificationArgs, "recipientUserId"> & {
  companyId: Id<"companies">;
};

function validatePayload(payload: NotificationPayload) {
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      const limit = key === "messagePreview" ? MAX_MESSAGE_PREVIEW_LENGTH : MAX_PAYLOAD_TEXT_LENGTH;
      if (value.trim().length === 0 || value.length > limit) {
        throw new ConvexError("INVALID_NOTIFICATION_PAYLOAD");
      }
    }
  }
  if (payload.amountMad !== undefined && (!Number.isFinite(payload.amountMad) || payload.amountMad < 0)) {
    throw new ConvexError("INVALID_NOTIFICATION_PAYLOAD");
  }
  if (payload.scheduledAt !== undefined && (!Number.isFinite(payload.scheduledAt) || payload.scheduledAt < 0)) {
    throw new ConvexError("INVALID_NOTIFICATION_PAYLOAD");
  }
  if (payload.rating !== undefined && (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5)) {
    throw new ConvexError("INVALID_NOTIFICATION_PAYLOAD");
  }
}

/**
 * Trusted backend-only creation boundary. Domain mutations call this helper
 * in their own transaction so the domain write and notification are atomic.
 */
export async function createNotification(ctx: MutationCtx, args: CreateNotificationArgs) {
  const recipient = await ctx.db.get(args.recipientUserId);
  if (!recipient) throw new ConvexError("NOTIFICATION_RECIPIENT_NOT_FOUND");
  if (args.actorUserId && !(await ctx.db.get(args.actorUserId))) {
    throw new ConvexError("NOTIFICATION_ACTOR_NOT_FOUND");
  }
  if (ENTITY_TYPE_BY_NOTIFICATION_TYPE[args.type] !== args.entity.type || !(await ctx.db.get(args.entity.id))) {
    throw new ConvexError("INVALID_NOTIFICATION_ENTITY");
  }
  validatePayload(args.payload);

  const dedupeKey = args.dedupeKey?.trim();
  if (args.dedupeKey !== undefined && (!dedupeKey || dedupeKey.length > MAX_DEDUPE_KEY_LENGTH)) {
    throw new ConvexError("INVALID_NOTIFICATION_DEDUPE_KEY");
  }
  if (dedupeKey) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_recipientUserId_and_dedupeKey", (q) =>
        q.eq("recipientUserId", args.recipientUserId).eq("dedupeKey", dedupeKey),
      )
      .unique();
    if (existing) return { notificationId: existing._id, created: false };
  }

  const state = await ctx.db
    .query("notificationRecipientStates")
    .withIndex("by_recipientUserId", (q) => q.eq("recipientUserId", args.recipientUserId))
    .unique();
  const now = Math.max(Date.now(), (state?.readThroughAt ?? 0) + 1);
  const notificationId = await ctx.db.insert("notifications", {
    recipientUserId: args.recipientUserId,
    type: args.type,
    entity: args.entity,
    payload: args.payload,
    actorUserId: args.actorUserId,
    dedupeKey,
    createdAt: now,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.notifications.pushDelivery.deliverMarketplacePush,
    { notificationId },
  );

  if (state) {
    await ctx.db.patch(state._id, { unreadCount: state.unreadCount + 1, updatedAt: now });
  } else {
    await ctx.db.insert("notificationRecipientStates", {
      recipientUserId: args.recipientUserId,
      unreadCount: 1,
      updatedAt: now,
    });
  }
  return { notificationId, created: true };
}

/** Notify every active member with shared Company authority, excluding the actor. */
export async function createNotificationForActiveCompanyMembers(
  ctx: MutationCtx,
  args: CreateCompanyNotificationArgs,
) {
  const { companyId, ...notification } = args;
  let authorizedMemberCount = 0;
  let recipientCount = 0;
  for await (const membership of ctx.db
    .query("companyMembers")
    .withIndex("by_companyId_and_status", (q) =>
      q.eq("companyId", companyId).eq("status", "active"),
    )) {
    const member = await ctx.db.get(membership.userId);
    if (!member) throw new ConvexError("NOTIFICATION_RECIPIENT_NOT_FOUND");
    if (member.accountType !== "company" || member.onboardingStatus !== "completed") continue;
    const memberships = await ctx.db
      .query("companyMembers")
      .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
      .take(2);
    if (memberships.length !== 1 || memberships[0]._id !== membership._id) continue;
    authorizedMemberCount += 1;
    if (membership.userId === notification.actorUserId) continue;
    await createNotification(ctx, {
      ...notification,
      recipientUserId: membership.userId,
    });
    recipientCount += 1;
  }
  if (authorizedMemberCount === 0) {
    throw new ConvexError("COMPANY_NOTIFICATION_RECIPIENT_NOT_FOUND");
  }
  return { recipientCount };
}
