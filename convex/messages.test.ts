/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

async function seedUser(t: Backend, accountType: "client" | "company" | "admin" | "seo_team") {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${crypto.randomUUID()}@messages.test`, firstName: accountType === "client" ? "Khadija" : "Youssef",
    lastName: "Test", accountType, countryCode: "MA", acceptedTerms: true, termsAcceptedAt: 1,
    marketingOptIn: false, onboardingStatus: "completed", createdAt: 1, updatedAt: 1,
  }));
}

async function preparePdfUpload(
  state: Awaited<ReturnType<typeof setup>>,
  conversationId: Id<"conversations">,
  contents = "%PDF-1.7 test attachment",
  fileName = "plans.pdf",
) {
  const blob = new Blob([contents], { type: "application/pdf" });
  const company = asUser(state.t, state.company.userId);
  const intent = await company.mutation(api.messages.attachments.generateAttachmentUploadUrl, {
    conversationId,
    fileName,
    contentType: "application/pdf",
    size: blob.size,
  });
  const storageId = await state.t.run((ctx) => ctx.storage.store(blob));
  return { ...intent, storageId, size: blob.size };
}

async function seedCompany(t: Backend) {
  const userId = await seedUser(t, "company");
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name: `Atlas ${crypto.randomUUID().slice(0, 5)}`, slug: `atlas-${crypto.randomUUID()}`,
    city: "Rabat", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
  }));
  await t.run((ctx) => ctx.db.insert("companyMembers", { companyId, userId, role: "owner", status: "active", createdAt: 1 }));
  return { userId, companyId };
}

async function seedProject(t: Backend, clientId: Id<"users">) {
  return await t.run((ctx) => ctx.db.insert("projects", {
    clientId, primaryCategory: "renovation", city: "rabat", countryCode: "MA", title: "Apartment renovation",
    propertyType: "apartment", surface: 90, surfaceUnknown: false, description: "A complete renovation project.",
    budgetRange: "100000_250000", budgetMin: 100_000, budgetMax: 250_000, budgetUnknown: false,
    timeline: "one_to_three_months", visibility: "marketplace", status: "published", lastCompletedStep: 6,
    createdAt: 1, updatedAt: 1, submittedAt: 1, publishedAt: 1,
  }));
}

async function seedQuote(t: Backend, projectId: Id<"projects">, companyId: Id<"companies">, submittedByUserId: Id<"users">, status: "submitted" | "viewed" | "shortlisted" | "discussion_open" | "declined" | "withdrawn" = "submitted") {
  return await t.run((ctx) => ctx.db.insert("projectQuotes", {
    projectId, companyId, submittedByUserId, message: "We can complete this project with our experienced team.",
    estimatedPrice: 150_000, currency: "MAD", estimatedDuration: 60, availableStartDate: "2099-01-01",
    scope: "Full renovation, site management, finishing, and final cleanup.", quoteType: "initial", status,
    createdAt: 1, updatedAt: 1, submittedAt: 1,
  }));
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function setup() {
  const t = convexTest(schema, modules);
  const clientId = await seedUser(t, "client");
  const otherClientId = await seedUser(t, "client");
  const company = await seedCompany(t);
  const otherCompany = await seedCompany(t);
  const projectId = await seedProject(t, clientId);
  const quoteId = await seedQuote(t, projectId, company.companyId, company.userId);
  return { t, clientId, otherClientId, company, otherCompany, projectId, quoteId };
}

async function openDiscussion(state: Awaited<ReturnType<typeof setup>>) {
  return await asUser(state.t, state.clientId).mutation(api.quotes.index.reviewInitialQuote, {
    quoteId: state.quoteId, action: "open_discussion",
  });
}

describe("conversation unlock and uniqueness", () => {
  test("has no conversation before discussion_open and rejects unauthenticated inbox access", async () => {
    const state = await setup();
    await expect(state.t.query(api.messages.index.listMyThreads, {})).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.clientId).query(api.messages.index.listMyThreads, {})).resolves.toEqual([]);
    await expect(asUser(state.t, state.company.userId).query(api.messages.index.listMyThreads, {})).resolves.toEqual([]);
  });

  test("only the project owner opens discussion and repeated opens return one conversation", async () => {
    const state = await setup();
    await expect(asUser(state.t, state.otherClientId).mutation(api.quotes.index.reviewInitialQuote, { quoteId: state.quoteId, action: "open_discussion" })).rejects.toThrow("PROJECT_NOT_FOUND");
    await expect(asUser(state.t, state.company.userId).mutation(api.quotes.index.reviewInitialQuote, { quoteId: state.quoteId, action: "open_discussion" })).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    const first = await openDiscussion(state);
    const second = await openDiscussion(state);
    expect(first.conversationId).toBeTruthy();
    expect(second.conversationId).toBe(first.conversationId);
    const conversations = await state.t.run((ctx) => ctx.db.query("conversations").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", state.projectId).eq("companyId", state.company.companyId)).take(10));
    expect(conversations).toHaveLength(1);
    const history = await state.t.run((ctx) => ctx.db.query("quoteStatusHistory").withIndex("by_quoteId", (q) => q.eq("quoteId", state.quoteId)).collect());
    expect(history.filter((item) => item.newStatus === "discussion_open")).toHaveLength(1);
  });

  test.each(["declined", "withdrawn"] as const)("does not open a conversation for a %s quote", async (status) => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.quoteId, { status }));
    await expect(openDiscussion(state)).rejects.toThrow("INVALID_QUOTE_STATUS_TRANSITION");
  });
});

describe("legacy conversation recovery", () => {
  test("the project owner repairs a legacy discussion exactly once without changing quote history", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.quoteId, { status: "discussion_open" }));
    const beforeHistory = await state.t.run((ctx) => ctx.db.query("quoteStatusHistory").withIndex("by_quoteId", (q) => q.eq("quoteId", state.quoteId)).collect());

    const first = await asUser(state.t, state.clientId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId });
    const second = await asUser(state.t, state.clientId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId });

    expect(second.conversationId).toBe(first.conversationId);
    const stored = await state.t.run(async (ctx) => ({
      conversations: await ctx.db.query("conversations").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", state.projectId).eq("companyId", state.company.companyId)).take(10),
      history: await ctx.db.query("quoteStatusHistory").withIndex("by_quoteId", (q) => q.eq("quoteId", state.quoteId)).collect(),
      quote: await ctx.db.get(state.quoteId),
    }));
    expect(stored.conversations).toHaveLength(1);
    expect(stored.conversations[0]).toMatchObject({
      _id: first.conversationId,
      projectId: state.projectId,
      quoteId: state.quoteId,
      clientId: state.clientId,
      companyId: state.company.companyId,
      createdBy: state.clientId,
    });
    expect(stored.quote?.status).toBe("discussion_open");
    expect(stored.history).toEqual(beforeHistory);
  });

  test("an active member of the quote company can repair but cannot transition the quote", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.quoteId, { status: "discussion_open" }));

    const recovered = await asUser(state.t, state.company.userId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId });
    const stored = await state.t.run(async (ctx) => ({
      conversation: await ctx.db.get(recovered.conversationId),
      history: await ctx.db.query("quoteStatusHistory").withIndex("by_quoteId", (q) => q.eq("quoteId", state.quoteId)).collect(),
      quote: await ctx.db.get(state.quoteId),
    }));
    expect(stored.conversation?.createdBy).toBe(state.company.userId);
    expect(stored.quote?.status).toBe("discussion_open");
    expect(stored.history).toEqual([]);
  });

  test("both participants receive the existing conversation and never create a duplicate", async () => {
    const state = await setup();
    const opened = await openDiscussion(state);
    const clientRecovery = await asUser(state.t, state.clientId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId });
    const companyRecovery = await asUser(state.t, state.company.userId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId });
    expect(clientRecovery.conversationId).toBe(opened.conversationId);
    expect(companyRecovery.conversationId).toBe(opened.conversationId);
    const conversations = await state.t.run((ctx) => ctx.db.query("conversations").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", state.projectId).eq("companyId", state.company.companyId)).take(10));
    expect(conversations).toHaveLength(1);
  });

  test("rejects unauthenticated and cross-tenant recovery without revealing the quote", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.quoteId, { status: "discussion_open" }));
    const adminId = await seedUser(state.t, "admin");
    await expect(state.t.mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.otherClientId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId })).rejects.toThrow("QUOTE_NOT_FOUND");
    await expect(asUser(state.t, state.otherCompany.userId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId })).rejects.toThrow("QUOTE_NOT_FOUND");
    await expect(asUser(state.t, adminId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId })).rejects.toThrow("QUOTE_NOT_FOUND");
  });

  test("rejects an inactive member of the quote company", async () => {
    const state = await setup();
    await state.t.run(async (ctx) => {
      await ctx.db.patch(state.quoteId, { status: "discussion_open" });
      const membership = await ctx.db.query("companyMembers").withIndex("by_companyId_and_userId", (q) => q.eq("companyId", state.company.companyId).eq("userId", state.company.userId)).unique();
      if (!membership) throw new Error("Missing test membership");
      await ctx.db.patch(membership._id, { status: "inactive" });
    });
    await expect(asUser(state.t, state.company.userId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId })).rejects.toThrow("QUOTE_NOT_FOUND");
  });

  test.each(["submitted", "viewed", "shortlisted", "declined", "withdrawn"] as const)("does not recover a %s quote", async (status) => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.quoteId, { status }));
    await expect(asUser(state.t, state.clientId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId })).rejects.toThrow("CONVERSATION_LOCKED");
    await expect(asUser(state.t, state.company.userId).mutation(api.messages.index.recoverConversationForQuote, { quoteId: state.quoteId })).rejects.toThrow("CONVERSATION_LOCKED");
    const conversations = await state.t.run((ctx) => ctx.db.query("conversations").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", state.projectId).eq("companyId", state.company.companyId)).take(10));
    expect(conversations).toEqual([]);
  });

  test("the development backfill is opt-in, bounded, and idempotent", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.quoteId, { status: "discussion_open" }));
    delete process.env.ALLOW_DEV_CONVERSATION_RECOVERY;
    await expect(state.t.query(internal.dev.conversationRecovery.inspectLegacyDiscussions, { confirmDevelopment: true })).rejects.toThrow("ALLOW_DEV_CONVERSATION_RECOVERY");

    process.env.ALLOW_DEV_CONVERSATION_RECOVERY = "true";
    try {
      await expect(state.t.query(internal.dev.conversationRecovery.inspectLegacyDiscussions, { confirmDevelopment: false })).rejects.toThrow("ALLOW_DEV_CONVERSATION_RECOVERY");
      await expect(state.t.query(internal.dev.conversationRecovery.inspectLegacyDiscussions, { confirmDevelopment: true })).resolves.toMatchObject({ candidates: 1, missing: 1, existing: 0, truncated: false });
      await expect(state.t.mutation(internal.dev.conversationRecovery.backfillLegacyDiscussions, { confirmDevelopment: true })).resolves.toMatchObject({ candidates: 1, created: 1, existing: 0, truncated: false });
      await expect(state.t.mutation(internal.dev.conversationRecovery.backfillLegacyDiscussions, { confirmDevelopment: true })).resolves.toMatchObject({ candidates: 1, created: 0, existing: 1, truncated: false });
      const stored = await state.t.run(async (ctx) => ({
        conversations: await ctx.db.query("conversations").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", state.projectId).eq("companyId", state.company.companyId)).take(10),
        history: await ctx.db.query("quoteStatusHistory").withIndex("by_quoteId", (q) => q.eq("quoteId", state.quoteId)).collect(),
      }));
      expect(stored.conversations).toHaveLength(1);
      expect(stored.history).toEqual([]);
    } finally {
      delete process.env.ALLOW_DEV_CONVERSATION_RECOVERY;
    }
  });
});

describe("conversation authorization and privacy", () => {
  test("only the owning client and active company member can list/read", async () => {
    const state = await setup();
    const opened = await openDiscussion(state);
    const conversationId = opened.conversationId!;
    await expect(asUser(state.t, state.clientId).query(api.messages.index.getConversation, { conversationId })).resolves.toMatchObject({ id: conversationId, viewerType: "client" });
    await expect(asUser(state.t, state.company.userId).query(api.messages.index.getConversation, { conversationId })).resolves.toMatchObject({ id: conversationId, viewerType: "company" });
    await expect(asUser(state.t, state.otherClientId).query(api.messages.index.getConversation, { conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, state.otherCompany.userId).query(api.messages.index.getConversation, { conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    const adminId = await seedUser(state.t, "admin");
    await expect(asUser(state.t, adminId).query(api.messages.index.getConversation, { conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(state.t.query(api.messages.index.getConversation, { conversationId })).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("returns safe DTOs without private contact or legal fields", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    const dto = await asUser(state.t, state.company.userId).query(api.messages.index.getConversation, { conversationId: conversationId! });
    expect(dto).not.toHaveProperty("email");
    expect(dto).not.toHaveProperty("phone");
    expect(dto).not.toHaveProperty("address");
    expect(dto).not.toHaveProperty("legalName");
    expect(Object.keys(dto).sort()).toEqual(["companySlug", "id", "lastMessageAt", "otherPartyAvatarUrl", "otherPartyName", "preview", "projectId", "projectTitle", "quoteId", "status", "unread", "viewerType"].sort());
  });

  test("scopes conversation lists across two independent client/company relationships", async () => {
    const state = await setup();
    const first = await openDiscussion(state);
    const secondProjectId = await seedProject(state.t, state.otherClientId);
    const secondQuoteId = await seedQuote(state.t, secondProjectId, state.otherCompany.companyId, state.otherCompany.userId);
    const second = await asUser(state.t, state.otherClientId).mutation(api.quotes.index.reviewInitialQuote, {
      quoteId: secondQuoteId,
      action: "open_discussion",
    });

    const clientOne = await asUser(state.t, state.clientId).query(api.messages.index.listMyThreads, {});
    const clientTwo = await asUser(state.t, state.otherClientId).query(api.messages.index.listMyThreads, {});
    const companyOne = await asUser(state.t, state.company.userId).query(api.messages.index.listMyThreads, {});
    const companyTwo = await asUser(state.t, state.otherCompany.userId).query(api.messages.index.listMyThreads, {});
    expect(clientOne.map((thread) => thread.id)).toEqual([first.conversationId]);
    expect(companyOne.map((thread) => thread.id)).toEqual([first.conversationId]);
    expect(clientTwo.map((thread) => thread.id)).toEqual([second.conversationId]);
    expect(companyTwo.map((thread) => thread.id)).toEqual([second.conversationId]);
  });

  test("revokes conversation access when the company membership becomes inactive", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    await state.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("companyMembers")
        .withIndex("by_companyId_and_userId", (q) => q.eq("companyId", state.company.companyId).eq("userId", state.company.userId))
        .unique();
      if (!membership) throw new Error("Missing test membership");
      await ctx.db.patch(membership._id, { status: "inactive" });
    });
    await expect(asUser(state.t, state.company.userId).query(api.messages.index.getConversation, { conversationId: conversationId! })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, state.company.userId).query(api.messages.index.listMyThreads, {})).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
  });
});

describe("message sending, ordering, pagination, and read state", () => {
  test("participants send trimmed text, duplicate keys are idempotent, and the quote status is unchanged", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    const client = asUser(state.t, state.clientId);
    const first = await client.mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "  Hello from the client.  ", clientMessageId: "first-message" });
    const duplicate = await client.mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "Hello from the client.", clientMessageId: "first-message" });
    expect(duplicate).toMatchObject({ messageId: first.messageId, duplicate: true });
    await state.t.run((ctx) => ctx.db.patch(conversationId!, { clientLastSentAt: Date.now() + 1_000 }));
    await expect(client.mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "Accidental rapid duplicate", clientMessageId: "second-message" })).rejects.toThrow("MESSAGE_RATE_LIMITED");
    await expect(asUser(state.t, state.company.userId).mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "Hello from the company." })).resolves.toMatchObject({ duplicate: false });
    const stored = await state.t.run(async (ctx) => ({ messages: await ctx.db.query("messages").withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", conversationId!)).collect(), quote: await ctx.db.get(state.quoteId) }));
    expect(stored.messages.map((message) => message.body)).toEqual(["Hello from the client.", "Hello from the company."]);
    expect(stored.quote?.status).toBe("discussion_open");
  });

  test("rejects empty, oversized, unauthenticated, and non-participant sends", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    await expect(asUser(state.t, state.clientId).mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "   " })).rejects.toThrow("INVALID_MESSAGE_BODY");
    await expect(asUser(state.t, state.clientId).mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "x".repeat(4001) })).rejects.toThrow("INVALID_MESSAGE_BODY");
    await expect(state.t.mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "Hello" })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.otherCompany.userId).mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "Hello" })).rejects.toThrow("CONVERSATION_NOT_FOUND");
  });

  test("rejects new messages after the conversation is closed", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    await state.t.run((ctx) => ctx.db.patch(conversationId!, { status: "closed" }));
    await expect(asUser(state.t, state.clientId).mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "No longer allowed" })).rejects.toThrow("CONVERSATION_CLOSED");
  });

  test("rejects reading and sending when a seeded conversation is still locked", async () => {
    const state = await setup();
    const conversationId = await state.t.run((ctx) => ctx.db.insert("conversations", { projectId: state.projectId, quoteId: state.quoteId, clientId: state.clientId, companyId: state.company.companyId, status: "active", createdBy: state.clientId, createdAt: 1, updatedAt: 1 }));
    await expect(asUser(state.t, state.clientId).query(api.messages.index.listMessages, { conversationId, paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("CONVERSATION_LOCKED");
    await expect(asUser(state.t, state.company.userId).mutation(api.messages.index.sendMessage, { conversationId, body: "Still locked" })).rejects.toThrow("CONVERSATION_LOCKED");
  });

  test.each(["declined", "withdrawn"] as const)("rejects sends if the linked quote becomes %s", async (status) => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    await state.t.run((ctx) => ctx.db.patch(state.quoteId, { status }));
    await expect(asUser(state.t, state.clientId).mutation(api.messages.index.sendMessage, { conversationId: conversationId!, body: "This must stay locked" })).rejects.toThrow("CONVERSATION_LOCKED");
  });

  test("returns newest-first bounded pages and updates unread state", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    await state.t.run(async (ctx) => {
      await ctx.db.insert("messages", { conversationId: conversationId!, senderUserId: state.clientId, senderType: "client", body: "Old", createdAt: 10 });
      await ctx.db.insert("messages", { conversationId: conversationId!, senderUserId: state.company.userId, senderType: "company", body: "New", createdAt: 20 });
      await ctx.db.patch(conversationId!, { lastMessageAt: 20, lastMessagePreview: "New", updatedAt: 20, clientLastReadAt: 10 });
    });
    const client = asUser(state.t, state.clientId);
    const firstPage = await client.query(api.messages.index.listMessages, { conversationId: conversationId!, paginationOpts: { numItems: 1, cursor: null } });
    expect(firstPage.page.map((message) => message.body)).toEqual(["New"]);
    expect(firstPage.isDone).toBe(false);
    const secondPage = await client.query(api.messages.index.listMessages, { conversationId: conversationId!, paginationOpts: { numItems: 1, cursor: firstPage.continueCursor } });
    expect(secondPage.page.map((message) => message.body)).toEqual(["Old"]);
    await expect(client.query(api.messages.index.listMessages, { conversationId: conversationId!, paginationOpts: { numItems: 51, cursor: null } })).rejects.toThrow("INVALID_MESSAGE_PAGE_SIZE");
    expect((await client.query(api.messages.index.listMyThreads, {}))[0].unread).toBe(true);
    await client.mutation(api.messages.index.markConversationRead, { conversationId: conversationId! });
    expect((await client.query(api.messages.index.listMyThreads, {}))[0].unread).toBe(false);
  });
});

describe("private company PDF message attachments", () => {
  test("a verified company sends text with a PDF and a PDF-only message without changing marketplace state", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    const activityBefore = await state.t.run((ctx) => ctx.db.query("marketplaceActivity").collect());
    const firstUpload = await preparePdfUpload(state, conversationId!, "%PDF-1.7 construction plan", "../Plan chantier.pdf");
    const company = asUser(state.t, state.company.userId);
    const sent = await company.action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: conversationId!, body: "Voici le plan.", clientMessageId: "pdf-message-one",
      uploadToken: firstUpload.uploadToken, storageId: firstUpload.storageId,
    });
    const duplicate = await company.action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: conversationId!, body: "Voici le plan.", clientMessageId: "pdf-message-one",
      uploadToken: firstUpload.uploadToken, storageId: firstUpload.storageId,
    });
    expect(duplicate).toMatchObject({ messageId: sent.messageId, attachmentId: sent.attachmentId, duplicate: true });

    await state.t.run((ctx) => ctx.db.patch(conversationId!, { companyLastSentAt: 0 }));
    const secondUpload = await preparePdfUpload(state, conversationId!, "%PDF-1.4 supporting document", "document.pdf");
    await company.action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: conversationId!, body: "", clientMessageId: "pdf-message-two",
      uploadToken: secondUpload.uploadToken, storageId: secondUpload.storageId,
    });

    const clientPage = await asUser(state.t, state.clientId).query(api.messages.index.listMessages, { conversationId: conversationId!, paginationOpts: { numItems: 10, cursor: null } });
    const companyPage = await company.query(api.messages.index.listMessages, { conversationId: conversationId!, paginationOpts: { numItems: 10, cursor: null } });
    expect(clientPage.page).toHaveLength(2);
    expect(companyPage.page).toHaveLength(2);
    expect(clientPage.page.map((message) => message.attachment?.fileName).sort()).toEqual(["Plan chantier.pdf", "document.pdf"]);
    expect(clientPage.page.find((message) => message.body === "")?.attachment?.downloadUrl).toContain("/api/messages/attachments/");

    const invariants = await state.t.run(async (ctx) => ({
      quote: await ctx.db.get(state.quoteId),
      finalQuotes: await ctx.db.query("finalQuotes").collect(),
      activity: await ctx.db.query("marketplaceActivity").collect(),
      attachments: await ctx.db.query("messageAttachments").withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", conversationId!)).collect(),
    }));
    expect(invariants.quote?.status).toBe("discussion_open");
    expect(invariants.finalQuotes).toEqual([]);
    expect(invariants.activity).toEqual(activityBefore);
    expect(invariants.attachments).toHaveLength(2);
  });

  test("only the verified company participant can create upload intents", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    const args = { conversationId: conversationId!, fileName: "document.pdf", contentType: "application/pdf", size: 128 };
    await expect(state.t.mutation(api.messages.attachments.generateAttachmentUploadUrl, args)).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.clientId).mutation(api.messages.attachments.generateAttachmentUploadUrl, args)).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, state.otherClientId).mutation(api.messages.attachments.generateAttachmentUploadUrl, args)).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, state.otherCompany.userId).mutation(api.messages.attachments.generateAttachmentUploadUrl, args)).rejects.toThrow("CONVERSATION_NOT_FOUND");
    const adminId = await seedUser(state.t, "admin");
    const seoId = await seedUser(state.t, "seo_team");
    await expect(asUser(state.t, adminId).mutation(api.messages.attachments.generateAttachmentUploadUrl, args)).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, seoId).mutation(api.messages.attachments.generateAttachmentUploadUrl, args)).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, state.company.userId).mutation(api.messages.attachments.generateAttachmentUploadUrl, { ...args, contentType: "text/plain" })).rejects.toThrow("INVALID_MESSAGE_PDF");
    await expect(asUser(state.t, state.company.userId).mutation(api.messages.attachments.generateAttachmentUploadUrl, { ...args, size: 10 * 1024 * 1024 + 1 })).rejects.toThrow("MESSAGE_PDF_TOO_LARGE");
  });

  test("rejects spoofed PDF bytes and removes the rejected upload", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    const upload = await preparePdfUpload(state, conversationId!, "this is not a PDF", "fake.pdf");
    await expect(asUser(state.t, state.company.userId).action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: conversationId!, body: "Keep this text", clientMessageId: "fake-pdf",
      uploadToken: upload.uploadToken, storageId: upload.storageId,
    })).rejects.toThrow("INVALID_MESSAGE_PDF");
    const cleanup = await state.t.run(async (ctx) => ({
      blobExists: Boolean(await ctx.storage.get(upload.storageId)),
      intent: await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", (q) => q.eq("token", upload.uploadToken)).unique(),
      messages: await ctx.db.query("messages").withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", conversationId!)).collect(),
    }));
    expect(cleanup.blobExists).toBe(false);
    expect(cleanup.intent).toBeNull();
    expect(cleanup.messages).toEqual([]);
  });

  test("binds each upload token to its conversation and current messaging permission", async () => {
    const state = await setup();
    const first = await openDiscussion(state);
    const secondProjectId = await seedProject(state.t, state.otherClientId);
    const secondQuoteId = await seedQuote(state.t, secondProjectId, state.company.companyId, state.company.userId);
    const second = await asUser(state.t, state.otherClientId).mutation(api.quotes.index.reviewInitialQuote, { quoteId: secondQuoteId, action: "open_discussion" });
    const upload = await preparePdfUpload(state, first.conversationId!);
    const company = asUser(state.t, state.company.userId);
    await expect(company.action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: second.conversationId!, body: "Wrong conversation", clientMessageId: "wrong-conversation",
      uploadToken: upload.uploadToken, storageId: upload.storageId,
    })).rejects.toThrow("INVALID_MESSAGE_PDF");
    await state.t.run((ctx) => ctx.db.patch(first.conversationId!, { status: "closed" }));
    await expect(company.action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: first.conversationId!, body: "Closed", clientMessageId: "closed-conversation",
      uploadToken: upload.uploadToken, storageId: upload.storageId,
    })).rejects.toThrow("CONVERSATION_NOT_FOUND");
  });

  test("attachment metadata and download authorization are participant-only", async () => {
    const state = await setup();
    const { conversationId } = await openDiscussion(state);
    const upload = await preparePdfUpload(state, conversationId!);
    const result = await asUser(state.t, state.company.userId).action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: conversationId!, body: "Private PDF", clientMessageId: "private-pdf",
      uploadToken: upload.uploadToken, storageId: upload.storageId,
    });
    await expect(asUser(state.t, state.clientId).query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: result.attachmentId })).resolves.toMatchObject({ storageId: upload.storageId, fileName: "plans.pdf" });
    await expect(asUser(state.t, state.company.userId).query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: result.attachmentId })).resolves.toMatchObject({ storageId: upload.storageId });
    await expect(asUser(state.t, state.otherClientId).query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: result.attachmentId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, state.otherCompany.userId).query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: result.attachmentId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    const adminId = await seedUser(state.t, "admin");
    const seoId = await seedUser(state.t, "seo_team");
    await expect(asUser(state.t, adminId).query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: result.attachmentId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, seoId).query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: result.attachmentId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(state.t.query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: result.attachmentId })).rejects.toThrow("NOT_AUTHENTICATED");
  });
});
