/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function seedUser(
  t: Backend,
  accountType: "admin" | "client" | "company" | "seo_team",
  name: string,
  onboardingStatus: "pending" | "completed" = "completed",
) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${name.toLowerCase()}-${crypto.randomUUID()}@operational.test`,
    firstName: name,
    lastName: "Test",
    accountType,
    onboardingStatus,
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function seedCompany(
  t: Backend,
  name: string,
  onboardingStatus: "pending" | "completed" = "completed",
) {
  return await t.run((ctx) => ctx.db.insert("companies", {
    name,
    legalName: `${name} SARL`,
    onboardingStatus,
    verificationStatus: "draft",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function addMember(
  t: Backend,
  companyId: Id<"companies">,
  userId: Id<"users">,
  status: "active" | "inactive" = "active",
  role: "owner" | "staff" = "owner",
) {
  return await t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId,
    userId,
    role,
    status,
    createdAt: 1,
  }));
}

async function setup() {
  const t = convexTest(schema, modules);
  const adminA = await seedUser(t, "admin", "AdminA");
  const adminB = await seedUser(t, "admin", "AdminB");
  const client = await seedUser(t, "client", "Client");
  const seo = await seedUser(t, "seo_team", "SEO");
  const owner = await seedUser(t, "company", "Owner", "pending");
  const staff = await seedUser(t, "company", "Staff");
  const inactive = await seedUser(t, "company", "Inactive");
  const otherMember = await seedUser(t, "company", "Other");
  const companyId = await seedCompany(t, "Atlas Operations", "pending");
  const otherCompanyId = await seedCompany(t, "Rif Operations");
  await addMember(t, companyId, owner);
  await addMember(t, companyId, staff, "active", "staff");
  await addMember(t, companyId, inactive, "inactive", "staff");
  await addMember(t, otherCompanyId, otherMember);
  return {
    t,
    adminA,
    adminB,
    client,
    seo,
    owner,
    staff,
    inactive,
    otherMember,
    companyId,
    otherCompanyId,
  };
}

const firstPage = (numItems = 20) => ({ paginationOpts: { numItems, cursor: null } });

describe("operational conversation creation and send", () => {
  test("Admin and Company can each initiate while one conversation per Company is preserved", async () => {
    const state = await setup();
    const adminSend = await asUser(state.t, state.adminA).mutation(
      api.adminCompanyMessaging.sendAdminMessage,
      { companyId: state.companyId, body: "  Welcome to Batiplus operations.  ", idempotencyKey: "admin-first" },
    );
    const companySend = await asUser(state.t, state.owner).mutation(
      api.adminCompanyMessaging.sendCompanyMessage,
      { body: "Thank you, we are ready.", idempotencyKey: "company-reply" },
    );
    expect(companySend.conversationId).toBe(adminSend.conversationId);
    expect([adminSend.sequence, companySend.sequence]).toEqual([1, 2]);

    const otherFirst = await asUser(state.t, state.otherMember).mutation(
      api.adminCompanyMessaging.sendCompanyMessage,
      { body: "Company initiated support request", idempotencyKey: "other-first" },
    );
    const rows = await state.t.run((ctx) =>
      ctx.db.query("adminCompanyConversations").withIndex("by_companyId", (q) =>
        q.eq("companyId", state.companyId)).take(3));
    expect(rows).toHaveLength(1);
    expect(otherFirst.conversationId).not.toBe(adminSend.conversationId);

    const stored = await state.t.run(async (ctx) => ({
      conversation: await ctx.db.get(adminSend.conversationId),
      messages: await ctx.db.query("adminCompanyMessages")
        .withIndex("by_conversationId_and_sequence", (q) =>
          q.eq("conversationId", adminSend.conversationId)).take(10),
    }));
    expect(stored.conversation).toMatchObject({
      companyId: state.companyId,
      messageCount: 2,
      lastMessageId: companySend.messageId,
      lastSenderType: "company",
      lastMessagePreview: "Thank you, we are ready.",
    });
    expect(stored.messages.map((message) => ({
      body: message.body,
      senderType: message.senderType,
      senderUserId: message.senderUserId,
    }))).toEqual([
      {
        body: "Welcome to Batiplus operations.",
        senderType: "admin",
        senderUserId: state.adminA,
      },
      {
        body: "Thank you, we are ready.",
        senderType: "company",
        senderUserId: state.owner,
      },
    ]);
  });

  test("concurrent first sends serialize to one Company conversation", async () => {
    const state = await setup();
    const [adminSend, companySend] = await Promise.all([
      asUser(state.t, state.adminA).mutation(api.adminCompanyMessaging.sendAdminMessage, {
        companyId: state.companyId,
        body: "Admin concurrent first send",
        idempotencyKey: "concurrent-admin",
      }),
      asUser(state.t, state.owner).mutation(api.adminCompanyMessaging.sendCompanyMessage, {
        body: "Company concurrent first send",
        idempotencyKey: "concurrent-company",
      }),
    ]);
    expect(adminSend.conversationId).toBe(companySend.conversationId);
    const stored = await state.t.run(async (ctx) => ({
      conversations: await ctx.db.query("adminCompanyConversations")
        .withIndex("by_companyId", (q) => q.eq("companyId", state.companyId)).take(10),
      messages: await ctx.db.query("adminCompanyMessages")
        .withIndex("by_conversationId_and_sequence", (q) =>
          q.eq("conversationId", adminSend.conversationId)).take(10),
    }));
    expect(stored.conversations).toHaveLength(1);
    expect(stored.conversations[0].messageCount).toBe(2);
    expect(stored.messages.map((message) => message.sequence)).toEqual([1, 2]);
  });

  test("send is idempotent and rejects key reuse with conflicting body or Company context", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminA);
    const first = await admin.mutation(api.adminCompanyMessaging.sendAdminMessage, {
      companyId: state.companyId,
      body: "A deterministic message",
      idempotencyKey: "request-123",
    });
    const retry = await admin.mutation(api.adminCompanyMessaging.sendAdminMessage, {
      companyId: state.companyId,
      body: "  A deterministic message  ",
      idempotencyKey: "request-123",
    });
    expect(retry).toEqual({ ...first, duplicate: true });
    await expect(admin.mutation(api.adminCompanyMessaging.sendAdminMessage, {
      companyId: state.companyId,
      body: "Different body",
      idempotencyKey: "request-123",
    })).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
    await expect(admin.mutation(api.adminCompanyMessaging.sendAdminMessage, {
      companyId: state.otherCompanyId,
      body: "A deterministic message",
      idempotencyKey: "request-123",
    })).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");

    const stored = await state.t.run(async (ctx) => ({
      conversations: await ctx.db.query("adminCompanyConversations").take(10),
      messages: await ctx.db.query("adminCompanyMessages").take(10),
    }));
    expect(stored.conversations).toHaveLength(1);
    expect(stored.messages).toHaveLength(1);
    expect(stored.conversations[0].messageCount).toBe(1);
  });

  test("validates trimmed text and idempotency keys", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminA);
    for (const body of ["", "   ", "x".repeat(5_001)]) {
      await expect(admin.mutation(api.adminCompanyMessaging.sendAdminMessage, {
        companyId: state.companyId,
        body,
        idempotencyKey: crypto.randomUUID(),
      })).rejects.toThrow("INVALID_OPERATIONAL_MESSAGE_BODY");
    }
    for (const idempotencyKey of ["", "has spaces", "x".repeat(101)]) {
      await expect(admin.mutation(api.adminCompanyMessaging.sendAdminMessage, {
        companyId: state.companyId,
        body: "Valid body",
        idempotencyKey,
      })).rejects.toThrow("INVALID_IDEMPOTENCY_KEY");
    }
  });
});

describe("operational messaging authorization", () => {
  test("enforces the role matrix and derives Company scope from active membership", async () => {
    const state = await setup();
    const sent = await asUser(state.t, state.adminA).mutation(
      api.adminCompanyMessaging.sendAdminMessage,
      { companyId: state.companyId, body: "Authorized message", idempotencyKey: "auth-message" },
    );

    await expect(asUser(state.t, state.adminA).query(
      api.adminCompanyMessaging.listAdminMessages,
      { conversationId: sent.conversationId, ...firstPage() },
    )).resolves.toMatchObject({ page: [{ body: "Authorized message" }] });
    await expect(asUser(state.t, state.owner).query(
      api.adminCompanyMessaging.listMyMessages,
      { conversationId: sent.conversationId, ...firstPage() },
    )).resolves.toMatchObject({ page: [{ body: "Authorized message" }] });

    await expect(state.t.query(api.adminCompanyMessaging.getMyConversation, {}))
      .rejects.toThrow("NOT_AUTHENTICATED");
    await expect(state.t.mutation(api.adminCompanyMessaging.sendCompanyMessage, {
      body: "Anonymous cannot send",
      idempotencyKey: "anonymous",
    })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(state.t.query(
      api.adminCompanyMessaging.listAdminMessages,
      { conversationId: sent.conversationId, ...firstPage() },
    )).rejects.toThrow("NOT_AUTHENTICATED");
    for (const denied of [state.client, state.seo]) {
      await expect(asUser(state.t, denied).query(api.adminCompanyMessaging.getMyConversation, {}))
        .rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
      await expect(asUser(state.t, denied).query(
        api.adminCompanyMessaging.listAdminMessages,
        { conversationId: sent.conversationId, ...firstPage() },
      )).rejects.toThrow("ADMIN_REQUIRED");
      await expect(asUser(state.t, denied).mutation(
        api.adminCompanyMessaging.sendCompanyMessage,
        { body: "Wrong role", idempotencyKey: `wrong-role-${denied}` },
      )).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    }
    await expect(asUser(state.t, state.inactive).query(api.adminCompanyMessaging.getMyConversation, {}))
      .rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await expect(asUser(state.t, state.inactive).mutation(
      api.adminCompanyMessaging.sendCompanyMessage,
      { body: "Inactive cannot send", idempotencyKey: "inactive-send" },
    )).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await expect(asUser(state.t, state.otherMember).query(
      api.adminCompanyMessaging.listMyMessages,
      { conversationId: sent.conversationId, ...firstPage() },
    )).rejects.toThrow("OPERATIONAL_CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, state.otherMember).mutation(
      api.adminCompanyMessaging.markMyConversationRead,
      { conversationId: sent.conversationId, readThroughMessageId: sent.messageId },
    )).rejects.toThrow("OPERATIONAL_CONVERSATION_NOT_FOUND");

    // Support access intentionally does not require completed onboarding or
    // Company verification: only current active membership is authoritative.
    await expect(asUser(state.t, state.owner).mutation(
      api.adminCompanyMessaging.sendCompanyMessage,
      { body: "Pending onboarding can contact support", idempotencyKey: "pending-support" },
    )).resolves.toMatchObject({ conversationId: sent.conversationId, duplicate: false });
  });

  test("ambiguous memberships fail closed", async () => {
    const state = await setup();
    await addMember(state.t, state.otherCompanyId, state.owner, "active", "staff");
    await expect(asUser(state.t, state.owner).query(api.adminCompanyMessaging.getMyConversation, {}))
      .rejects.toThrow("DUPLICATE_ACCOUNT_FOUNDATION");
    await expect(asUser(state.t, state.owner).mutation(
      api.adminCompanyMessaging.sendCompanyMessage,
      { body: "Must fail closed", idempotencyKey: "ambiguous" },
    )).rejects.toThrow("DUPLICATE_ACCOUNT_FOUNDATION");
  });
});

describe("operational read boundaries", () => {
  test("keeps owner, staff, Admin A and Admin B read state independent", async () => {
    const state = await setup();
    const first = await asUser(state.t, state.adminA).mutation(
      api.adminCompanyMessaging.sendAdminMessage,
      { companyId: state.companyId, body: "First", idempotencyKey: "read-first" },
    );
    const ownerBefore = await asUser(state.t, state.owner).query(
      api.adminCompanyMessaging.getMyConversation,
      {},
    );
    const staffBefore = await asUser(state.t, state.staff).query(
      api.adminCompanyMessaging.getMyConversation,
      {},
    );
    const adminABefore = await asUser(state.t, state.adminA).query(
      api.adminCompanyMessaging.getAdminConversation,
      { companyId: state.companyId },
    );
    const adminBBefore = await asUser(state.t, state.adminB).query(
      api.adminCompanyMessaging.getAdminConversation,
      { companyId: state.companyId },
    );
    expect([ownerBefore?.unreadCount, staffBefore?.unreadCount, adminABefore?.unreadCount, adminBBefore?.unreadCount])
      .toEqual([1, 1, 0, 1]);

    await asUser(state.t, state.owner).mutation(
      api.adminCompanyMessaging.markMyConversationRead,
      { conversationId: first.conversationId, readThroughMessageId: first.messageId },
    );
    expect((await asUser(state.t, state.owner).query(api.adminCompanyMessaging.getMyConversation, {}))?.unreadCount).toBe(0);
    expect((await asUser(state.t, state.staff).query(api.adminCompanyMessaging.getMyConversation, {}))?.unreadCount).toBe(1);

    await asUser(state.t, state.adminB).mutation(
      api.adminCompanyMessaging.markAdminConversationRead,
      { conversationId: first.conversationId, readThroughMessageId: first.messageId },
    );
    const companyReply = await asUser(state.t, state.owner).mutation(
      api.adminCompanyMessaging.sendCompanyMessage,
      { body: "Reply", idempotencyKey: "read-reply" },
    );
    expect((await asUser(state.t, state.owner).query(api.adminCompanyMessaging.getMyConversation, {}))?.unreadCount).toBe(0);
    expect((await asUser(state.t, state.staff).query(api.adminCompanyMessaging.getMyConversation, {}))?.unreadCount).toBe(2);
    expect((await asUser(state.t, state.adminA).query(api.adminCompanyMessaging.getAdminConversation, { companyId: state.companyId }))?.unreadCount).toBe(1);
    expect((await asUser(state.t, state.adminB).query(api.adminCompanyMessaging.getAdminConversation, { companyId: state.companyId }))?.unreadCount).toBe(1);

    const reads = await state.t.run((ctx) =>
      ctx.db.query("adminCompanyConversationReads")
        .withIndex("by_conversationId_and_userId", (q) =>
          q.eq("conversationId", companyReply.conversationId)).take(10));
    expect(new Set(reads.map((read) => read.userId))).toEqual(
      new Set([state.adminA, state.adminB, state.owner]),
    );
  });

  test("a same-millisecond message after mark-read stays unread by sequence", async () => {
    const state = await setup();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    try {
      const first = await asUser(state.t, state.adminA).mutation(
        api.adminCompanyMessaging.sendAdminMessage,
        { companyId: state.companyId, body: "Visible", idempotencyKey: "same-ms-1" },
      );
      await asUser(state.t, state.owner).mutation(
        api.adminCompanyMessaging.markMyConversationRead,
        { conversationId: first.conversationId, readThroughMessageId: first.messageId },
      );
      const second = await asUser(state.t, state.adminA).mutation(
        api.adminCompanyMessaging.sendAdminMessage,
        { companyId: state.companyId, body: "Arrived later", idempotencyKey: "same-ms-2" },
      );
      expect(second.createdAt).toBe(first.createdAt);
      expect(second.sequence).toBe(first.sequence + 1);
      const summary = await asUser(state.t, state.owner).query(
        api.adminCompanyMessaging.getMyConversation,
        {},
      );
      expect(summary).toMatchObject({
        readThroughSequence: first.sequence,
        messageCount: second.sequence,
        unreadCount: 1,
        hasUnread: true,
      });
    } finally {
      now.mockRestore();
    }
  });

  test("cannot mark through a message from another operational conversation", async () => {
    const state = await setup();
    const first = await asUser(state.t, state.adminA).mutation(
      api.adminCompanyMessaging.sendAdminMessage,
      { companyId: state.companyId, body: "First company", idempotencyKey: "boundary-a" },
    );
    const second = await asUser(state.t, state.adminA).mutation(
      api.adminCompanyMessaging.sendAdminMessage,
      { companyId: state.otherCompanyId, body: "Second company", idempotencyKey: "boundary-b" },
    );
    await expect(asUser(state.t, state.adminB).mutation(
      api.adminCompanyMessaging.markAdminConversationRead,
      { conversationId: first.conversationId, readThroughMessageId: second.messageId },
    )).rejects.toThrow("OPERATIONAL_MESSAGE_NOT_FOUND");
  });
});

describe("operational pagination, DTOs and isolation", () => {
  test("loads older pages without duplicates or gaps and presents each page oldest to newest", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminA);
    for (let index = 1; index <= 55; index += 1) {
      await admin.mutation(api.adminCompanyMessaging.sendAdminMessage, {
        companyId: state.companyId,
        body: `Message ${index}`,
        idempotencyKey: `page-${index}`,
      });
    }
    const summary = await admin.query(api.adminCompanyMessaging.getAdminConversation, {
      companyId: state.companyId,
    });
    const sequences: number[] = [];
    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const page: {
        page: Array<{ sequence: number }>;
        continueCursor: string;
        isDone: boolean;
      } = await admin.query(api.adminCompanyMessaging.listAdminMessages, {
        conversationId: summary!.id,
        paginationOpts: { numItems: 10, cursor },
      });
      expect(page.page.map((message) => message.sequence)).toEqual(
        [...page.page.map((message) => message.sequence)].sort((a, b) => a - b),
      );
      sequences.push(...page.page.map((message) => message.sequence));
      cursor = page.continueCursor;
      isDone = page.isDone;
    }
    expect(sequences).toHaveLength(55);
    expect(new Set(sequences).size).toBe(55);
    expect([...sequences].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 55 }, (_, index) => index + 1),
    );
  });

  test("returns constrained DTOs and a paginated Admin inbox", async () => {
    const state = await setup();
    const sent = await asUser(state.t, state.owner).mutation(
      api.adminCompanyMessaging.sendCompanyMessage,
      { body: "Private operational body", idempotencyKey: "dto" },
    );
    const admin = asUser(state.t, state.adminA);
    const inbox = await admin.query(api.adminCompanyMessaging.listAdminConversations, firstPage(10));
    expect(inbox.page).toHaveLength(1);
    expect(Object.keys(inbox.page[0]).sort()).toEqual([
      "companyId", "companyName", "createdAt", "hasUnread", "id", "lastMessageAt",
      "lastMessagePreview", "lastSenderType", "messageCount", "readThroughSequence",
      "unreadCount", "updatedAt",
    ].sort());
    const messages = await admin.query(api.adminCompanyMessaging.listAdminMessages, {
      conversationId: sent.conversationId,
      ...firstPage(),
    });
    expect(Object.keys(messages.page[0]).sort()).toEqual([
      "body", "conversationId", "createdAt", "id", "isOwnMessage", "senderDisplayName",
      "senderType", "sequence",
    ].sort());
    const serialized = JSON.stringify({ inbox, messages });
    expect(serialized).not.toContain("@operational.test");
    expect(serialized).not.toContain("tokenIdentifier");
    expect(serialized).not.toContain("attachment");
    expect(serialized).not.toContain("clientId");
  });

  test("operational and marketplace IDs and records cannot cross systems", async () => {
    const state = await setup();
    const operational = await asUser(state.t, state.adminA).mutation(
      api.adminCompanyMessaging.sendAdminMessage,
      { companyId: state.companyId, body: "Operational only", idempotencyKey: "isolation" },
    );
    const marketplace = await state.t.run(async (ctx) => {
      const projectId = await ctx.db.insert("projects", {
        clientId: state.client,
        primaryCategory: "renovation",
        city: "rabat",
        countryCode: "MA",
        title: "Private marketplace project",
        propertyType: "apartment",
        surface: 90,
        surfaceUnknown: false,
        description: "Private marketplace details",
        timeline: "one_to_three_months",
        visibility: "marketplace",
        status: "published",
        lastCompletedStep: 6,
        createdAt: 1,
        updatedAt: 1,
      });
      const quoteId = await ctx.db.insert("projectQuotes", {
        projectId,
        companyId: state.companyId,
        submittedByUserId: state.owner,
        message: "Private proposal message",
        estimatedPrice: 10_000,
        currency: "MAD",
        estimatedDuration: 10,
        availableStartDate: "2099-01-01",
        scope: "Private proposal scope",
        quoteType: "initial",
        status: "discussion_open",
        createdAt: 1,
        updatedAt: 1,
        submittedAt: 1,
      });
      const conversationId = await ctx.db.insert("conversations", {
        projectId,
        quoteId,
        clientId: state.client,
        companyId: state.companyId,
        status: "active",
        createdBy: state.client,
        createdAt: 1,
        updatedAt: 1,
      });
      const messageId = await ctx.db.insert("messages", {
        conversationId,
        senderUserId: state.client,
        senderType: "client",
        body: "Private marketplace body",
        createdAt: 1,
      });
      return { conversationId, messageId };
    });

    await expect(asUser(state.t, state.adminA).query(
      api.adminCompanyMessaging.listAdminMessages,
      {
        conversationId: marketplace.conversationId as unknown as Id<"adminCompanyConversations">,
        ...firstPage(),
      },
    )).rejects.toThrow();
    await expect(asUser(state.t, state.owner).query(api.messages.index.getConversation, {
      conversationId: operational.conversationId as unknown as Id<"conversations">,
    })).rejects.toThrow();
    await expect(asUser(state.t, state.adminA).mutation(
      api.adminCompanyMessaging.markAdminConversationRead,
      {
        conversationId: operational.conversationId,
        readThroughMessageId: marketplace.messageId as unknown as Id<"adminCompanyMessages">,
      },
    )).rejects.toThrow();

    const operationalMessages = await state.t.run((ctx) =>
      ctx.db.query("adminCompanyMessages")
        .withIndex("by_conversationId_and_sequence", (q) =>
          q.eq("conversationId", operational.conversationId)).take(10));
    const marketplaceMessages = await state.t.run((ctx) =>
      ctx.db.query("messages")
        .withIndex("by_conversationId_and_createdAt", (q) =>
          q.eq("conversationId", marketplace.conversationId)).take(10));
    expect(operationalMessages.map((message) => message.body)).toEqual(["Operational only"]);
    expect(marketplaceMessages.map((message) => message.body)).toEqual(["Private marketplace body"]);
  });
});
