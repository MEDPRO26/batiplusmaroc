import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAdminUser } from "./admin/access";
import { requireActiveCompanyMembership } from "./companies/access";
import {
  createNotificationForAllAdmins,
  createOperationalNotificationForActiveCompanyMembers,
} from "./notifications/model";

const MAX_MESSAGE_LENGTH = 5_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 100;
const MESSAGE_PREVIEW_LENGTH = 140;
const MAX_PAGE_SIZE = 50;
const MAX_CONVERSATION_PAGE_SIZE = 30;

const senderTypeValidator = v.union(v.literal("admin"), v.literal("company"));

const conversationSummaryValidator = v.object({
  id: v.id("adminCompanyConversations"),
  companyId: v.id("companies"),
  companyName: v.string(),
  messageCount: v.number(),
  readThroughSequence: v.number(),
  unreadCount: v.number(),
  hasUnread: v.boolean(),
  lastMessageAt: v.union(v.number(), v.null()),
  lastMessagePreview: v.union(v.string(), v.null()),
  lastSenderType: v.union(senderTypeValidator, v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const messageValidator = v.object({
  id: v.id("adminCompanyMessages"),
  conversationId: v.id("adminCompanyConversations"),
  senderType: senderTypeValidator,
  senderDisplayName: v.string(),
  body: v.string(),
  sequence: v.number(),
  createdAt: v.number(),
  isOwnMessage: v.boolean(),
});

const sendResultValidator = v.object({
  conversationId: v.id("adminCompanyConversations"),
  messageId: v.id("adminCompanyMessages"),
  sequence: v.number(),
  createdAt: v.number(),
  duplicate: v.boolean(),
});

const readResultValidator = v.object({
  readThroughSequence: v.number(),
  unreadCount: v.number(),
});

type MessagingCtx = QueryCtx | MutationCtx;
type SenderType = "admin" | "company";

function normalizeBody(value: string) {
  const body = value.trim();
  if (body.length < 1 || body.length > MAX_MESSAGE_LENGTH) {
    throw new ConvexError("INVALID_OPERATIONAL_MESSAGE_BODY");
  }
  return body;
}

function normalizeIdempotencyKey(value: string) {
  const key = value.trim();
  if (
    key.length < 1
    || key.length > MAX_IDEMPOTENCY_KEY_LENGTH
    || !/^[A-Za-z0-9._:-]+$/.test(key)
  ) {
    throw new ConvexError("INVALID_IDEMPOTENCY_KEY");
  }
  return key;
}

function messagePreview(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MESSAGE_PREVIEW_LENGTH);
}

function safeDisplayName(user: Doc<"users"> | null, fallback: string) {
  if (!user) return fallback;
  const fullName = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ");
  return fullName || user.name?.trim() || fallback;
}

async function readStateFor(
  ctx: MessagingCtx,
  conversationId: Id<"adminCompanyConversations">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("adminCompanyConversationReads")
    .withIndex("by_conversationId_and_userId", (q) =>
      q.eq("conversationId", conversationId).eq("userId", userId))
    .unique();
}

function unreadCount(conversation: Doc<"adminCompanyConversations">, readThroughSequence: number) {
  return Math.max(0, conversation.messageCount - readThroughSequence);
}

async function summaryFor(
  ctx: MessagingCtx,
  conversation: Doc<"adminCompanyConversations">,
  userId: Id<"users">,
) {
  const [company, readState] = await Promise.all([
    ctx.db.get(conversation.companyId),
    readStateFor(ctx, conversation._id, userId),
  ]);
  if (!company) throw new ConvexError("OPERATIONAL_CONVERSATION_NOT_FOUND");
  const readThroughSequence = Math.min(
    readState?.readThroughSequence ?? 0,
    conversation.messageCount,
  );
  const unread = unreadCount(conversation, readThroughSequence);
  return {
    id: conversation._id,
    companyId: conversation.companyId,
    companyName: company.name?.trim() || company.legalName?.trim() || "Company",
    messageCount: conversation.messageCount,
    readThroughSequence,
    unreadCount: unread,
    hasUnread: unread > 0,
    lastMessageAt: conversation.lastMessageAt ?? null,
    lastMessagePreview: conversation.lastMessagePreview ?? null,
    lastSenderType: conversation.lastSenderType ?? null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

async function findConversationForCompany(ctx: MessagingCtx, companyId: Id<"companies">) {
  return await ctx.db
    .query("adminCompanyConversations")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .unique();
}

async function getOrCreateConversation(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  now: number,
) {
  const existing = await findConversationForCompany(ctx, companyId);
  if (existing) return existing;
  const id = await ctx.db.insert("adminCompanyConversations", {
    companyId,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) throw new ConvexError("OPERATIONAL_CONVERSATION_NOT_FOUND");
  return created;
}

async function upsertReadBoundary(
  ctx: MutationCtx,
  conversationId: Id<"adminCompanyConversations">,
  userId: Id<"users">,
  sequence: number,
  now: number,
) {
  const current = await readStateFor(ctx, conversationId, userId);
  if (current) {
    if (sequence > current.readThroughSequence) {
      await ctx.db.patch(current._id, { readThroughSequence: sequence, updatedAt: now });
    }
    return Math.max(current.readThroughSequence, sequence);
  }
  await ctx.db.insert("adminCompanyConversationReads", {
    conversationId,
    userId,
    readThroughSequence: sequence,
    updatedAt: now,
  });
  return sequence;
}

async function sendOperationalMessage(
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    senderUserId: Id<"users">;
    senderType: SenderType;
    body: string;
    idempotencyKey: string;
  },
) {
  const body = normalizeBody(args.body);
  const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey);
  const prior = await ctx.db
    .query("adminCompanyMessages")
    .withIndex("by_senderUserId_and_idempotencyKey", (q) =>
      q.eq("senderUserId", args.senderUserId).eq("idempotencyKey", idempotencyKey))
    .unique();
  if (prior) {
    if (
      prior.companyId !== args.companyId
      || prior.senderType !== args.senderType
      || prior.body !== body
    ) {
      throw new ConvexError("IDEMPOTENCY_KEY_CONFLICT");
    }
    return {
      conversationId: prior.conversationId,
      messageId: prior._id,
      sequence: prior.sequence,
      createdAt: prior.createdAt,
      duplicate: true,
    };
  }

  const now = Date.now();
  const conversation = await getOrCreateConversation(ctx, args.companyId, now);
  const sequence = conversation.messageCount + 1;
  const messageId = await ctx.db.insert("adminCompanyMessages", {
    conversationId: conversation._id,
    companyId: args.companyId,
    senderUserId: args.senderUserId,
    senderType: args.senderType,
    body,
    idempotencyKey,
    sequence,
    createdAt: now,
  });
  await ctx.db.patch(conversation._id, {
    messageCount: sequence,
    lastMessageId: messageId,
    lastMessageAt: now,
    lastMessagePreview: messagePreview(body),
    lastSenderType: args.senderType,
    updatedAt: now,
  });
  // Sending proves the author has viewed through the newly appended boundary.
  // Other participants' independent read records remain untouched.
  await upsertReadBoundary(ctx, conversation._id, args.senderUserId, sequence, now);
  const [company, sender] = await Promise.all([
    ctx.db.get(args.companyId),
    ctx.db.get(args.senderUserId),
  ]);
  if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
  const companyName = company.name?.trim() || company.legalName?.trim() || "Company";
  const preview = messagePreview(body);
  const notification = {
    entity: { type: "admin_company_message" as const, id: messageId },
    payload: {
      actorDisplayName: safeDisplayName(
        sender,
        args.senderType === "admin" ? "Batiplus" : "Company member",
      ),
      companyName,
      companyId: company._id,
      messagePreview: preview,
    },
    actorUserId: args.senderUserId,
    dedupeKey: `admin-company-message:${messageId}`,
  };
  if (args.senderType === "admin") {
    await createOperationalNotificationForActiveCompanyMembers(ctx, {
      ...notification,
      companyId: company._id,
      type: "admin_company_message_received",
    });
  } else {
    await createNotificationForAllAdmins(ctx, {
      ...notification,
      type: "company_admin_message_received",
    });
  }
  return {
    conversationId: conversation._id,
    messageId,
    sequence,
    createdAt: now,
    duplicate: false,
  };
}

async function requireOperationalConversation(
  ctx: MessagingCtx,
  conversationId: Id<"adminCompanyConversations">,
) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new ConvexError("OPERATIONAL_CONVERSATION_NOT_FOUND");
  return conversation;
}

async function messageDto(
  ctx: QueryCtx,
  message: Doc<"adminCompanyMessages">,
  viewerUserId: Id<"users">,
) {
  const sender = await ctx.db.get(message.senderUserId);
  return {
    id: message._id,
    conversationId: message.conversationId,
    senderType: message.senderType,
    senderDisplayName: safeDisplayName(
      sender,
      message.senderType === "admin" ? "Batiplus" : "Company member",
    ),
    body: message.body,
    sequence: message.sequence,
    createdAt: message.createdAt,
    isOwnMessage: message.senderUserId === viewerUserId,
  };
}

async function listMessagesFor(
  ctx: QueryCtx,
  conversation: Doc<"adminCompanyConversations">,
  viewerUserId: Id<"users">,
  paginationOpts: typeof paginationOptsValidator.type,
) {
  if (
    !Number.isInteger(paginationOpts.numItems)
    || paginationOpts.numItems < 1
    || paginationOpts.numItems > MAX_PAGE_SIZE
  ) {
    throw new ConvexError("INVALID_OPERATIONAL_MESSAGE_PAGE_SIZE");
  }
  const page = await ctx.db
    .query("adminCompanyMessages")
    .withIndex("by_conversationId_and_sequence", (q) =>
      q.eq("conversationId", conversation._id))
    .order("desc")
    .paginate(paginationOpts);
  const newestFirst = await Promise.all(
    page.page.map((message) => messageDto(ctx, message, viewerUserId)),
  );
  // Native descending pagination makes continuation load older messages. Each
  // individual page is reversed for conversation rendering oldest -> newest.
  return { ...page, page: newestFirst.reverse() };
}

async function markReadThroughMessage(
  ctx: MutationCtx,
  conversation: Doc<"adminCompanyConversations">,
  userId: Id<"users">,
  messageId: Id<"adminCompanyMessages">,
) {
  const message = await ctx.db.get(messageId);
  if (!message || message.conversationId !== conversation._id) {
    throw new ConvexError("OPERATIONAL_MESSAGE_NOT_FOUND");
  }
  const readThroughSequence = await upsertReadBoundary(
    ctx,
    conversation._id,
    userId,
    message.sequence,
    Date.now(),
  );
  return {
    readThroughSequence,
    unreadCount: unreadCount(conversation, readThroughSequence),
  };
}

export const listAdminConversations = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(conversationSummaryValidator),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    if (
      !Number.isInteger(args.paginationOpts.numItems)
      || args.paginationOpts.numItems < 1
      || args.paginationOpts.numItems > MAX_CONVERSATION_PAGE_SIZE
    ) {
      throw new ConvexError("INVALID_OPERATIONAL_CONVERSATION_PAGE_SIZE");
    }
    const page = await ctx.db
      .query("adminCompanyConversations")
      .withIndex("by_updatedAt")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map((conversation) =>
        summaryFor(ctx, conversation, admin._id))),
    };
  },
});

export const getAdminConversation = query({
  args: { companyId: v.id("companies") },
  returns: v.union(conversationSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;
    const conversation = await findConversationForCompany(ctx, company._id);
    return conversation ? await summaryFor(ctx, conversation, admin._id) : null;
  },
});

export const listAdminMessages = query({
  args: {
    conversationId: v.id("adminCompanyConversations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const conversation = await requireOperationalConversation(ctx, args.conversationId);
    return await listMessagesFor(ctx, conversation, admin._id, args.paginationOpts);
  },
});

export const sendAdminMessage = mutation({
  args: {
    companyId: v.id("companies"),
    body: v.string(),
    idempotencyKey: v.string(),
  },
  returns: sendResultValidator,
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    return await sendOperationalMessage(ctx, {
      ...args,
      companyId: company._id,
      senderUserId: admin._id,
      senderType: "admin",
    });
  },
});

export const markAdminConversationRead = mutation({
  args: {
    conversationId: v.id("adminCompanyConversations"),
    readThroughMessageId: v.id("adminCompanyMessages"),
  },
  returns: readResultValidator,
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const conversation = await requireOperationalConversation(ctx, args.conversationId);
    return await markReadThroughMessage(
      ctx,
      conversation,
      admin._id,
      args.readThroughMessageId,
    );
  },
});

export const getMyConversation = query({
  args: {},
  returns: v.union(conversationSummaryValidator, v.null()),
  handler: async (ctx) => {
    const access = await requireActiveCompanyMembership(ctx);
    const conversation = await findConversationForCompany(ctx, access.company._id);
    return conversation ? await summaryFor(ctx, conversation, access.userId) : null;
  },
});

export const listMyMessages = query({
  args: {
    conversationId: v.id("adminCompanyConversations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const access = await requireActiveCompanyMembership(ctx);
    const conversation = await requireOperationalConversation(ctx, args.conversationId);
    if (conversation.companyId !== access.company._id) {
      throw new ConvexError("OPERATIONAL_CONVERSATION_NOT_FOUND");
    }
    return await listMessagesFor(ctx, conversation, access.userId, args.paginationOpts);
  },
});

export const sendCompanyMessage = mutation({
  args: { body: v.string(), idempotencyKey: v.string() },
  returns: sendResultValidator,
  handler: async (ctx, args) => {
    const access = await requireActiveCompanyMembership(ctx);
    return await sendOperationalMessage(ctx, {
      ...args,
      companyId: access.company._id,
      senderUserId: access.userId,
      senderType: "company",
    });
  },
});

export const markMyConversationRead = mutation({
  args: {
    conversationId: v.id("adminCompanyConversations"),
    readThroughMessageId: v.id("adminCompanyMessages"),
  },
  returns: readResultValidator,
  handler: async (ctx, args) => {
    const access = await requireActiveCompanyMembership(ctx);
    const conversation = await requireOperationalConversation(ctx, args.conversationId);
    if (conversation.companyId !== access.company._id) {
      throw new ConvexError("OPERATIONAL_CONVERSATION_NOT_FOUND");
    }
    return await markReadThroughMessage(
      ctx,
      conversation,
      access.userId,
      args.readThroughMessageId,
    );
  },
});
