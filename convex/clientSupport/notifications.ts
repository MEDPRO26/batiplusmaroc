import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { supportNotificationTypeFor } from "../notifications/clientSupportAccess";
import { createNotification, createNotificationForAllAdmins } from "../notifications/model";
import { supportContextFor } from "./access";

/** Called only after a new entry is written, inside the same support transaction. */
export async function notifyClientSupportEntry(ctx: MutationCtx, entryId: Id<"clientSupportMessages">) {
  const entry = await ctx.db.get(entryId);
  const conversation = entry ? await ctx.db.get(entry.conversationId) : null;
  const context = conversation ? await supportContextFor(ctx, conversation) : null;
  if (!entry || !context) throw new ConvexError("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
  const notification = {
    type: supportNotificationTypeFor(entry),
    entity: { type: "client_support_entry" as const, id: entry._id },
    payload: {},
    actorUserId: entry.senderUserId,
    dedupeKey: `client-support:${entry._id}:received`,
  };
  return entry.senderType === "client"
    ? await createNotificationForAllAdmins(ctx, notification)
    : await createNotification(ctx, { ...notification, recipientUserId: context.client._id });
}
