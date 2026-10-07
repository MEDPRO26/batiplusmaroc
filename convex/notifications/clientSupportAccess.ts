import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { supportContextFor } from "../clientSupport/access";
import { isClientSupportNotificationType, type ClientSupportNotificationType } from "./constants";

type SupportNotification = Pick<Doc<"notifications">, "type" | "entity" | "recipientUserId" | "actorUserId">;

export function supportNotificationTypeFor(entry: Doc<"clientSupportMessages">): ClientSupportNotificationType {
  if (entry.kind === "request") {
    return entry.requestKind === "free_help"
      ? "client_support_free_help_requested" : "client_support_coordination_requested";
  }
  return entry.senderType === "client"
    ? "client_support_client_message_received" : "client_support_admin_reply_received";
}

/** Resolve only an authorized destination ID, never any support/private content. */
export async function clientSupportNotificationProject(
  ctx: QueryCtx | MutationCtx,
  notification: SupportNotification,
) {
  if (!isClientSupportNotificationType(notification.type) || notification.entity.type !== "client_support_entry") return null;
  const entry = await ctx.db.get(notification.entity.id);
  if (!entry || supportNotificationTypeFor(entry) !== notification.type) return null;
  const conversation = await ctx.db.get(entry.conversationId);
  const context = conversation ? await supportContextFor(ctx, conversation) : null;
  if (
    !context || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1
    || entry.sequence > context.conversation.entryCount
    || notification.actorUserId !== entry.senderUserId
    || notification.recipientUserId === entry.senderUserId
  ) return null;
  if (entry.senderType === "client" && entry.senderUserId !== context.client._id) return null;
  if (entry.kind === "request") {
    const requestId = entry.requestKind === "free_help"
      ? context.conversation.freeHelpRequestId : context.conversation.coordinationRequestId;
    if (requestId !== entry._id) return null;
  }
  const recipient = await ctx.db.get(notification.recipientUserId);
  if (!recipient) return null;
  // Same current eligibility as requireAdminUser, with no assignment/onboarding gate.
  const allowed = entry.senderType === "client"
    ? recipient.accountType === "admin"
    : recipient._id === context.client._id;
  return allowed ? context.project._id : null;
}
