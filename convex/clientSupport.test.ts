/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { supportRequestEventKeys, supportRequestKinds } from "./clientSupport/constants";
import { projectCities, projectStatuses } from "./projects/constants";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const support = api.clientSupport.index;
type Backend = TestConvex<typeof schema>;
type Caller = ReturnType<Backend["withIdentity"]>;
const NOW = 1_800_000_000_000;
const firstPage = (numItems = 20) => ({ paginationOpts: { numItems, cursor: null } });

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); });

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function seedUser(t: Backend, accountType: "client" | "admin" | "company" | "seo_team", name: string) {
  return await t.run((ctx) => ctx.db.insert("users", {
    accountType, onboardingStatus: "completed", firstName: name, lastName: "Test",
    email: `${name}@private.test`, phone: "PRIVATE_PHONE_SENTINEL", createdAt: 1, updatedAt: 1,
  }));
}

async function seedProject(t: Backend, clientId: Id<"users">, fields: Partial<Doc<"projects">> = {}) {
  return await t.run((ctx) => ctx.db.insert("projects", {
    clientId, countryCode: "MA", title: "Rénovation", city: "rabat", surfaceUnknown: true,
    visibility: "marketplace", status: "published", lastCompletedStep: 5,
    createdAt: 1, updatedAt: 1, ...fields,
  }));
}

async function setup() {
  const t = convexTest(schema, modules);
  const client = await seedUser(t, "client", "Client");
  const otherClient = await seedUser(t, "client", "OtherClient");
  const adminA = await seedUser(t, "admin", "AdminA");
  const adminB = await seedUser(t, "admin", "AdminB");
  const company = await seedUser(t, "company", "Company");
  const staff = await seedUser(t, "company", "Staff");
  const seo = await seedUser(t, "seo_team", "SEO");
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name: "PRIVATE_COMPANY_NAME_SENTINEL", verificationStatus: "verified",
    onboardingStatus: "completed", createdAt: 1, updatedAt: 1,
  }));
  await t.run(async (ctx) => {
    await ctx.db.insert("companyMembers", { companyId, userId: company, role: "owner", status: "active", createdAt: 1 });
    await ctx.db.insert("companyMembers", { companyId, userId: staff, role: "staff", status: "active", createdAt: 1 });
  });
  const projectId = await seedProject(t, client);
  return { t, client, otherClient, adminA, adminB, company, staff, seo, companyId, projectId };
}
type State = Awaited<ReturnType<typeof setup>>;
type Thread = Awaited<ReturnType<typeof openThread>>;

async function openThread(state: State, requestKind: "free_help" | "coordination_discussion" = "free_help", projectId = state.projectId) {
  return await asUser(state.t, state.client).mutation(support.requestSupport, { projectId, requestKind });
}

async function supportSnapshot(t: Backend) {
  return await t.run(async (ctx) => ({
    conversations: await ctx.db.query("clientSupportConversations").collect(),
    messages: await ctx.db.query("clientSupportMessages").collect(),
    reads: await ctx.db.query("clientSupportConversationReads").collect(),
  }));
}

function clientCalls(caller: Caller, state: State, thread: Thread) {
  const { projectId } = state;
  const { conversationId, messageId } = thread;
  return [
    ["requestSupport", () => caller.mutation(support.requestSupport, { projectId, requestKind: "free_help" })],
    ["getMyConversation", () => caller.query(support.getMyConversation, { projectId })],
    ["listMyMessages", () => caller.query(support.listMyMessages, { conversationId, ...firstPage() })],
    ["sendClientMessage", () => caller.mutation(support.sendClientMessage, { conversationId, body: "Client retry", idempotencyKey: "client-retry" })],
    ["markMyConversationRead", () => caller.mutation(support.markMyConversationRead, { conversationId, readThroughMessageId: messageId })],
  ] as const;
}

function adminCalls(caller: Caller, state: State, thread: Thread) {
  const { conversationId, messageId } = thread;
  return [
    ["getAdminConversation", () => caller.query(support.getAdminConversation, { projectId: state.projectId })],
    ["listAdminConversations", () => caller.query(support.listAdminConversations, firstPage())],
    ["listAdminMessages", () => caller.query(support.listAdminMessages, { conversationId, ...firstPage() })],
    ["sendAdminMessage", () => caller.mutation(support.sendAdminMessage, { conversationId, body: "Admin retry", idempotencyKey: "admin-retry" })],
    ["markAdminConversationRead", () => caller.mutation(support.markAdminConversationRead, { conversationId, readThroughMessageId: messageId })],
  ] as const;
}

describe("Client support requests and messages", () => {
  test("starts before Company selection, returns safe summaries and lets Client/admins reply", async () => {
    const state = await setup();
    const client = asUser(state.t, state.client);
    const admin = asUser(state.t, state.adminA);
    expect(await client.query(support.getMyConversation, { projectId: state.projectId })).toBeNull();
    expect(await admin.query(support.getAdminConversation, { projectId: state.projectId })).toBeNull();
    expect((await admin.query(support.listAdminConversations, firstPage())).page).toEqual([]);
    const thread = await openThread(state);
    expect(thread).toMatchObject({ sequence: 1, createdAt: NOW, duplicate: false });
    expect(await client.query(support.getMyConversation, { projectId: state.projectId })).toMatchObject({
      id: thread.conversationId, project: { id: state.projectId, title: "Rénovation", city: "rabat", status: "published" },
      requestedKinds: ["free_help"], clientDisplayName: "Client Test", entryCount: 1,
      readThroughSequence: 1, unreadCount: 0, hasUnread: false,
      lastEntry: { kind: "request", eventKey: supportRequestEventKeys.free_help },
    });
    expect(await admin.query(support.getAdminConversation, { projectId: state.projectId })).toMatchObject({ entryCount: 1, readThroughSequence: 0, unreadCount: 1, hasUnread: true });
    const adminSent = await admin.mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body: "  Quels documents souhaitez-vous organiser ?  ", idempotencyKey: "admin-first" });
    const clientSent = await client.mutation(support.sendClientMessage, { conversationId: thread.conversationId, body: "Please explain the payment dates.", idempotencyKey: "client-first" });
    expect([adminSent.sequence, clientSent.sequence]).toEqual([2, 3]);
    const history = await client.query(support.listMyMessages, { conversationId: thread.conversationId, ...firstPage() });
    expect(history.page).toEqual([
      { id: thread.messageId, conversationId: thread.conversationId, kind: "request", senderType: "client", senderDisplayName: "Client Test", requestKind: "free_help", eventKey: supportRequestEventKeys.free_help, sequence: 1, createdAt: NOW, isOwnMessage: true },
      { id: adminSent.messageId, conversationId: thread.conversationId, kind: "message", senderType: "admin", senderDisplayName: "AdminA Test", body: "Quels documents souhaitez-vous organiser ?", sequence: 2, createdAt: NOW, isOwnMessage: false },
      { id: clientSent.messageId, conversationId: thread.conversationId, kind: "message", senderType: "client", senderDisplayName: "Client Test", body: "Please explain the payment dates.", sequence: 3, createdAt: NOW, isOwnMessage: true },
    ]);
    expect((await admin.query(support.listAdminMessages, { conversationId: thread.conversationId, ...firstPage() })).page.map((entry) => entry.isOwnMessage)).toEqual([false, true, false]);
    const inbox = await admin.query(support.listAdminConversations, firstPage());
    expect(inbox.page).toHaveLength(1);
    expect(inbox.page[0]).toMatchObject({ entryCount: 3, readThroughSequence: 2, unreadCount: 1 });
    await expect(admin.mutation(support.markAdminConversationRead, { conversationId: thread.conversationId, readThroughMessageId: clientSent.messageId })).resolves.toEqual({ readThroughSequence: 3, unreadCount: 0 });
  });

  test.each(supportRequestKinds)("repeating %s changes no events, metadata or read positions", async (requestKind) => {
    const state = await setup();
    const first = await openThread(state, requestKind);
    const before = await supportSnapshot(state.t);
    vi.mocked(Date.now).mockReturnValue(NOW + 100);
    expect(await openThread(state, requestKind)).toEqual({ ...first, duplicate: true });
    expect(await supportSnapshot(state.t)).toEqual(before);
  });

  test.each(supportRequestKinds)("both kinds use one conversation when %s arrives first", async (firstKind) => {
    const state = await setup();
    const first = await openThread(state, firstKind);
    const secondKind = firstKind === "free_help" ? "coordination_discussion" : "free_help";
    const second = await openThread(state, secondKind);
    expect(second).toMatchObject({ conversationId: first.conversationId, sequence: 2, duplicate: false });
    expect(await openThread(state, firstKind)).toEqual({ ...first, duplicate: true });
    expect(await openThread(state, secondKind)).toEqual({ ...second, duplicate: true });
    const snapshot = await supportSnapshot(state.t);
    expect(snapshot.conversations).toHaveLength(1);
    expect(snapshot.messages).toHaveLength(2);
  });

  test("parallel requests create one thread and exactly one immutable event per kind", async () => {
    const state = await setup();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => openThread(state, supportRequestKinds[i % 2])));
    expect(new Set(results.map((result) => result.conversationId)).size).toBe(1);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(2);
    const snapshot = await supportSnapshot(state.t);
    expect(snapshot.conversations).toHaveLength(1);
    expect(snapshot.conversations[0].entryCount).toBe(2);
    expect(snapshot.messages.map((entry) => entry.sequence).sort()).toEqual([1, 2]);
    expect(snapshot.messages.every((entry) => entry.kind === "request" && !Object.prototype.hasOwnProperty.call(entry, "body") && !Object.prototype.hasOwnProperty.call(entry, "idempotencyKey"))).toBe(true);
  });

  test("server derives identity/role and rejects fabricated events or Client IDs", async () => {
    const state = await setup();
    const thread = await openThread(state);
    const caller = asUser(state.t, state.client);
    const before = await supportSnapshot(state.t);
    await expect(caller.mutation(support.requestSupport, { projectId: state.projectId, requestKind: "free_help", clientId: state.otherClient } as FunctionArgs<typeof support.requestSupport>)).rejects.toThrow();
    await expect(caller.mutation(support.sendClientMessage, {
      conversationId: thread.conversationId, body: "Pretend event", idempotencyKey: "spoofed",
      senderUserId: state.adminA, senderType: "admin", kind: "request", requestKind: "coordination_discussion", sequence: 99,
    } as FunctionArgs<typeof support.sendClientMessage>)).rejects.toThrow();
    await expect(caller.mutation(support.requestSupport, { projectId: state.projectId, requestKind: "paid_accepted" as "free_help" })).rejects.toThrow();
    expect(await supportSnapshot(state.t)).toEqual(before);
  });

  test.each(projectStatuses)("supports saved %s projects without changing lifecycle or starting work", async (status) => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { status, visibility: "invite_only", selectedCompanyId: status === "company_selected" ? state.companyId : undefined }));
    const before = await state.t.run((ctx) => ctx.db.get(state.projectId));
    const first = await openThread(state);
    await openThread(state, "coordination_discussion");
    const sent = await asUser(state.t, state.adminA).mutation(support.sendAdminMessage, { conversationId: first.conversationId, body: "We can discuss availability.", idempotencyKey: "lifecycle-admin" });
    await asUser(state.t, state.client).mutation(support.markMyConversationRead, { conversationId: first.conversationId, readThroughMessageId: sent.messageId });
    await asUser(state.t, state.client).mutation(support.sendClientMessage, { conversationId: first.conversationId, body: "Please call me.", idempotencyKey: "lifecycle-client" });
    expect(await asUser(state.t, state.client).query(support.getMyConversation, { projectId: state.projectId })).toMatchObject({ project: { status } });
    expect((await asUser(state.t, state.adminA).query(support.listAdminMessages, { conversationId: first.conversationId, ...firstPage() })).page).toHaveLength(4);
    expect(await state.t.run((ctx) => ctx.db.get(state.projectId))).toEqual(before);
    expect(await state.t.run((ctx) => ctx.db.query("deals").collect())).toEqual([]);
    expect(await state.t.run((ctx) => ctx.db.query("projectStatusHistory").collect())).toEqual([]);
  });

  test("accepts incomplete drafts and all existing cities without a support city restriction", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { status: "draft", title: undefined, city: undefined }));
    await openThread(state);
    expect(await asUser(state.t, state.client).query(support.getMyConversation, { projectId: state.projectId })).toMatchObject({ project: { title: null, city: null, status: "draft" } });
    for (const city of projectCities) await expect(openThread(state, "coordination_discussion", await seedProject(state.t, state.client, { city }))).resolves.toMatchObject({ duplicate: false });
  });

  test("empty display-name fallbacks preserve French/English text and locale-neutral events", async () => {
    const state = await setup();
    await state.t.run(async (ctx) => {
      await ctx.db.patch(state.client, { firstName: undefined, lastName: undefined, name: undefined });
      await ctx.db.patch(state.adminA, { firstName: undefined, lastName: undefined, name: undefined });
    });
    const thread = await openThread(state);
    const body = "FR : échéances et pièces du dossier.\nEN: documents and payment dates.";
    await asUser(state.t, state.adminA).mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body, idempotencyKey: "fr-en" });
    const page = await asUser(state.t, state.client).query(support.listMyMessages, { conversationId: thread.conversationId, ...firstPage() });
    expect(page.page.map((entry) => entry.senderDisplayName)).toEqual(["", ""]);
    expect(page.page[0]).toMatchObject({ eventKey: "clientSupport.events.freeHelpRequested" });
    expect(page.page[1]).toMatchObject({ body });
    const summary = await asUser(state.t, state.client).query(support.getMyConversation, { projectId: state.projectId });
    expect(summary?.clientDisplayName).toBe("");
    expect(summary?.lastEntry).toMatchObject({ preview: "FR : échéances et pièces du dossier. EN: documents and payment dates." });
  });
});

describe("Client support authorization", () => {
  test.each(["otherClient", "company", "staff", "seo", "anonymous"] as const)("denies every endpoint to %s, including existing-request retries", async (actor) => {
    const state = await setup();
    const thread = await openThread(state);
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { selectedCompanyId: state.companyId, status: "company_selected" }));
    const caller = actor === "anonymous" ? state.t : asUser(state.t, state[actor]);
    const before = await supportSnapshot(state.t);
    for (const [endpoint, call] of [...clientCalls(caller, state, thread), ...adminCalls(caller, state, thread)]) await expect(call(), endpoint).rejects.toThrow();
    expect(await supportSnapshot(state.t)).toEqual(before);
  });

  test("Clients cannot use admin endpoints and admins cannot impersonate the Client", async () => {
    const state = await setup();
    const thread = await openThread(state);
    for (const [endpoint, call] of adminCalls(asUser(state.t, state.client), state, thread)) await expect(call(), endpoint).rejects.toThrow("ADMIN_REQUIRED");
    for (const [endpoint, call] of clientCalls(asUser(state.t, state.adminA), state, thread)) await expect(call(), endpoint).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
  });

  test.each(["demoted", "deleted"] as const)("rechecks an authenticated %s admin before send deduplication or any other operation", async (mode) => {
    const state = await setup();
    const thread = await openThread(state);
    const caller = asUser(state.t, state.adminA);
    await caller.mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body: "Admin retry", idempotencyKey: "admin-retry" });
    await state.t.run(async (ctx) => {
      if (mode === "deleted") await ctx.db.delete(state.adminA);
      else await ctx.db.patch(state.adminA, { accountType: "seo_team" });
    });
    const before = await supportSnapshot(state.t);
    for (const [endpoint, call] of adminCalls(caller, state, thread)) await expect(call(), endpoint).rejects.toThrow("ADMIN_REQUIRED");
    expect(await supportSnapshot(state.t)).toEqual(before);
    await expect(asUser(state.t, state.adminB).query(support.getAdminConversation, { projectId: state.projectId })).resolves.toMatchObject({ id: thread.conversationId });
  });

  test("ownership changes deny old/new owners and direct admin operations without transferring history", async () => {
    const state = await setup();
    const thread = await openThread(state);
    await asUser(state.t, state.client).mutation(support.sendClientMessage, { conversationId: thread.conversationId, body: "Client retry", idempotencyKey: "client-retry" });
    await asUser(state.t, state.adminA).mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body: "Admin retry", idempotencyKey: "admin-retry" });
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { clientId: state.otherClient }));
    const before = await supportSnapshot(state.t);
    for (const userId of [state.client, state.otherClient]) for (const [endpoint, call] of clientCalls(asUser(state.t, userId), state, thread)) await expect(call(), endpoint).rejects.toThrow();
    for (const [endpoint, call] of adminCalls(asUser(state.t, state.adminA), state, thread)) {
      if (endpoint === "listAdminConversations") expect((await call() as { page: unknown[] }).page).toEqual([]);
      else await expect(call(), endpoint).rejects.toThrow("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
    }
    expect(await supportSnapshot(state.t)).toEqual(before);
  });

  test.each(["conversationOwner", "missingProject", "missingClient", "pendingClient", "clientRole"] as const)("fails closed on %s relationship changes on every relevant operation", async (mode) => {
    const state = await setup();
    const thread = await openThread(state);
    await state.t.run(async (ctx) => {
      if (mode === "conversationOwner") await ctx.db.patch(thread.conversationId, { clientId: state.otherClient });
      if (mode === "missingProject") await ctx.db.delete(state.projectId);
      if (mode === "missingClient") await ctx.db.delete(state.client);
      if (mode === "pendingClient") await ctx.db.patch(state.client, { onboardingStatus: "pending" });
      if (mode === "clientRole") await ctx.db.patch(state.client, { accountType: "company" });
    });
    const before = await supportSnapshot(state.t);
    for (const [endpoint, call] of clientCalls(asUser(state.t, state.client), state, thread)) await expect(call(), endpoint).rejects.toThrow();
    for (const [endpoint, call] of adminCalls(asUser(state.t, state.adminA), state, thread)) {
      if (endpoint === "listAdminConversations") expect((await call() as { page: unknown[] }).page).toEqual([]);
      else if (mode === "missingProject" && endpoint === "getAdminConversation") expect(await call()).toBeNull();
      else await expect(call(), endpoint).rejects.toThrow("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
    }
    expect(await supportSnapshot(state.t)).toEqual(before);
  });

  test("protects summaries before a thread exists and denies operations on deleted thread IDs", async () => {
    const state = await setup();
    await expect(asUser(state.t, state.otherClient).query(support.getMyConversation, { projectId: state.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    const thread = await openThread(state);
    await state.t.run((ctx) => ctx.db.delete(thread.conversationId));
    const directEndpoints = ["listMyMessages", "sendClientMessage", "markMyConversationRead", "listAdminMessages", "sendAdminMessage", "markAdminConversationRead"];
    const calls = [...clientCalls(asUser(state.t, state.client), state, thread), ...adminCalls(asUser(state.t, state.adminA), state, thread)];
    for (const [endpoint, call] of calls) if (directEndpoints.includes(endpoint)) await expect(call(), endpoint).rejects.toThrow("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
  });
});

describe("Client support idempotency and input bounds", () => {
  test.each(["client", "admin"] as const)("%s retries return the original only for the same normalized text and conversation", async (role) => {
    const state = await setup();
    const thread = await openThread(state);
    const caller = asUser(state.t, role === "client" ? state.client : state.adminA);
    const endpoint = role === "client" ? support.sendClientMessage : support.sendAdminMessage;
    const args = { conversationId: thread.conversationId, body: "  Question\nabout dates.  ", idempotencyKey: " send-key " };
    const first = await caller.mutation(endpoint, args);
    const before = await supportSnapshot(state.t);
    expect(await caller.mutation(endpoint, { ...args, body: "Question\nabout dates.", idempotencyKey: "send-key" })).toEqual({ ...first, duplicate: true });
    await expect(caller.mutation(endpoint, { ...args, body: "Different question" })).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
    expect(await supportSnapshot(state.t)).toEqual(before);
    const second = await openThread(state, "free_help", await seedProject(state.t, state.client));
    const beforeConflict = await supportSnapshot(state.t);
    await expect(caller.mutation(endpoint, { ...args, conversationId: second.conversationId })).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
    expect(await supportSnapshot(state.t)).toEqual(beforeConflict);
  });

  test("idempotency is scoped to each sender and parallel send retries append once", async () => {
    const state = await setup();
    const thread = await openThread(state);
    const args = { conversationId: thread.conversationId, body: "Hello", idempotencyKey: "shared-key" };
    const results = await Promise.all(Array.from({ length: 10 }, () => asUser(state.t, state.client).mutation(support.sendClientMessage, args)));
    expect(new Set(results.map((result) => result.messageId)).size).toBe(1);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    const adminA = await asUser(state.t, state.adminA).mutation(support.sendAdminMessage, args);
    const adminB = await asUser(state.t, state.adminB).mutation(support.sendAdminMessage, args);
    expect([results[0].sequence, adminA.sequence, adminB.sequence]).toEqual([2, 3, 4]);
  });

  test.each(["client", "admin"] as const)("%s validates body/key bounds and sanitizes the summary preview", async (role) => {
    const state = await setup();
    const thread = await openThread(state);
    const caller = asUser(state.t, role === "client" ? state.client : state.adminA);
    const endpoint = role === "client" ? support.sendClientMessage : support.sendAdminMessage;
    for (const body of ["", " \n\t ", "a".repeat(5_001)]) await expect(caller.mutation(endpoint, { conversationId: thread.conversationId, body, idempotencyKey: "valid" })).rejects.toThrow("INVALID_CLIENT_SUPPORT_MESSAGE_BODY");
    for (const idempotencyKey of ["", " ", "a".repeat(101), "has space", "slash/key", "accenté", "line\nbreak"]) await expect(caller.mutation(endpoint, { conversationId: thread.conversationId, body: "Valid", idempotencyKey })).rejects.toThrow("INVALID_IDEMPOTENCY_KEY");
    await caller.mutation(endpoint, { conversationId: thread.conversationId, body: "a".repeat(5_000), idempotencyKey: "a".repeat(100) });
    await caller.mutation(endpoint, { conversationId: thread.conversationId, body: `<b>Ready</b>\u0000\n${"b".repeat(200)}`, idempotencyKey: "preview:._-1" });
    const summary = await asUser(state.t, state.adminA).query(support.getAdminConversation, { projectId: state.projectId });
    expect(summary?.lastEntry).toMatchObject({ preview: `Ready ${"b".repeat(114)}` });
    expect((await supportSnapshot(state.t)).messages).toHaveLength(3);
  });
});

describe("Client support pagination and read positions", () => {
  test("history preserves native cursor options and ascending sequences within each newest-first page", async () => {
    const state = await setup();
    const thread = await openThread(state);
    const admin = asUser(state.t, state.adminA);
    for (let i = 0; i < 55; i++) await admin.mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body: `Message ${i}`, idempotencyKey: `page-${i}` });
    const before = await supportSnapshot(state.t);
    const sequences: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const page: FunctionReturnType<typeof support.listMyMessages> = await asUser(state.t, state.client).query(support.listMyMessages, {
        conversationId: thread.conversationId, paginationOpts: { numItems: 20, cursor, id: 42, maximumRowsRead: 20, maximumBytesRead: 100_000 },
      });
      const pageSequences = page.page.map((entry) => entry.sequence);
      expect(pageSequences).toEqual([...pageSequences].sort((a, b) => a - b));
      sequences.push(...pageSequences);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(sequences).toHaveLength(56);
    expect(new Set(sequences).size).toBe(56);
    expect([...sequences].sort((a, b) => a - b)).toEqual(Array.from({ length: 56 }, (_, i) => i + 1));
    const first = await admin.query(support.listAdminMessages, { conversationId: thread.conversationId, ...firstPage(20) });
    expect(first.page.map((entry) => entry.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => i + 37));
    const bounded = await admin.query(support.listAdminMessages, {
      conversationId: thread.conversationId, paginationOpts: { numItems: 5, cursor: null, endCursor: first.continueCursor },
    });
    expect(bounded.page.map((entry) => entry.id)).toEqual(first.page.map((entry) => entry.id));
    expect(bounded.continueCursor).toBe(first.continueCursor);
    expect(await supportSnapshot(state.t)).toEqual(before);
  });

  test("admin inbox paginates by latest activity and continues past inaccessible relationships", async () => {
    const state = await setup();
    const threads: Thread[] = [];
    for (let i = 0; i < 34; i++) {
      vi.mocked(Date.now).mockReturnValue(NOW + i);
      threads.push(await openThread(state, "free_help", await seedProject(state.t, state.client)));
    }
    const admin = asUser(state.t, state.adminA);
    const first = await admin.query(support.listAdminConversations, firstPage(30));
    expect(first.page.map((row) => row.id)).toEqual(threads.slice(4).reverse().map((thread) => thread.conversationId));
    expect(first.isDone).toBe(false);
    const second = await admin.query(support.listAdminConversations, { paginationOpts: { numItems: 30, cursor: first.continueCursor } });
    expect(second.page.map((row) => row.id)).toEqual(threads.slice(0, 4).reverse().map((thread) => thread.conversationId));
    expect(second.isDone).toBe(true);
    vi.mocked(Date.now).mockReturnValue(NOW + 100);
    await admin.mutation(support.sendAdminMessage, { conversationId: threads[0].conversationId, body: "Newest activity", idempotencyKey: "inbox-bump" });
    expect((await admin.query(support.listAdminConversations, firstPage(1))).page[0].id).toBe(threads[0].conversationId);
    await state.t.run((ctx) => ctx.db.patch(threads[0].conversationId, { clientId: state.otherClient }));
    const hiddenFirst = await admin.query(support.listAdminConversations, firstPage(1));
    expect(hiddenFirst.page).toEqual([]);
    expect(hiddenFirst.isDone).toBe(false);
    expect((await admin.query(support.listAdminConversations, { paginationOpts: { numItems: 1, cursor: hiddenFirst.continueCursor } })).page[0].id).toBe(threads[33].conversationId);
  });

  test.each([0, -1, 0.5, 51])("rejects message page size %s on both history endpoints", async (numItems) => {
    const state = await setup();
    const thread = await openThread(state);
    await expect(asUser(state.t, state.client).query(support.listMyMessages, { conversationId: thread.conversationId, ...firstPage(numItems) })).rejects.toThrow("INVALID_CLIENT_SUPPORT_PAGE_SIZE");
    await expect(asUser(state.t, state.adminA).query(support.listAdminMessages, { conversationId: thread.conversationId, ...firstPage(numItems) })).rejects.toThrow("INVALID_CLIENT_SUPPORT_PAGE_SIZE");
  });

  test.each([0, -1, 0.5, 31])("rejects admin inbox page size %s", async (numItems) => {
    const state = await setup();
    await expect(asUser(state.t, state.adminA).query(support.listAdminConversations, firstPage(numItems))).rejects.toThrow("INVALID_CLIENT_SUPPORT_PAGE_SIZE");
  });

  test("reads are independent, monotonic and sequence-based at identical timestamps; queries never mark read", async () => {
    const state = await setup();
    const thread = await openThread(state);
    const client = asUser(state.t, state.client);
    const adminA = asUser(state.t, state.adminA);
    const adminB = asUser(state.t, state.adminB);
    const sent = await adminA.mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body: "Reply", idempotencyKey: "read-reply" });
    const beforeQueries = await supportSnapshot(state.t);
    expect(await client.query(support.getMyConversation, { projectId: state.projectId })).toMatchObject({ readThroughSequence: 1, unreadCount: 1 });
    expect(await adminA.query(support.getAdminConversation, { projectId: state.projectId })).toMatchObject({ readThroughSequence: 2, unreadCount: 0 });
    expect(await adminB.query(support.getAdminConversation, { projectId: state.projectId })).toMatchObject({ readThroughSequence: 0, unreadCount: 2 });
    await adminB.query(support.listAdminConversations, firstPage());
    await adminB.query(support.listAdminMessages, { conversationId: thread.conversationId, ...firstPage() });
    await client.query(support.listMyMessages, { conversationId: thread.conversationId, ...firstPage() });
    expect(await supportSnapshot(state.t)).toEqual(beforeQueries);
    await expect(adminB.mutation(support.markAdminConversationRead, { conversationId: thread.conversationId, readThroughMessageId: thread.messageId })).resolves.toEqual({ readThroughSequence: 1, unreadCount: 1 });
    await expect(client.mutation(support.markMyConversationRead, { conversationId: thread.conversationId, readThroughMessageId: sent.messageId })).resolves.toEqual({ readThroughSequence: 2, unreadCount: 0 });
    const beforeOlderRead = await supportSnapshot(state.t);
    await expect(client.mutation(support.markMyConversationRead, { conversationId: thread.conversationId, readThroughMessageId: thread.messageId })).resolves.toEqual({ readThroughSequence: 2, unreadCount: 0 });
    expect(await supportSnapshot(state.t)).toEqual(beforeOlderRead);
    const next = await adminA.mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body: "Another reply", idempotencyKey: "same-time" });
    expect(next.createdAt).toBe(sent.createdAt);
    expect(await client.query(support.getMyConversation, { projectId: state.projectId })).toMatchObject({ readThroughSequence: 2, unreadCount: 1 });
    expect(await adminB.query(support.getAdminConversation, { projectId: state.projectId })).toMatchObject({ readThroughSequence: 1, unreadCount: 2 });
  });

  test("read requests require an existing entry in the same thread and reject future/invalid sequences", async () => {
    const state = await setup();
    const thread = await openThread(state);
    const other = await openThread(state, "free_help", await seedProject(state.t, state.client));
    const deleted = await state.t.run((ctx) => ctx.db.insert("clientSupportMessages", {
      conversationId: thread.conversationId, kind: "message", senderType: "client", senderUserId: state.client,
      body: "deleted", idempotencyKey: "deleted", sequence: 2, createdAt: NOW,
    }));
    await state.t.run((ctx) => ctx.db.delete(deleted));
    const invalidIds = [other.messageId, deleted];
    for (const sequence of [-1, 0, 0.5, 999]) invalidIds.push(await state.t.run((ctx) => ctx.db.insert("clientSupportMessages", {
      conversationId: thread.conversationId, kind: "message", senderType: "client", senderUserId: state.client,
      body: "invalid", idempotencyKey: `invalid-${sequence}`, sequence, createdAt: NOW,
    })));
    const before = await supportSnapshot(state.t);
    for (const readThroughMessageId of invalidIds) {
      await expect(asUser(state.t, state.client).mutation(support.markMyConversationRead, { conversationId: thread.conversationId, readThroughMessageId })).rejects.toThrow("CLIENT_SUPPORT_MESSAGE_NOT_FOUND");
      await expect(asUser(state.t, state.adminA).mutation(support.markAdminConversationRead, { conversationId: thread.conversationId, readThroughMessageId })).rejects.toThrow("CLIENT_SUPPORT_MESSAGE_NOT_FOUND");
    }
    expect(await supportSnapshot(state.t)).toEqual(before);
  });

  test("concurrent acknowledgements cannot move a read watermark backward", async () => {
    const state = await setup();
    const thread = await openThread(state);
    const sent = await asUser(state.t, state.client).mutation(support.sendClientMessage, { conversationId: thread.conversationId, body: "Question", idempotencyKey: "read-concurrent" });
    const admin = asUser(state.t, state.adminA);
    await Promise.all([sent.messageId, thread.messageId, sent.messageId, thread.messageId].map((readThroughMessageId) => admin.mutation(support.markAdminConversationRead, { conversationId: thread.conversationId, readThroughMessageId })));
    expect(await admin.query(support.getAdminConversation, { projectId: state.projectId })).toMatchObject({ readThroughSequence: 2, unreadCount: 0 });
  });
});

describe("Client support private-data isolation", () => {
  test("allowlisted DTOs exclude marketplace/OC2 messages, proposals, final quotes and attachment URLs; writes stay in support", async () => {
    const state = await setup();
    const privateData = await state.t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["%PDF-1.7 PRIVATE_PDF_SENTINEL"]));
      const attachmentUrl = (await ctx.storage.getUrl(storageId))!;
      await ctx.db.patch(state.projectId, { description: "PRIVATE_PROJECT_DESCRIPTION_SENTINEL", neighborhood: "PRIVATE_ADDRESS_SENTINEL" });
      const quoteId = await ctx.db.insert("projectQuotes", {
        projectId: state.projectId, companyId: state.companyId, submittedByUserId: state.company,
        message: "PRIVATE_PROPOSAL_SENTINEL", scope: "PRIVATE_PROPOSAL_SCOPE_SENTINEL",
        estimatedPrice: 987_654, estimatedDuration: 60, availableStartDate: "2099-01-01",
        currency: "MAD", quoteType: "initial", status: "submitted", createdAt: 1, updatedAt: 1, submittedAt: 1,
      });
      const marketplaceConversationId = await ctx.db.insert("conversations", {
        projectId: state.projectId, quoteId, clientId: state.client, companyId: state.companyId,
        status: "active", createdBy: state.client, createdAt: 1, updatedAt: 1,
        lastMessagePreview: "PRIVATE_MARKETPLACE_PREVIEW_SENTINEL",
      });
      const marketplaceMessageId = await ctx.db.insert("messages", {
        conversationId: marketplaceConversationId, senderUserId: state.company, senderType: "company",
        body: `PRIVATE_MARKETPLACE_MESSAGE_SENTINEL ${attachmentUrl}`, createdAt: 1,
      });
      await ctx.db.insert("messageAttachments", {
        conversationId: marketplaceConversationId, messageId: marketplaceMessageId, storageId,
        uploadedByUserId: state.company, kind: "pdf", originalFileName: "PRIVATE_CHAT_PDF_SENTINEL.pdf",
        mimeType: "application/pdf", sizeBytes: 32, createdAt: 1,
      });
      await ctx.db.insert("projectAttachments", { projectId: state.projectId, clientId: state.client, storageId, fileName: "PRIVATE_PROJECT_PDF_SENTINEL.pdf", contentType: "application/pdf", size: 32, createdAt: 1 });
      const finalQuoteId = await ctx.db.insert("finalQuotes", {
        projectId: state.projectId, clientId: state.client, companyId: state.companyId,
        initialQuoteId: quoteId, conversationId: marketplaceConversationId,
        status: "submitted", requestedAt: 1, requestedByUserId: state.client,
        requestTrigger: "client_request", createdAt: 1, updatedAt: 1,
      });
      const revisionId = await ctx.db.insert("finalQuoteRevisions", {
        finalQuoteId, revisionNumber: 1, price: 765_432, currency: "MAD", duration: 60,
        plannedStartDate: "2099-01-01", validUntil: "2099-02-01", scope: "PRIVATE_FINAL_QUOTE_SENTINEL",
        inclusions: "PRIVATE_INCLUSIONS_SENTINEL", exclusions: "PRIVATE_EXCLUSIONS_SENTINEL",
        paymentTerms: "PRIVATE_PAYMENT_TERMS_SENTINEL", pdfStorageId: storageId,
        pdfFileName: "PRIVATE_FINAL_QUOTE_PDF_SENTINEL.pdf", pdfUploadFileName: attachmentUrl,
        pdfSize: 32, submittedByUserId: state.company, submittedAt: 1, createdAt: 1,
      });
      await ctx.db.patch(finalQuoteId, { currentRevisionId: revisionId });
      const operationalConversationId = await ctx.db.insert("adminCompanyConversations", {
        companyId: state.companyId, messageCount: 1, createdAt: 1, updatedAt: 1,
        lastMessagePreview: "PRIVATE_OC2_PREVIEW_SENTINEL",
      });
      const operationalMessageId = await ctx.db.insert("adminCompanyMessages", {
        conversationId: operationalConversationId, companyId: state.companyId,
        senderUserId: state.adminA, senderType: "admin", body: `PRIVATE_OC2_MESSAGE_SENTINEL ${attachmentUrl}`,
        idempotencyKey: "client-retry", sequence: 1, createdAt: 1,
      });
      await ctx.db.insert("companyAdminNotes", { companyId: state.companyId, authorAdminUserId: state.adminA, body: "PRIVATE_ADMIN_NOTE_SENTINEL", createdAt: 1 });
      await ctx.db.insert("invitations", { projectId: state.projectId, clientUserId: state.client, companyId: state.companyId, message: "PRIVATE_INVITATION_SENTINEL", status: "pending", createdAt: 1, updatedAt: 1 });
      return { storageId, attachmentUrl, quoteId, finalQuoteId, revisionId, marketplaceConversationId, marketplaceMessageId, operationalConversationId, operationalMessageId };
    });
    const snapshot = () => state.t.run(async (ctx) => ({
      projects: await ctx.db.query("projects").collect(),
      users: await ctx.db.query("users").collect(),
      companies: await ctx.db.query("companies").collect(),
      companyMembers: await ctx.db.query("companyMembers").collect(),
      conversations: await ctx.db.query("conversations").collect(),
      messages: await ctx.db.query("messages").collect(),
      proposals: await ctx.db.query("projectQuotes").collect(),
      finalQuotes: await ctx.db.query("finalQuotes").collect(),
      finalQuoteRevisions: await ctx.db.query("finalQuoteRevisions").collect(),
      projectAttachments: await ctx.db.query("projectAttachments").collect(),
      messageAttachments: await ctx.db.query("messageAttachments").collect(),
      operationalConversations: await ctx.db.query("adminCompanyConversations").collect(),
      operationalMessages: await ctx.db.query("adminCompanyMessages").collect(),
      operationalReads: await ctx.db.query("adminCompanyConversationReads").collect(),
      companyAdminNotes: await ctx.db.query("companyAdminNotes").collect(),
      invitations: await ctx.db.query("invitations").collect(),
      deals: await ctx.db.query("deals").collect(),
      dealHistory: await ctx.db.query("dealStatusHistory").collect(),
      commissionHistory: await ctx.db.query("commissionStatusHistory").collect(),
      activity: await ctx.db.query("marketplaceActivity").collect(),
      projectHistory: await ctx.db.query("projectStatusHistory").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    const before = await snapshot();
    const thread = await openThread(state);
    await openThread(state, "coordination_discussion");
    const client = asUser(state.t, state.client);
    const admin = asUser(state.t, state.adminA);
    await client.mutation(support.sendClientMessage, { conversationId: thread.conversationId, body: "Safe client support", idempotencyKey: "client-retry" });
    const sent = await admin.mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body: "Safe Batiplus support", idempotencyKey: "client-retry" });
    await client.mutation(support.markMyConversationRead, { conversationId: thread.conversationId, readThroughMessageId: sent.messageId });
    await admin.mutation(support.markAdminConversationRead, { conversationId: thread.conversationId, readThroughMessageId: sent.messageId });
    const summaries = [
      await client.query(support.getMyConversation, { projectId: state.projectId }),
      await admin.query(support.getAdminConversation, { projectId: state.projectId }),
      ...(await admin.query(support.listAdminConversations, firstPage())).page,
    ];
    const pages = [
      await client.query(support.listMyMessages, { conversationId: thread.conversationId, ...firstPage() }),
      await admin.query(support.listAdminMessages, { conversationId: thread.conversationId, ...firstPage() }),
    ];
    const notificationPages = await Promise.all([client, admin].map((caller) =>
      caller.query(api.notifications.index.listMyNotifications, firstPage())));
    const serialized = JSON.stringify({ summaries, pages, notificationPages });
    expect(serialized).not.toContain("PRIVATE_");
    expect(serialized).not.toContain("@private.test");
    for (const value of Object.values(privateData)) expect(serialized).not.toContain(value);
    for (const notificationPage of notificationPages) for (const notification of notificationPage.page) {
      expect(notification.payload).toEqual({});
      expect(notification.actorUserId).toBeNull();
      expect(notification.entity.type).toBe("client_support_entry");
    }
    for (const summary of summaries) {
      expect(Object.keys(summary!.project).sort()).toEqual(["city", "id", "status", "title"]);
      expect(Object.keys(summary!).sort()).toEqual(["clientDisplayName", "createdAt", "entryCount", "hasUnread", "id", "lastEntry", "project", "readThroughSequence", "requestedKinds", "unreadCount", "updatedAt"]);
    }
    for (const page of pages) for (const entry of page.page) {
      expect(Object.keys(entry).sort()).toEqual(entry.kind === "request"
        ? ["conversationId", "createdAt", "eventKey", "id", "isOwnMessage", "kind", "requestKind", "senderDisplayName", "senderType", "sequence"]
        : ["body", "conversationId", "createdAt", "id", "isOwnMessage", "kind", "senderDisplayName", "senderType", "sequence"]);
    }
    for (const foreignConversationId of [privateData.marketplaceConversationId, privateData.operationalConversationId]) {
      const conversationId = foreignConversationId as unknown as Id<"clientSupportConversations">;
      await expect(client.query(support.listMyMessages, { conversationId, ...firstPage() })).rejects.toThrow();
      await expect(admin.query(support.listAdminMessages, { conversationId, ...firstPage() })).rejects.toThrow();
      await expect(client.mutation(support.sendClientMessage, { conversationId, body: "Cross-table", idempotencyKey: "cross-table" })).rejects.toThrow();
    }
    for (const foreignMessageId of [privateData.marketplaceMessageId, privateData.operationalMessageId]) {
      const readThroughMessageId = foreignMessageId as unknown as Id<"clientSupportMessages">;
      await expect(client.mutation(support.markMyConversationRead, { conversationId: thread.conversationId, readThroughMessageId })).rejects.toThrow();
      await expect(admin.mutation(support.markAdminConversationRead, { conversationId: thread.conversationId, readThroughMessageId })).rejects.toThrow();
    }
    expect(await snapshot()).toEqual(before);
  });
});
