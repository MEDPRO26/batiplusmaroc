import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationOptions,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireAdminUser } from "../admin/access";
import { plainMessagePreview } from "../messages/attachmentRules";
import { requireClientUser, requireOwnedProject } from "../projects/access";
import { projectStatusValidator } from "../projects/constants";
import { supportContextFor as contextFor, type SupportCtx, type SupportContext } from "./access";
import { notifyClientSupportEntry } from "./notifications";
import {
  SUPPORT_MAX_BODY_LENGTH,
  SUPPORT_MAX_IDEMPOTENCY_KEY_LENGTH,
  SUPPORT_MAX_INBOX_PAGE_SIZE,
  SUPPORT_MAX_MESSAGE_PAGE_SIZE,
  supportRequestEventKeys,
  supportRequestEventKeyValidator,
  supportRequestKindValidator,
  supportSenderTypeValidator,
  type SupportSenderType,
} from "./constants";

const entryFields = {
  id: v.id("clientSupportMessages"),
  conversationId: v.id("clientSupportConversations"),
  senderDisplayName: v.string(),
  sequence: v.number(),
  createdAt: v.number(),
  isOwnMessage: v.boolean(),
};
const messageValidator = v.union(
  v.object({
    ...entryFields,
    kind: v.literal("request"),
    senderType: v.literal("client"),
    requestKind: supportRequestKindValidator,
    eventKey: supportRequestEventKeyValidator,
  }),
  v.object({
    ...entryFields,
    kind: v.literal("message"),
    senderType: supportSenderTypeValidator,
    body: v.string(),
  }),
);
const lastEntryFields = {
  id: v.id("clientSupportMessages"),
  sequence: v.number(),
  createdAt: v.number(),
};
const lastEntryValidator = v.union(
  v.object({
    ...lastEntryFields,
    kind: v.literal("request"),
    senderType: v.literal("client"),
    requestKind: supportRequestKindValidator,
    eventKey: supportRequestEventKeyValidator,
  }),
  v.object({
    ...lastEntryFields,
    kind: v.literal("message"),
    senderType: supportSenderTypeValidator,
    preview: v.string(),
  }),
);
const summaryValidator = v.object({
  id: v.id("clientSupportConversations"),
  project: v.object({
    id: v.id("projects"),
    title: v.union(v.string(), v.null()),
    city: v.union(v.string(), v.null()),
    status: projectStatusValidator,
  }),
  clientDisplayName: v.string(),
  requestedKinds: v.array(supportRequestKindValidator),
  entryCount: v.number(),
  readThroughSequence: v.number(),
  unreadCount: v.number(),
  hasUnread: v.boolean(),
  lastEntry: v.union(lastEntryValidator, v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const sendResultValidator = v.object({
  conversationId: v.id("clientSupportConversations"),
  messageId: v.id("clientSupportMessages"),
  sequence: v.number(),
  createdAt: v.number(),
  duplicate: v.boolean(),
});
const readResultValidator = v.object({
  readThroughSequence: v.number(),
  unreadCount: v.number(),
});

function safeDisplayName(user: Doc<"users"> | null) {
  return [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(" ")
    || user?.name?.trim() || "";
}

async function findConversation(ctx: SupportCtx, projectId: Id<"projects">) {
  return await ctx.db.query("clientSupportConversations")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId)).unique();
}

async function requireConversation(ctx: SupportCtx, id: Id<"clientSupportConversations">) {
  const conversation = await ctx.db.get(id);
  const context = conversation ? await contextFor(ctx, conversation) : null;
  if (!context) throw new ConvexError("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
  return context;
}

async function requireClientConversation(ctx: SupportCtx, id: Id<"clientSupportConversations">) {
  const { userId } = await requireClientUser(ctx);
  const context = await requireConversation(ctx, id);
  if (context.conversation.clientId !== userId) {
    throw new ConvexError("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
  }
  return { ...context, userId };
}

async function readStateFor(
  ctx: SupportCtx,
  conversationId: Id<"clientSupportConversations">,
  userId: Id<"users">,
) {
  return await ctx.db.query("clientSupportConversationReads")
    .withIndex("by_conversationId_and_userId", (q) =>
      q.eq("conversationId", conversationId).eq("userId", userId)).unique();
}

function checkedReadPosition(position: number, entryCount: number) {
  if (!Number.isSafeInteger(position) || position < 0 || position > entryCount) {
    throw new ConvexError("INVALID_CLIENT_SUPPORT_READ_POSITION");
  }
  return position;
}

async function advanceRead(
  ctx: MutationCtx,
  conversation: Doc<"clientSupportConversations">,
  userId: Id<"users">,
  sequence: number,
  now: number,
) {
  checkedReadPosition(sequence, conversation.entryCount);
  const current = await readStateFor(ctx, conversation._id, userId);
  const previous = checkedReadPosition(current?.readThroughSequence ?? 0, conversation.entryCount);
  const next = Math.max(previous, sequence);
  if (current) {
    if (next > previous) {
      await ctx.db.patch(current._id, { readThroughSequence: next, updatedAt: now });
    }
  } else {
    await ctx.db.insert("clientSupportConversationReads", {
      conversationId: conversation._id, userId, readThroughSequence: next, updatedAt: now,
    });
  }
  return next;
}

async function summaryFor(ctx: SupportCtx, context: SupportContext, userId: Id<"users">) {
  const { conversation, project, client } = context;
  const [readState, lastEntry] = await Promise.all([
    readStateFor(ctx, conversation._id, userId),
    conversation.lastEntryId ? ctx.db.get(conversation.lastEntryId) : null,
  ]);
  if (lastEntry && lastEntry.conversationId !== conversation._id) {
    throw new ConvexError("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
  }
  const readThroughSequence = checkedReadPosition(
    readState?.readThroughSequence ?? 0, conversation.entryCount,
  );
  const unreadCount = conversation.entryCount - readThroughSequence;
  const lastEntryDto = lastEntry ? {
    id: lastEntry._id,
    sequence: lastEntry.sequence,
    createdAt: lastEntry.createdAt,
    ...(lastEntry.kind === "request" ? {
      kind: "request" as const,
      senderType: lastEntry.senderType,
      requestKind: lastEntry.requestKind,
      eventKey: supportRequestEventKeys[lastEntry.requestKind],
    } : {
      kind: "message" as const,
      senderType: lastEntry.senderType,
      preview: plainMessagePreview(lastEntry.body) ?? "",
    }),
  } : null;
  return {
    id: conversation._id,
    project: {
      id: project._id,
      title: project.title?.trim() || null,
      city: project.city ?? null,
      status: project.status,
    },
    clientDisplayName: safeDisplayName(client),
    requestedKinds: [
      ...(conversation.freeHelpRequestId ? ["free_help" as const] : []),
      ...(conversation.coordinationRequestId ? ["coordination_discussion" as const] : []),
    ],
    entryCount: conversation.entryCount,
    readThroughSequence,
    unreadCount,
    hasUnread: unreadCount > 0,
    lastEntry: lastEntryDto,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function validatePageSize(options: PaginationOptions, maximum: number) {
  if (!Number.isInteger(options.numItems) || options.numItems < 1 || options.numItems > maximum) {
    throw new ConvexError("INVALID_CLIENT_SUPPORT_PAGE_SIZE");
  }
}

async function listMessages(
  ctx: QueryCtx,
  conversation: Doc<"clientSupportConversations">,
  userId: Id<"users">,
  options: PaginationOptions,
) {
  validatePageSize(options, SUPPORT_MAX_MESSAGE_PAGE_SIZE);
  const page = await ctx.db.query("clientSupportMessages")
    .withIndex("by_conversationId_and_sequence", (q) => q.eq("conversationId", conversation._id))
    .order("desc").paginate(options);
  const messages = await Promise.all(page.page.map(async (entry) => {
    const sender = await ctx.db.get(entry.senderUserId);
    const base = {
      id: entry._id,
      conversationId: entry.conversationId,
      senderDisplayName: safeDisplayName(sender),
      sequence: entry.sequence,
      createdAt: entry.createdAt,
      isOwnMessage: entry.senderUserId === userId,
    };
    return entry.kind === "request" ? {
      ...base, kind: entry.kind, senderType: entry.senderType,
      requestKind: entry.requestKind, eventKey: supportRequestEventKeys[entry.requestKind],
    } : { ...base, kind: entry.kind, senderType: entry.senderType, body: entry.body };
  }));
  // Continuation loads older entries; each page renders in ascending sequence.
  return { ...page, page: messages.reverse() };
}

function resultFor(entry: Doc<"clientSupportMessages">, duplicate: boolean) {
  return {
    conversationId: entry.conversationId, messageId: entry._id,
    sequence: entry.sequence, createdAt: entry.createdAt, duplicate,
  };
}

async function sendMessage(
  ctx: MutationCtx,
  conversation: Doc<"clientSupportConversations">,
  userId: Id<"users">,
  senderType: SupportSenderType,
  bodyValue: string,
  keyValue: string,
) {
  const body = bodyValue.trim();
  const key = keyValue.trim();
  if (body.length < 1 || body.length > SUPPORT_MAX_BODY_LENGTH) {
    throw new ConvexError("INVALID_CLIENT_SUPPORT_MESSAGE_BODY");
  }
  if (
    key.length < 1 || key.length > SUPPORT_MAX_IDEMPOTENCY_KEY_LENGTH
    || !/^[A-Za-z0-9._:-]+$/.test(key)
  ) {
    throw new ConvexError("INVALID_IDEMPOTENCY_KEY");
  }
  // Callers have already rechecked authorization and the current Project owner.
  const prior = await ctx.db.query("clientSupportMessages")
    .withIndex("by_senderUserId_and_idempotencyKey", (q) =>
      q.eq("senderUserId", userId).eq("idempotencyKey", key)).unique();
  if (prior) {
    if (
      prior.kind !== "message" || prior.conversationId !== conversation._id
      || prior.body !== body || prior.senderType !== senderType
    ) {
      throw new ConvexError("IDEMPOTENCY_KEY_CONFLICT");
    }
    return resultFor(prior, true);
  }
  const now = Date.now();
  const sequence = conversation.entryCount + 1;
  const messageId = await ctx.db.insert("clientSupportMessages", {
    conversationId: conversation._id, senderUserId: userId, senderType,
    kind: "message", body, idempotencyKey: key, sequence, createdAt: now,
  });
  await ctx.db.patch(conversation._id, { entryCount: sequence, lastEntryId: messageId, updatedAt: now });
  await advanceRead(ctx, { ...conversation, entryCount: sequence }, userId, sequence, now);
  await notifyClientSupportEntry(ctx, messageId);
  return { conversationId: conversation._id, messageId, sequence, createdAt: now, duplicate: false };
}

async function markRead(
  ctx: MutationCtx,
  conversation: Doc<"clientSupportConversations">,
  userId: Id<"users">,
  messageId: Id<"clientSupportMessages">,
) {
  const entry = await ctx.db.get(messageId);
  if (
    !entry || entry.conversationId !== conversation._id
    || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1
    || entry.sequence > conversation.entryCount
  ) {
    throw new ConvexError("CLIENT_SUPPORT_MESSAGE_NOT_FOUND");
  }
  const readThroughSequence = await advanceRead(ctx, conversation, userId, entry.sequence, Date.now());
  return { readThroughSequence, unreadCount: conversation.entryCount - readThroughSequence };
}

export const requestSupport = mutation({
  args: { projectId: v.id("projects"), requestKind: supportRequestKindValidator },
  returns: sendResultValidator,
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    await requireOwnedProject(ctx, userId, args.projectId);
    const now = Date.now();
    let conversation = await findConversation(ctx, args.projectId);
    if (conversation) {
      // A repeated request must not bypass ownership/relationship validation.
      await requireConversation(ctx, conversation._id);
    } else {
      const id = await ctx.db.insert("clientSupportConversations", {
        projectId: args.projectId, clientId: userId, entryCount: 0, createdAt: now, updatedAt: now,
      });
      conversation = await ctx.db.get(id);
    }
    if (!conversation) throw new ConvexError("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
    const priorId = args.requestKind === "free_help"
      ? conversation.freeHelpRequestId : conversation.coordinationRequestId;
    if (priorId) {
      const prior = await ctx.db.get(priorId);
      if (
        !prior || prior.conversationId !== conversation._id
        || prior.kind !== "request" || prior.requestKind !== args.requestKind
        || prior.senderUserId !== conversation.clientId
      ) {
        throw new ConvexError("CLIENT_SUPPORT_MESSAGE_NOT_FOUND");
      }
      return resultFor(prior, true);
    }
    const sequence = conversation.entryCount + 1;
    const messageId = await ctx.db.insert("clientSupportMessages", {
      conversationId: conversation._id, senderUserId: userId, senderType: "client",
      kind: "request", requestKind: args.requestKind, sequence, createdAt: now,
    });
    await ctx.db.patch(conversation._id, {
      entryCount: sequence, lastEntryId: messageId, updatedAt: now,
      ...(args.requestKind === "free_help" ? { freeHelpRequestId: messageId } : { coordinationRequestId: messageId }),
    });
    await advanceRead(ctx, { ...conversation, entryCount: sequence }, userId, sequence, now);
    await notifyClientSupportEntry(ctx, messageId);
    return { conversationId: conversation._id, messageId, sequence, createdAt: now, duplicate: false };
  },
});

export const getMyConversation = query({
  args: { projectId: v.id("projects") },
  returns: v.union(summaryValidator, v.null()),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    await requireOwnedProject(ctx, userId, args.projectId);
    const conversation = await findConversation(ctx, args.projectId);
    return conversation ? await summaryFor(ctx, await requireConversation(ctx, conversation._id), userId) : null;
  },
});

export const getAdminConversation = query({
  args: { projectId: v.id("projects") },
  returns: v.union(summaryValidator, v.null()),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    if (!await ctx.db.get(args.projectId)) return null;
    const conversation = await findConversation(ctx, args.projectId);
    return conversation ? await summaryFor(ctx, await requireConversation(ctx, conversation._id), admin._id) : null;
  },
});

export const listAdminConversations = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(summaryValidator),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    validatePageSize(args.paginationOpts, SUPPORT_MAX_INBOX_PAGE_SIZE);
    const page = await ctx.db.query("clientSupportConversations")
      .withIndex("by_updatedAt").order("desc").paginate(args.paginationOpts);
    const summaries = await Promise.all(page.page.map(async (conversation) => {
      const context = await contextFor(ctx, conversation);
      return context ? await summaryFor(ctx, context, admin._id) : null;
    }));
    // Invalid relationships cannot expose old history or block unrelated inbox rows.
    return { ...page, page: summaries.filter((summary) => summary !== null) };
  },
});

export const listMyMessages = query({
  args: { conversationId: v.id("clientSupportConversations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const { conversation, userId } = await requireClientConversation(ctx, args.conversationId);
    return await listMessages(ctx, conversation, userId, args.paginationOpts);
  },
});

export const listAdminMessages = query({
  args: { conversationId: v.id("clientSupportConversations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const { conversation } = await requireConversation(ctx, args.conversationId);
    return await listMessages(ctx, conversation, admin._id, args.paginationOpts);
  },
});

export const sendClientMessage = mutation({
  args: { conversationId: v.id("clientSupportConversations"), body: v.string(), idempotencyKey: v.string() },
  returns: sendResultValidator,
  handler: async (ctx, args) => {
    const { conversation, userId } = await requireClientConversation(ctx, args.conversationId);
    return await sendMessage(ctx, conversation, userId, "client", args.body, args.idempotencyKey);
  },
});

export const sendAdminMessage = mutation({
  args: { conversationId: v.id("clientSupportConversations"), body: v.string(), idempotencyKey: v.string() },
  returns: sendResultValidator,
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const { conversation } = await requireConversation(ctx, args.conversationId);
    return await sendMessage(ctx, conversation, admin._id, "admin", args.body, args.idempotencyKey);
  },
});

export const markMyConversationRead = mutation({
  args: { conversationId: v.id("clientSupportConversations"), readThroughMessageId: v.id("clientSupportMessages") },
  returns: readResultValidator,
  handler: async (ctx, args) => {
    const { conversation, userId } = await requireClientConversation(ctx, args.conversationId);
    return await markRead(ctx, conversation, userId, args.readThroughMessageId);
  },
});

export const markAdminConversationRead = mutation({
  args: { conversationId: v.id("clientSupportConversations"), readThroughMessageId: v.id("clientSupportMessages") },
  returns: readResultValidator,
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const { conversation } = await requireConversation(ctx, args.conversationId);
    return await markRead(ctx, conversation, admin._id, args.readThroughMessageId);
  },
});
