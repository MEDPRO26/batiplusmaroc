import type { Doc } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { companyFileNamesForConversation, companyFileNamesForRelationship, companyNameForAudience, maskCompanyNamesInText, resolveCompanyIdentityAudienceForUser, type CompanyFileNameReference, type CompanyNameAudience } from "../lib/companyName";
import { plainMessagePreview } from "../messages/attachmentRules";

/** Sanitize legacy as well as new records at inbox and push output boundaries. */
export function notificationCompanyIdentity(
  payload: Doc<"notifications">["payload"],
  audience: CompanyNameAudience,
  actorType?: Doc<"users">["accountType"],
  additionalNames: readonly unknown[] = [],
  files: readonly CompanyFileNameReference[] = [],
): Doc<"notifications">["payload"] {
  // Backend callers must resolve the audience from stored auth/recipient data.
  if (audience === "admin" || audience === "own_company") return payload;
  const companyAlias = payload.companyName?.trim();
  const maskActor = actorType !== "client" && actorType !== "admin"
    || (companyAlias !== undefined && payload.actorDisplayName?.trim() === companyAlias);
  const names = audience === "deal_client" ? []
    : [companyAlias, ...additionalNames, maskActor ? payload.actorDisplayName : undefined];
  return {
    ...payload,
    ...(payload.projectTitle === undefined ? {} : { projectTitle: maskCompanyNamesInText(payload.projectTitle, names, files) }),
    ...(payload.messagePreview === undefined ? {} : { messagePreview: maskCompanyNamesInText(payload.messagePreview, names, files) }),
    ...(payload.companyName === undefined ? {} : { companyName: companyNameForAudience(payload.companyName, audience) }),
    ...(payload.actorDisplayName === undefined || !maskActor
      ? {}
      : { actorDisplayName: companyNameForAudience(payload.actorDisplayName, audience) }),
  };
}

/** Resolve visibility from stored entity ownership, never a browser-supplied role. */
export async function notificationIdentityForRecipient(
  ctx: QueryCtx | MutationCtx,
  notification: Doc<"notifications">,
) {
  const [entity, actor, recipient] = await Promise.all([
    ctx.db.get(notification.entity.id),
    notification.actorUserId ? ctx.db.get(notification.actorUserId) : null,
    ctx.db.get(notification.recipientUserId),
  ]);
  const companyId = entity && "companyId" in entity ? entity.companyId : undefined;
  const company = companyId ? await ctx.db.get(companyId) : null;
  // Never infer a Company relationship from a payload alias/companyId, actor,
  // or the user currently running a scheduled delivery. Use the stored entity.
  const audience: CompanyNameAudience = companyId
    ? await resolveCompanyIdentityAudienceForUser(ctx, companyId, recipient)
    : recipient?.accountType === "admin" ? "admin" : "public";
  const names = audience === "deal_client" ? [] : [company?.name, company?.legalName];
  let payload = notification.payload;
  let files: readonly CompanyFileNameReference[] = [];
  if (audience !== "admin" && audience !== "own_company" && notification.type === "message_received" && notification.entity.type === "conversation") {
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
          payload = { ...payload, messagePreview: plainMessagePreview(maskCompanyNamesInText(source, names, files)) };
        }
      }
    }
  }
  if (audience !== "admin" && audience !== "own_company" && files.length === 0) {
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
    audience,
  };
}
