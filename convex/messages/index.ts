import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { getPublicMediaUrl } from "../storage/publicUrl";

const MAX_CONVERSATIONS = 100;
const MAX_MESSAGE_LENGTH = 4_000;
const MESSAGE_PREVIEW_LENGTH = 120;
const MIN_SEND_INTERVAL_MS = 500;

const conversationStatusValidator = v.union(v.literal("active"), v.literal("closed"));
const senderTypeValidator = v.union(v.literal("client"), v.literal("company"));

const threadValidator = v.object({
  id: v.id("conversations"),
  projectId: v.id("projects"),
  quoteId: v.id("projectQuotes"),
  projectTitle: v.union(v.string(), v.null()),
  otherPartyName: v.string(),
  companySlug: v.union(v.string(), v.null()),
  otherPartyAvatarUrl: v.union(v.string(), v.null()),
  status: conversationStatusValidator,
  preview: v.union(v.string(), v.null()),
  lastMessageAt: v.union(v.number(), v.null()),
  unread: v.boolean(),
});

const conversationDetailValidator = v.object({
  ...threadValidator.fields,
  viewerType: senderTypeValidator,
});

const messageValidator = v.object({
  id: v.id("messages"),
  senderType: senderTypeValidator,
  body: v.string(),
  createdAt: v.number(),
  isMine: v.boolean(),
});

type MessageCtx = QueryCtx | MutationCtx;
type Viewer = { userId: Id<"users">; viewerType: "client" | "company" };

function isMessagingQuoteStatus(status: Doc<"projectQuotes">["status"]) {
  // Add future accepted/final-quote states here when those flows exist.
  return status === "discussion_open";
}

async function requireConversationAccess(
  ctx: MessageCtx,
  conversationId: Id<"conversations">,
): Promise<{ conversation: Doc<"conversations">; viewer: Viewer }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new ConvexError("CONVERSATION_NOT_FOUND");

  let viewerType: Viewer["viewerType"];
  if (user.accountType === "client" && user.onboardingStatus === "completed" && conversation.clientId === userId) {
    viewerType = "client";
  } else if (user.accountType === "company" && user.onboardingStatus === "completed") {
    const membership = await ctx.db
      .query("companyMembers")
      .withIndex("by_companyId_and_userId", (q) => q.eq("companyId", conversation.companyId).eq("userId", userId))
      .unique();
    if (!membership || membership.status !== "active") throw new ConvexError("CONVERSATION_NOT_FOUND");
    viewerType = "company";
  } else {
    throw new ConvexError("CONVERSATION_NOT_FOUND");
  }

  const [quote, project] = await Promise.all([
    ctx.db.get(conversation.quoteId),
    ctx.db.get(conversation.projectId),
  ]);
  if (!quote || quote.projectId !== conversation.projectId || quote.companyId !== conversation.companyId || !isMessagingQuoteStatus(quote.status)) {
    throw new ConvexError("CONVERSATION_LOCKED");
  }
  if (!project || project.clientId !== conversation.clientId) throw new ConvexError("CONVERSATION_NOT_FOUND");
  return { conversation, viewer: { userId, viewerType } };
}

async function logoUrlFor(ctx: MessageCtx, company: Doc<"companies">) {
  if (company.logoMediaId) {
    const media = await ctx.db.get(company.logoMediaId);
    if (media && media.companyId === company._id && media.purpose === "companyLogo") {
      return getPublicMediaUrl(media.objectKey);
    }
  }
  if (company.logoStorageId) return await ctx.storage.getUrl(company.logoStorageId);
  return null;
}

function clientDisplayName(client: Doc<"users">) {
  const firstName = client.firstName?.trim();
  const lastInitial = client.lastName?.trim().charAt(0);
  if (firstName && lastInitial) return `${firstName} ${lastInitial}.`;
  return firstName || client.name?.trim() || "";
}

async function threadFor(ctx: MessageCtx, conversation: Doc<"conversations">, viewerType: Viewer["viewerType"]) {
  const [project, company, client, quote, clientProfile] = await Promise.all([
    ctx.db.get(conversation.projectId),
    ctx.db.get(conversation.companyId),
    ctx.db.get(conversation.clientId),
    ctx.db.get(conversation.quoteId),
    viewerType === "company"
      ? ctx.db.query("clientProfiles").withIndex("by_userId", (q) => q.eq("userId", conversation.clientId)).unique()
      : null,
  ]);
  if (!project || !company || !client || !quote || project.clientId !== conversation.clientId || quote.projectId !== conversation.projectId || quote.companyId !== conversation.companyId || !isMessagingQuoteStatus(quote.status)) return null;
  const lastReadAt = viewerType === "client" ? conversation.clientLastReadAt : conversation.companyLastReadAt;
  return {
    id: conversation._id,
    projectId: conversation.projectId,
    quoteId: conversation.quoteId,
    projectTitle: project.title ?? null,
    otherPartyName: viewerType === "client" ? company.name?.trim() || "" : clientDisplayName(client),
    companySlug: viewerType === "client" ? company.slug ?? null : null,
    otherPartyAvatarUrl:
      viewerType === "client"
        ? await logoUrlFor(ctx, company)
        : clientProfile?.avatarObjectKey
          ? getPublicMediaUrl(clientProfile.avatarObjectKey)
          : null,
    status: conversation.status,
    preview: conversation.lastMessagePreview ?? null,
    lastMessageAt: conversation.lastMessageAt ?? null,
    unread: conversation.lastMessageAt !== undefined && (lastReadAt === undefined || conversation.lastMessageAt > lastReadAt),
  };
}

/** Create or return the single conversation for an already-unlocked quote. */
export async function ensureConversationForQuote(
  ctx: MutationCtx,
  quote: Doc<"projectQuotes">,
  project: Doc<"projects">,
  createdBy: Id<"users">,
) {
  if (quote.status !== "discussion_open") throw new ConvexError("CONVERSATION_LOCKED");
  if (project._id !== quote.projectId) throw new ConvexError("PROJECT_NOT_FOUND");
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", quote.projectId).eq("companyId", quote.companyId))
    .take(2);
  if (existing.length > 1) throw new ConvexError("CONVERSATION_INTEGRITY_ERROR");
  if (existing[0]) {
    if (existing[0].quoteId !== quote._id || existing[0].clientId !== project.clientId) {
      throw new ConvexError("CONVERSATION_INTEGRITY_ERROR");
    }
    return existing[0]._id;
  }
  const now = Date.now();
  return await ctx.db.insert("conversations", {
    projectId: quote.projectId,
    quoteId: quote._id,
    clientId: project.clientId,
    companyId: quote.companyId,
    status: "active",
    createdBy,
    createdAt: now,
    updatedAt: now,
    clientLastReadAt: now,
  });
}

/** Repair legacy discussion_open quotes that predate atomic conversation creation. */
export const recoverConversationForQuote = mutation({
  args: { quoteId: v.id("projectQuotes") },
  returns: v.object({ conversationId: v.id("conversations") }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const [user, quote] = await Promise.all([ctx.db.get(userId), ctx.db.get(args.quoteId)]);
    if (!user) throw new ConvexError("USER_NOT_FOUND");
    if (!quote) throw new ConvexError("QUOTE_NOT_FOUND");
    const project = await ctx.db.get(quote.projectId);
    if (!project) throw new ConvexError("QUOTE_NOT_FOUND");

    let isParticipant = false;
    if (user.accountType === "client" && user.onboardingStatus === "completed") {
      isParticipant = project.clientId === userId;
    } else if (user.accountType === "company" && user.onboardingStatus === "completed") {
      const memberships = await ctx.db
        .query("companyMembers")
        .withIndex("by_companyId_and_userId", (q) => q.eq("companyId", quote.companyId).eq("userId", userId))
        .take(2);
      isParticipant = memberships.length === 1 && memberships[0].status === "active";
    }
    if (!isParticipant) throw new ConvexError("QUOTE_NOT_FOUND");
    if (quote.status !== "discussion_open") throw new ConvexError("CONVERSATION_LOCKED");

    return {
      conversationId: await ensureConversationForQuote(ctx, quote, project, userId),
    };
  },
});

export const listMyThreads = query({
  args: {},
  returns: v.array(threadValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("USER_NOT_FOUND");
    let viewerType: Viewer["viewerType"];
    let conversations: Doc<"conversations">[];
    if (user.accountType === "client" && user.onboardingStatus === "completed") {
      viewerType = "client";
      conversations = await ctx.db.query("conversations").withIndex("by_clientId_and_updatedAt", (q) => q.eq("clientId", userId)).order("desc").take(MAX_CONVERSATIONS);
    } else if (user.accountType === "company" && user.onboardingStatus === "completed") {
      const memberships = await ctx.db.query("companyMembers").withIndex("by_userId", (q) => q.eq("userId", userId)).take(2);
      if (memberships.length !== 1 || memberships[0].status !== "active") throw new ConvexError("COMPANY_MEMBERSHIP_REQUIRED");
      viewerType = "company";
      conversations = await ctx.db.query("conversations").withIndex("by_companyId_and_updatedAt", (q) => q.eq("companyId", memberships[0].companyId)).order("desc").take(MAX_CONVERSATIONS);
    } else {
      throw new ConvexError("INVALID_ACCOUNT_TYPE");
    }
    const threads = await Promise.all(conversations.map((conversation) => threadFor(ctx, conversation, viewerType)));
    return threads.filter((thread): thread is NonNullable<typeof thread> => thread !== null);
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  returns: conversationDetailValidator,
  handler: async (ctx, args) => {
    const { conversation, viewer } = await requireConversationAccess(ctx, args.conversationId);
    const thread = await threadFor(ctx, conversation, viewer.viewerType);
    if (!thread) throw new ConvexError("CONVERSATION_NOT_FOUND");
    return { ...thread, viewerType: viewer.viewerType };
  },
});

export const listMessages = query({
  args: { conversationId: v.id("conversations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new ConvexError("INVALID_MESSAGE_PAGE_SIZE");
    }
    const { viewer } = await requireConversationAccess(ctx, args.conversationId);
    const page = await ctx.db.query("messages").withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", args.conversationId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map((message) => ({ id: message._id, senderType: message.senderType, body: message.body, createdAt: message.createdAt, isMine: message.senderUserId === viewer.userId })) };
  },
});

export const sendMessage = mutation({
  args: { conversationId: v.id("conversations"), body: v.string(), clientMessageId: v.optional(v.string()) },
  returns: v.object({ messageId: v.id("messages"), createdAt: v.number(), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const { conversation, viewer } = await requireConversationAccess(ctx, args.conversationId);
    if (conversation.status !== "active") throw new ConvexError("CONVERSATION_CLOSED");
    const body = args.body.trim();
    if (body.length < 1 || body.length > MAX_MESSAGE_LENGTH) throw new ConvexError("INVALID_MESSAGE_BODY");
    const clientMessageId = args.clientMessageId?.trim();
    if (clientMessageId && (clientMessageId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(clientMessageId))) throw new ConvexError("INVALID_MESSAGE_ID");
    if (clientMessageId) {
      const existing = await ctx.db.query("messages").withIndex("by_conversationId_and_senderUserId_and_clientMessageId", (q) => q.eq("conversationId", conversation._id).eq("senderUserId", viewer.userId).eq("clientMessageId", clientMessageId)).unique();
      if (existing) return { messageId: existing._id, createdAt: existing.createdAt, duplicate: true };
    }
    const now = Date.now();
    const lastSentAt = viewer.viewerType === "client" ? conversation.clientLastSentAt : conversation.companyLastSentAt;
    if (lastSentAt !== undefined && now - lastSentAt < MIN_SEND_INTERVAL_MS) throw new ConvexError("MESSAGE_RATE_LIMITED");
    const messageId = await ctx.db.insert("messages", { conversationId: conversation._id, senderUserId: viewer.userId, senderType: viewer.viewerType, body, clientMessageId: clientMessageId || undefined, createdAt: now });
    await ctx.db.patch(conversation._id, { updatedAt: now, lastMessageAt: now, lastMessagePreview: body.slice(0, MESSAGE_PREVIEW_LENGTH), ...(viewer.viewerType === "client" ? { clientLastReadAt: now, clientLastSentAt: now } : { companyLastReadAt: now, companyLastSentAt: now }) });
    return { messageId, createdAt: now, duplicate: false };
  },
});

export const markConversationRead = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { conversation, viewer } = await requireConversationAccess(ctx, args.conversationId);
    const now = Date.now();
    await ctx.db.patch(conversation._id, viewer.viewerType === "client" ? { clientLastReadAt: now } : { companyLastReadAt: now });
    return null;
  },
});
