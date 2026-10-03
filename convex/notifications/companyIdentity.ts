import type { Doc } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { companyFileNamesForConversation, companyFileNamesForRelationship, maskCompanyName, maskCompanyNamesInText, type CompanyFileNameReference } from "../lib/companyName";
import { plainMessagePreview } from "../messages/attachmentRules";

/** Sanitize legacy as well as new records at inbox and push output boundaries. */
export function notificationCompanyIdentity(
  payload: Doc<"notifications">["payload"],
  recipientType: Doc<"users">["accountType"],
  actorType?: Doc<"users">["accountType"],
  additionalNames: readonly unknown[] = [],
  files: readonly CompanyFileNameReference[] = [],
): Doc<"notifications">["payload"] {
  // Backend callers must verify own-Company membership before passing "company".
  if (recipientType === "admin" || recipientType === "company") return payload;
  const companyAlias = payload.companyName?.trim();
  const maskActor = actorType !== "client" && actorType !== "admin"
    || (companyAlias !== undefined && payload.actorDisplayName?.trim() === companyAlias);
  const names = [companyAlias, ...additionalNames, maskActor ? payload.actorDisplayName : undefined];
  return {
    ...payload,
    ...(payload.projectTitle === undefined ? {} : { projectTitle: maskCompanyNamesInText(payload.projectTitle, names, files) }),
    ...(payload.messagePreview === undefined ? {} : { messagePreview: maskCompanyNamesInText(payload.messagePreview, names, files) }),
    ...(payload.companyName === undefined ? {} : { companyName: maskCompanyName(payload.companyName) }),
    ...(payload.actorDisplayName === undefined || !maskActor
      ? {}
      : { actorDisplayName: maskCompanyName(payload.actorDisplayName) }),
  };
}

/** Resolve visibility from stored entity ownership, never a browser-supplied role. */
export async function notificationIdentityForRecipient(
  ctx: QueryCtx | MutationCtx,
  notification: Doc<"notifications">,
  recipientType: Doc<"users">["accountType"],
) {
  const [entity, actor] = await Promise.all([
    ctx.db.get(notification.entity.id),
    notification.actorUserId ? ctx.db.get(notification.actorUserId) : null,
  ]);
  const companyId = entity && "companyId" in entity ? entity.companyId : undefined;
  const company = companyId ? await ctx.db.get(companyId) : null;
  const membership = recipientType === "company" && companyId
    ? await ctx.db.query("companyMembers").withIndex("by_companyId_and_userId", q =>
        q.eq("companyId", companyId).eq("userId", notification.recipientUserId)).unique()
    : null;
  const audience = recipientType === "company" && membership?.status !== "active"
    ? undefined : recipientType;
  let payload = notification.payload;
  let files: readonly CompanyFileNameReference[] = [];
  if (audience !== "admin" && audience !== "company" && notification.type === "message_received" && notification.entity.type === "conversation") {
    // The dedupe key identifies the exact message, including historical previews
    // truncated before the filename extension. Do not guess from display text.
    const rawMessageId = /^message:(.+):received$/.exec(notification.dedupeKey ?? "")?.[1];
    const messageId = rawMessageId ? ctx.db.normalizeId("messages", rawMessageId) : null;
    const message = messageId ? await ctx.db.get(messageId) : null;
    if (message?.conversationId === notification.entity.id) {
      const attachment = await ctx.db.query("messageAttachments").withIndex("by_messageId", q => q.eq("messageId", message._id)).unique();
      if (attachment && attachment.conversationId !== notification.entity.id) throw new ConvexError("MESSAGE_ATTACHMENT_INTEGRITY_ERROR");
      const conversation = await ctx.db.get(message.conversationId);
      if (conversation) {
        const source = message.body || attachment?.originalFileName;
        files = await companyFileNamesForConversation(ctx, conversation, [source, payload.projectTitle],
          attachment ? [{ originalFileName: attachment.originalFileName, kind: "attachment" }] : []);
        // Rebuild from the immutable source, not a previously truncated preview.
        // Strip markup/whitespace only after literal filename replacement.
        if (source !== undefined) {
          payload = { ...payload, messagePreview: plainMessagePreview(maskCompanyNamesInText(source, [company?.name, company?.legalName], files)) };
        }
      }
    }
  }
  if (audience !== "admin" && audience !== "company" && files.length === 0) {
    const conversationId = notification.entity.type === "conversation" ? notification.entity.id
      : entity && "conversationId" in entity ? ctx.db.normalizeId("conversations", entity.conversationId) : null;
    const conversation = conversationId ? await ctx.db.get(conversationId) : null;
    if (conversation) files = await companyFileNamesForConversation(ctx, conversation, [payload.projectTitle, payload.messagePreview]);
    else if (entity && "projectId" in entity && companyId) {
      const project = await ctx.db.get(entity.projectId);
      if (project) files = await companyFileNamesForRelationship(ctx, project._id, companyId, project.clientId, [payload.projectTitle, payload.messagePreview]);
    }
  }
  return {
    payload: notificationCompanyIdentity(payload, audience, actor?.accountType, [company?.name, company?.legalName], files),
    actorType: actor?.accountType,
  };
}
