/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { notifyClientSupportEntry } from "./clientSupport/notifications";
import { createNotification } from "./notifications/model";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notifications/deliveryPolicy";
import { marketplacePushPresentation } from "./notifications/pushPresentation";
import { projectStatuses } from "./projects/constants";
import schema from "./schema";

const webPush = vi.hoisted(() => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn() }));
vi.mock("web-push", () => webPush);
const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
const support = api.clientSupport.index;
const notifications = api.notifications.index;
const NOW = 1_800_000_000_000;
const page = (numItems = 20, cursor: string | null = null) => ({ paginationOpts: { numItems, cursor } });
const asUser = (t: Backend, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

async function seedUser(t: Backend, role: Doc<"users">["accountType"], onboardingStatus: Doc<"users">["onboardingStatus"] = "completed") {
  return await t.run((ctx) => ctx.db.insert("users", {
    accountType: role, onboardingStatus, name: "PRIVATE_NAME_SENTINEL", email: "PRIVATE_EMAIL_SENTINEL@example.test",
    phone: "PRIVATE_PHONE_SENTINEL", createdAt: 1, updatedAt: 1,
  }));
}

async function setup() {
  const t = convexTest(schema, modules);
  const client = await seedUser(t, "client");
  const otherClient = await seedUser(t, "client");
  const adminA = await seedUser(t, "admin");
  // requireAdminUser allows admins regardless of onboarding, as does OC2 fan-out.
  const adminB = await seedUser(t, "admin", "pending");
  const company = await seedUser(t, "company");
  const seo = await seedUser(t, "seo_team");
  const projectId = await t.run((ctx) => ctx.db.insert("projects", {
    clientId: client, title: "PRIVATE_PROJECT_TITLE_SENTINEL", description: "PRIVATE_DESCRIPTION_SENTINEL",
    countryCode: "MA", surfaceUnknown: true, visibility: "marketplace", status: "draft",
    lastCompletedStep: 1, createdAt: 1, updatedAt: 1,
  }));
  return { t, client, otherClient, adminA, adminB, company, seo, projectId };
}
type State = Awaited<ReturnType<typeof setup>>;
const request = (s: State, requestKind: "free_help" | "coordination_discussion" = "free_help") =>
  asUser(s.t, s.client).mutation(support.requestSupport, { projectId: s.projectId, requestKind });
const storedAlerts = (t: Backend) => t.run((ctx) => ctx.db.query("notifications").collect());
const unread = (s: State, user: Id<"users">) => asUser(s.t, user).query(notifications.getMyUnreadCount, {});
const feed = (s: State, user: Id<"users">) => asUser(s.t, user).query(notifications.listMyNotifications, page());
const reads = (s: State) => s.t.run((ctx) => ctx.db.query("clientSupportConversationReads").collect());
const reply = (s: State, conversationId: Id<"clientSupportConversations">, key = "admin-reply") =>
  asUser(s.t, s.adminA).mutation(support.sendAdminMessage, {
    conversationId, body: "PRIVATE_REPLY_SENTINEL https://private.example/quote.pdf", idempotencyKey: key,
  });

describe("support notification creation", () => {
  test.each(["free_help", "coordination_discussion"] as const)("notifies every currently authorized admin for the first %s request only", async (kind) => {
    const s = await setup();
    const first = await request(s, kind);
    const duplicate = await request(s, kind);
    expect(duplicate).toEqual({ ...first, duplicate: true });
    const alerts = await storedAlerts(s.t);
    expect(alerts).toHaveLength(2);
    expect(new Set(alerts.map((n) => n.recipientUserId))).toEqual(new Set([s.adminA, s.adminB]));
    for (const n of alerts) {
      expect(n.type).toBe(kind === "free_help" ? "client_support_free_help_requested" : "client_support_coordination_requested");
      expect(n.entity).toEqual({ type: "client_support_entry", id: first.messageId });
      expect(n.payload).toEqual({});
      expect(n.actorUserId).toBe(s.client);
      expect(n.dedupeKey).toBe(`client-support:${first.messageId}:received`);
    }
    for (const admin of [s.adminA, s.adminB]) expect(await unread(s, admin)).toBe(1);
    for (const user of [s.client, s.otherClient, s.company, s.seo]) {
      expect((await feed(s, user)).page).toEqual([]);
      expect(await unread(s, user)).toBe(0);
    }
  });

  test("concurrent requests keep one thread, one event per kind and one alert per recipient/entry", async () => {
    const s = await setup();
    const results = await Promise.all([request(s), request(s), request(s, "coordination_discussion"), request(s, "coordination_discussion")]);
    expect(new Set(results.map((r) => r.conversationId)).size).toBe(1);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(2);
    const alerts = await storedAlerts(s.t);
    expect(alerts).toHaveLength(4);
    expect(new Set(alerts.map((n) => `${n.recipientUserId}:${n.entity.id}`)).size).toBe(4);
    expect(await unread(s, s.adminA)).toBe(2);
  });

  test("discovers admins at each new entry, without backfilling retries or notifying revoked roles", async () => {
    const s = await setup();
    const thread = await request(s);
    const newAdmin = await seedUser(s.t, "admin");
    await s.t.run((ctx) => ctx.db.patch(s.adminB, { accountType: "seo_team" }));
    await request(s);
    expect((await feed(s, newAdmin)).page).toEqual([]);
    await asUser(s.t, s.client).mutation(support.sendClientMessage, { conversationId: thread.conversationId, body: "Question", idempotencyKey: "question" });
    expect((await storedAlerts(s.t)).filter((n) => n.type === "client_support_client_message_received").map((n) => n.recipientUserId).sort()).toEqual([s.adminA, newAdmin].sort());
    expect(await unread(s, s.adminB)).toBe(0);
  });

  test("opening, listing or retrying a historical support entry never backfills alerts", async () => {
    const s = await setup();
    // Seed the exact pre-OC3.4 entry shape with no notification records/states.
    await s.t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("clientSupportConversations", { projectId: s.projectId, clientId: s.client, entryCount: 1, createdAt: 1, updatedAt: 1 });
      const entryId = await ctx.db.insert("clientSupportMessages", { conversationId, senderUserId: s.client, senderType: "client", kind: "request", requestKind: "free_help", sequence: 1, createdAt: 1 });
      await ctx.db.patch(conversationId, { freeHelpRequestId: entryId, lastEntryId: entryId });
    });
    expect((await request(s)).duplicate).toBe(true);
    await asUser(s.t, s.client).query(support.getMyConversation, { projectId: s.projectId });
    await asUser(s.t, s.adminA).query(support.listAdminConversations, page());
    await feed(s, s.adminA);
    expect(await storedAlerts(s.t)).toEqual([]);
    await request(s, "coordination_discussion");
    expect((await storedAlerts(s.t)).map((n) => n.type)).toEqual(["client_support_coordination_requested", "client_support_coordination_requested"]);
  });

  test("Client messages notify admins; admin replies notify only the current owning Client", async () => {
    const s = await setup();
    const thread = await request(s);
    await asUser(s.t, s.client).mutation(support.sendClientMessage, {
      conversationId: thread.conversationId, body: "PRIVATE_MESSAGE_SENTINEL +212600000000", idempotencyKey: "client-question",
    });
    const sent = await reply(s, thread.conversationId);
    const alerts = await storedAlerts(s.t);
    expect(alerts).toHaveLength(5);
    const replies = alerts.filter((n) => n.type === "client_support_admin_reply_received");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ recipientUserId: s.client, actorUserId: s.adminA, entity: { id: sent.messageId } });
    expect(alerts.every((n) => n.recipientUserId !== n.actorUserId)).toBe(true);
    expect(await unread(s, s.adminA)).toBe(2);
    expect(await unread(s, s.adminB)).toBe(2);
    expect(await unread(s, s.client)).toBe(1);
  });

  test.each(["client", "admin"] as const)("%s sends deduplicate concurrent normalized retries, reject conflicts and accept new keys", async (sender) => {
    const s = await setup();
    const thread = await request(s);
    const actor = asUser(s.t, sender === "client" ? s.client : s.adminA);
    const endpoint = sender === "client" ? support.sendClientMessage : support.sendAdminMessage;
    const args = { conversationId: thread.conversationId, body: "  Same text  ", idempotencyKey: "  repeat-key  " };
    const results = await Promise.all([actor.mutation(endpoint, args), actor.mutation(endpoint, { ...args, body: "Same text", idempotencyKey: "repeat-key" })]);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(new Set(results.map((r) => r.messageId)).size).toBe(1);
    const count = (await storedAlerts(s.t)).length;
    await expect(actor.mutation(endpoint, { ...args, body: "Different" })).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
    await expect(actor.mutation(endpoint, { ...args, body: " " })).rejects.toThrow("INVALID_CLIENT_SUPPORT_MESSAGE_BODY");
    expect(await storedAlerts(s.t)).toHaveLength(count);
    await actor.mutation(endpoint, { ...args, idempotencyKey: "new-key" });
    expect(await storedAlerts(s.t)).toHaveLength(count + (sender === "client" ? 2 : 1));
  });

  test("recipient deduplication is scoped to the source entry and runs after access validation", async () => {
    const s = await setup();
    const thread = await request(s);
    await s.t.run((ctx) => notifyClientSupportEntry(ctx, thread.messageId));
    expect(await storedAlerts(s.t)).toHaveLength(2);
    const alert = (await storedAlerts(s.t)).find((n) => n.recipientUserId === s.adminA)!;
    await s.t.run((ctx) => ctx.db.patch(s.adminA, { accountType: "company" }));
    await expect(s.t.run((ctx) => createNotification(ctx, {
      recipientUserId: s.adminA, type: alert.type, entity: alert.entity, payload: {},
      actorUserId: s.client, dedupeKey: alert.dedupeKey,
    }))).rejects.toThrow("INVALID_NOTIFICATION_ENTITY");
    expect(await storedAlerts(s.t)).toHaveLength(2);
  });

  test("indexed admin fan-out does not silently truncate recipients", async () => {
    const s = await setup();
    const moreAdmins = await s.t.run(async (ctx) => {
      const ids: Id<"users">[] = [];
      for (let i = 0; i < 105; i += 1) ids.push(await ctx.db.insert("users", { accountType: "admin", createdAt: 1, updatedAt: 1 }));
      return ids;
    });
    await request(s);
    expect(new Set((await storedAlerts(s.t)).map((n) => n.recipientUserId))).toEqual(new Set([s.adminA, s.adminB, ...moreAdmins]));
  });

  test("a fan-out failure rolls back the entire support request and all recipient writes", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 2; i += 1) await ctx.db.insert("notificationRecipientStates", { recipientUserId: s.adminB, unreadCount: 0, updatedAt: 1 });
    });
    await expect(request(s)).rejects.toThrow();
    expect(await storedAlerts(s.t)).toEqual([]);
    for (const table of ["clientSupportConversations", "clientSupportMessages", "clientSupportConversationReads"] as const) {
      expect(await s.t.run((ctx) => ctx.db.query(table).collect())).toEqual([]);
    }
    expect(await s.t.run((ctx) => ctx.db.query("notificationRecipientStates").withIndex("by_recipientUserId", (q) => q.eq("recipientUserId", s.adminA)).collect())).toEqual([]);
  });
});

describe("support notification authorization and stale alerts", () => {
  test("denies cross-recipient reads and never exposes support to another Client, Company, SEO or anonymous caller", async () => {
    const s = await setup();
    const thread = await request(s);
    await reply(s, thread.conversationId);
    const alerts = await storedAlerts(s.t);
    for (const user of [s.otherClient, s.company, s.seo]) {
      const actor = asUser(s.t, user);
      expect((await feed(s, user)).page).toEqual([]);
      expect(await unread(s, user)).toBe(0);
      for (const alert of alerts) await expect(actor.mutation(notifications.markNotificationRead, { notificationId: alert._id })).rejects.toThrow("NOTIFICATION_NOT_FOUND");
      await expect(actor.mutation(support.sendAdminMessage, { conversationId: thread.conversationId, body: "Forbidden", idempotencyKey: "denied" })).rejects.toThrow("ADMIN_REQUIRED");
      await expect(actor.mutation(support.requestSupport, { projectId: s.projectId, requestKind: "free_help" })).rejects.toThrow();
    }
    await expect(s.t.query(notifications.listMyNotifications, page())).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(s.t.query(notifications.getMyUnreadCount, {})).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(s.t.mutation(notifications.markNotificationRead, { notificationId: alerts[0]._id })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(s.t.mutation(notifications.markAllNotificationsRead, {})).rejects.toThrow("NOT_AUTHENTICATED");
    expect(await storedAlerts(s.t)).toHaveLength(3);
  });

  test.each(["client", "company", "seo_team"] as const)("revoking admin to %s hides even read alerts and removes unread counts", async (role) => {
    const s = await setup();
    await request(s);
    await request(s, "coordination_discussion");
    const actor = asUser(s.t, s.adminA);
    const alert = (await storedAlerts(s.t)).find((n) => n.recipientUserId === s.adminA)!;
    await actor.mutation(notifications.markNotificationRead, { notificationId: alert._id });
    await s.t.run((ctx) => ctx.db.patch(s.adminA, { accountType: role }));
    expect((await feed(s, s.adminA)).page).toEqual([]);
    expect(await unread(s, s.adminA)).toBe(0);
    await expect(actor.mutation(notifications.markNotificationRead, { notificationId: alert._id })).rejects.toThrow("NOTIFICATION_NOT_FOUND");
    expect((await actor.mutation(notifications.markAllNotificationsRead, {})).markedCount).toBe(0);
    expect(await unread(s, s.adminB)).toBe(2);
  });

  test("ownership changes fail closed for all alerts, old/new Client access and retry sends", async () => {
    const s = await setup();
    const thread = await request(s);
    await reply(s, thread.conversationId);
    await s.t.run((ctx) => ctx.db.patch(s.projectId, { clientId: s.otherClient }));
    for (const user of [s.client, s.otherClient, s.adminA, s.adminB]) {
      expect((await feed(s, user)).page).toEqual([]);
      expect(await unread(s, user)).toBe(0);
    }
    for (const alert of await storedAlerts(s.t)) await expect(asUser(s.t, alert.recipientUserId).mutation(notifications.markNotificationRead, { notificationId: alert._id })).rejects.toThrow("NOTIFICATION_NOT_FOUND");
    await expect(request(s)).rejects.toThrow("PROJECT_NOT_FOUND");
    await expect(asUser(s.t, s.otherClient).mutation(support.requestSupport, { projectId: s.projectId, requestKind: "free_help" })).rejects.toThrow("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
    await expect(reply(s, thread.conversationId)).rejects.toThrow("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
    expect(await storedAlerts(s.t)).toHaveLength(3);
  });

  test.each(["entry", "conversation", "project", "client", "client-role", "client-onboarding", "request-pointer", "entry-sender"] as const)("fails closed when %s is deleted or inconsistent", async (target) => {
    const s = await setup();
    const thread = await request(s);
    await s.t.run(async (ctx) => {
      if (target === "entry") await ctx.db.delete(thread.messageId);
      if (target === "conversation") await ctx.db.delete(thread.conversationId);
      if (target === "project") await ctx.db.delete(s.projectId);
      if (target === "client") await ctx.db.delete(s.client);
      if (target === "client-role") await ctx.db.patch(s.client, { accountType: "company" });
      if (target === "client-onboarding") await ctx.db.patch(s.client, { onboardingStatus: "pending" });
      if (target === "request-pointer") await ctx.db.patch(thread.conversationId, { freeHelpRequestId: undefined });
      if (target === "entry-sender") await ctx.db.patch(thread.messageId, { senderUserId: s.otherClient });
    });
    const alert = (await storedAlerts(s.t)).find((n) => n.recipientUserId === s.adminA)!;
    expect((await feed(s, s.adminA)).page).toEqual([]);
    expect(await unread(s, s.adminA)).toBe(0);
    await expect(asUser(s.t, s.adminA).mutation(notifications.markNotificationRead, { notificationId: alert._id })).rejects.toThrow("NOTIFICATION_NOT_FOUND");
  });

  test.each(projectStatuses)("keeps support alerts accessible for a saved %s Project", async (status) => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.projectId, { status }));
    const thread = await request(s);
    await reply(s, thread.conversationId);
    expect((await feed(s, s.adminA)).page).toHaveLength(1);
    expect((await feed(s, s.client)).page).toHaveLength(1);
    expect(await s.t.run((ctx) => ctx.db.get(s.projectId))).toMatchObject({ status });
  });

  test("recipient/event/actor mismatches are rejected by the trusted creation boundary", async () => {
    const s = await setup();
    const thread = await request(s);
    const base = { type: "client_support_free_help_requested" as const, entity: { type: "client_support_entry" as const, id: thread.messageId }, payload: {}, actorUserId: s.client };
    for (const recipientUserId of [s.client, s.otherClient, s.company, s.seo]) {
      await expect(s.t.run((ctx) => createNotification(ctx, { ...base, recipientUserId }))).rejects.toThrow("INVALID_NOTIFICATION_ENTITY");
    }
    await expect(s.t.run((ctx) => createNotification(ctx, { ...base, recipientUserId: s.adminA, actorUserId: s.otherClient }))).rejects.toThrow("INVALID_NOTIFICATION_ENTITY");
    await expect(s.t.run((ctx) => createNotification(ctx, { ...base, recipientUserId: s.adminA, type: "client_support_coordination_requested" }))).rejects.toThrow("INVALID_NOTIFICATION_ENTITY");
    await expect(s.t.run((ctx) => createNotification(ctx, { ...base, recipientUserId: s.adminA, entity: { type: "project", id: s.projectId } }))).rejects.toThrow("INVALID_NOTIFICATION_ENTITY");
    expect(await storedAlerts(s.t)).toHaveLength(2);
  });
});

describe("support notification feed, privacy, read states and delivery", () => {
  test("notification reads/clearing and support message reads remain independent", async () => {
    const s = await setup();
    const thread = await request(s);
    const sent = await reply(s, thread.conversationId);
    const before = await reads(s);
    const actor = asUser(s.t, s.client);
    const alert = (await storedAlerts(s.t)).find((n) => n.recipientUserId === s.client)!;
    await feed(s, s.client);
    await feed(s, s.adminA);
    await actor.query(support.getMyConversation, { projectId: s.projectId });
    await asUser(s.t, s.adminA).query(support.listAdminConversations, page());
    expect(await reads(s)).toEqual(before);
    await actor.mutation(notifications.markNotificationRead, { notificationId: alert._id });
    expect(await reads(s)).toEqual(before);
    const sent2 = await reply(s, thread.conversationId, "reply-2");
    await actor.mutation(support.markMyConversationRead, { conversationId: thread.conversationId, readThroughMessageId: sent2.messageId });
    expect(await unread(s, s.client)).toBe(1);
    const beforeClear = await reads(s);
    await actor.mutation(notifications.markAllNotificationsRead, {});
    expect(await reads(s)).toEqual(beforeClear);
    expect(await unread(s, s.client)).toBe(0);
    expect((await actor.query(support.getMyConversation, { projectId: s.projectId }))!.readThroughSequence).toBe(sent2.sequence);
    expect(sent.sequence).toBe(2);
  });

  test("visible counts preserve marketplace alerts and exclude stale support before mark-all", async () => {
    const s = await setup();
    await request(s);
    const otherId = await s.t.run((ctx) => ctx.db.insert("notifications", { recipientUserId: s.adminA, type: "invitation_received", entity: { type: "project", id: s.projectId }, payload: {}, createdAt: NOW }));
    await s.t.run(async (ctx) => {
      const state = await ctx.db.query("notificationRecipientStates").withIndex("by_recipientUserId", (q) => q.eq("recipientUserId", s.adminA)).unique();
      await ctx.db.patch(state!._id, { unreadCount: 2 });
      await ctx.db.patch(s.adminA, { accountType: "seo_team" });
    });
    expect(await unread(s, s.adminA)).toBe(1);
    expect((await feed(s, s.adminA)).page.map((n) => n.id)).toEqual([otherId]);
    expect((await asUser(s.t, s.adminA).mutation(notifications.markAllNotificationsRead, {})).markedCount).toBe(1);
    await s.t.run((ctx) => ctx.db.patch(s.adminA, { accountType: "admin" }));
    expect(await unread(s, s.adminA)).toBe(0);
    expect((await feed(s, s.adminA)).page.every((n) => n.readAt !== null)).toBe(true);
    await request(s, "coordination_discussion");
    expect(await unread(s, s.adminA)).toBe(1);
    expect((await feed(s, s.adminA)).page.filter((n) => n.readAt === null)).toHaveLength(1);
  });

  test("pagination retains a cursor across an inaccessible page and never marks alerts/messages read", async () => {
    const s = await setup();
    const first = await request(s);
    const secondProject = await s.t.run((ctx) => ctx.db.insert("projects", { clientId: s.client, countryCode: "MA", surfaceUnknown: true, visibility: "marketplace", status: "draft", lastCompletedStep: 1, createdAt: 1, updatedAt: 1 }));
    await asUser(s.t, s.client).mutation(support.requestSupport, { projectId: secondProject, requestKind: "free_help" });
    await s.t.run((ctx) => ctx.db.patch(secondProject, { clientId: s.otherClient }));
    const before = await reads(s);
    const actor = asUser(s.t, s.adminA);
    const hidden = await actor.query(notifications.listMyNotifications, page(1));
    expect(hidden.page).toEqual([]);
    expect(hidden.isDone).toBe(false);
    const next = await actor.query(notifications.listMyNotifications, page(1, hidden.continueCursor));
    expect(next.page).toHaveLength(1);
    expect(next.page[0].entity.id).toBe(first.messageId);
    expect(next.isDone).toBe(true);
    expect(await unread(s, s.adminA)).toBe(1);
    expect(await reads(s)).toEqual(before);
    for (const size of [0, 51, 1.5]) await expect(actor.query(notifications.listMyNotifications, page(size))).rejects.toThrow("INVALID_NOTIFICATION_PAGE_SIZE");
  });

  test("support storage and DTOs expose only generic metadata, and reject private payloads", async () => {
    const s = await setup();
    const thread = await request(s);
    await reply(s, thread.conversationId);
    const alerts = await storedAlerts(s.t);
    const serialized = JSON.stringify({ alerts, adminFeed: await feed(s, s.adminA), clientFeed: await feed(s, s.client) });
    expect(serialized).not.toContain("PRIVATE_");
    expect(serialized).not.toContain("https://private.example");
    for (const user of [s.client, s.adminA]) for (const n of (await feed(s, user)).page) {
      expect(n.payload).toEqual({});
      expect(n.actorUserId).toBeNull();
      expect(n.projectId).toBe(s.projectId);
      expect(Object.keys(n).sort()).toEqual(["actorUserId", "createdAt", "entity", "id", "payload", "projectId", "readAt", "type"]);
    }
    const alert = alerts[0];
    for (const payload of [{ projectTitle: "PRIVATE_PROJECT_TITLE_SENTINEL" }, { messagePreview: "PRIVATE_QUOTE_SENTINEL" }, { actorDisplayName: "PRIVATE_NAME_SENTINEL" }]) {
      await expect(s.t.run((ctx) => createNotification(ctx, { recipientUserId: alert.recipientUserId, type: alert.type, entity: alert.entity, actorUserId: s.client, payload }))).rejects.toThrow("INVALID_NOTIFICATION_PAYLOAD");
    }
    // DTOs also sanitize any malformed persisted payload, rather than forwarding it.
    await s.t.run((ctx) => ctx.db.patch(alert._id, { payload: { messagePreview: "PRIVATE_ATTACHMENT_URL_SENTINEL" } }));
    expect(JSON.stringify(await feed(s, s.adminA))).not.toContain("PRIVATE_");
  });

  test("creates no push jobs even with enabled preferences/devices, and rejects direct push delivery", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (const userId of [s.client, s.adminA, s.adminB]) {
        await ctx.db.insert("notificationPreferences", { userId, ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: true, updatedAt: 1 });
        await ctx.db.insert("pushSubscriptions", { userId, endpoint: `https://push.example/${userId}`, p256dh: "A".repeat(87), auth: "B".repeat(22), locale: "fr", createdAt: 1, updatedAt: 1 });
      }
    });
    const preferenceSnapshot = () => s.t.run(async (ctx) => ({ preferences: await ctx.db.query("notificationPreferences").collect(), subscriptions: await ctx.db.query("pushSubscriptions").collect() }));
    const before = await preferenceSnapshot();
    const thread = await request(s);
    await request(s, "coordination_discussion");
    await asUser(s.t, s.client).mutation(support.sendClientMessage, { conversationId: thread.conversationId, body: "Question", idempotencyKey: "question" });
    await reply(s, thread.conversationId);
    const alerts = await storedAlerts(s.t);
    expect(alerts).toHaveLength(7);
    expect(alerts.every((n) => n.pushDeliveryStatus === undefined)).toBe(true);
    expect(await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
    expect(await preferenceSnapshot()).toEqual(before);
    for (const n of alerts) {
      expect(() => marketplacePushPresentation(n, n.recipientUserId === s.client ? "client" : "admin", "fr")).toThrow("NOTIFICATION_PUSH_INELIGIBLE");
      await s.t.action(internal.notifications.pushDelivery.deliverMarketplacePush, { notificationId: n._id });
    }
    expect(webPush.sendNotification).not.toHaveBeenCalled();
    expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    expect(await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
    expect(await preferenceSnapshot()).toEqual(before);
  });
});
