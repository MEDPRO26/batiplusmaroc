/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createNotification,
  createNotificationForActiveCompanyMembers,
  type CreateNotificationArgs,
} from "./notifications/model";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
type AccountType = "client" | "company" | "admin" | "seo_team";

function makeBackend() {
  return convexTest(schema, modules);
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function addUser(t: Backend, accountType: AccountType) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${crypto.randomUUID()}@notifications.test`,
    accountType,
    onboardingStatus: "completed",
    countryCode: "MA",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function setup() {
  const t = makeBackend();
  const clientId = await addUser(t, "client");
  const companyId = await addUser(t, "company");
  const adminId = await addUser(t, "admin");
  const seoId = await addUser(t, "seo_team");
  const projectId = await t.run((ctx) => ctx.db.insert("projects", {
    clientId,
    title: "Riad renovation",
    countryCode: "MA",
    surfaceUnknown: true,
    budgetUnknown: true,
    visibility: "marketplace",
    status: "published",
    lastCompletedStep: 6,
    createdAt: 1,
    updatedAt: 1,
  }));
  const companyRecordId = await t.run((ctx) => ctx.db.insert("companies", {
    name: "Atlas Build",
    slug: `atlas-build-${crypto.randomUUID()}`,
    onboardingStatus: "completed",
    verificationStatus: "verified",
    createdAt: 1,
    updatedAt: 1,
  }));
  const proposalId = await t.run((ctx) => ctx.db.insert("projectQuotes", {
    projectId,
    companyId: companyRecordId,
    submittedByUserId: companyId,
    message: "Proposal",
    estimatedPrice: 10_000,
    currency: "MAD",
    estimatedDuration: 30,
    availableStartDate: "2099-01-01",
    scope: "Notification test scope",
    quoteType: "initial",
    status: "submitted",
    submittedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  }));
  return { t, clientId, companyId, adminId, seoId, projectId, companyRecordId, proposalId };
}

async function notify(
  t: Backend,
  args: Omit<CreateNotificationArgs, "type" | "payload"> & Partial<Pick<CreateNotificationArgs, "type" | "payload">>,
) {
  return await t.run(async (ctx) => await createNotification(ctx, {
    type: args.type ?? "proposal_received",
    payload: args.payload ?? { projectTitle: "Riad renovation" },
    ...args,
  }));
}

const page = (numItems = 20, cursor: string | null = null) => ({ paginationOpts: { numItems, cursor } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notification foundation", () => {
  test("requires authentication and supports client, company, admin, and SEO recipients", async () => {
    const state = await setup();
    await expect(state.t.query(api.notifications.index.listMyNotifications, page())).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(state.t.query(api.notifications.index.getMyUnreadCount, {})).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(state.t.mutation(api.notifications.index.markAllNotificationsRead, {})).rejects.toThrow("NOT_AUTHENTICATED");

    for (const recipientUserId of [state.clientId, state.companyId, state.adminId, state.seoId]) {
      await notify(state.t, {
        recipientUserId,
        actorUserId: state.clientId,
        entity: { type: "proposal", id: state.proposalId },
      });
      const viewer = asUser(state.t, recipientUserId);
      await expect(viewer.query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(1);
      await expect(viewer.query(api.notifications.index.listMyNotifications, page())).resolves.toMatchObject({
        page: [expect.objectContaining({
          type: "proposal_received",
          entity: { type: "proposal", id: state.proposalId },
          projectId: state.projectId,
          payload: { projectTitle: "Riad renovation" },
          actorUserId: state.clientId,
          createdAt: expect.any(Number),
          readAt: null,
        })],
      });
    }
  });

  test("isolates recipient reads and never accepts a caller-supplied recipient", async () => {
    const state = await setup();
    const created = await notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
    });

    const other = asUser(state.t, state.companyId);
    expect((await other.query(api.notifications.index.listMyNotifications, page())).page).toEqual([]);
    await expect(other.mutation(api.notifications.index.markNotificationRead, {
      notificationId: created.notificationId,
    })).rejects.toThrow("NOTIFICATION_NOT_FOUND");
    await expect(asUser(state.t, state.clientId).query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(1);
  });

  test("lists newest first with stable cursor pagination and bounded page sizes", async () => {
    const state = await setup();
    const now = vi.spyOn(Date, "now");
    for (const [timestamp, projectTitle] of [[100, "Old"], [200, "Middle"], [300, "Newest"]] as const) {
      now.mockReturnValue(timestamp);
      await notify(state.t, {
        recipientUserId: state.clientId,
        entity: { type: "proposal", id: state.proposalId },
        payload: { projectTitle },
      });
    }

    const viewer = asUser(state.t, state.clientId);
    const first = await viewer.query(api.notifications.index.listMyNotifications, page(2));
    expect(first.page.map((item) => item.payload.projectTitle)).toEqual(["Newest", "Middle"]);
    expect(first.isDone).toBe(false);
    const second = await viewer.query(api.notifications.index.listMyNotifications, page(2, first.continueCursor));
    expect(second.page.map((item) => item.payload.projectTitle)).toEqual(["Old"]);
    expect(second.isDone).toBe(true);
    await expect(viewer.query(api.notifications.index.listMyNotifications, page(51))).rejects.toThrow("INVALID_NOTIFICATION_PAGE_SIZE");
  });

  test("marks one or all as read idempotently and keeps the exact unread count", async () => {
    const state = await setup();
    const first = await notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
    });
    await notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
    });
    const viewer = asUser(state.t, state.clientId);
    await expect(viewer.query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(2);

    const read = await viewer.mutation(api.notifications.index.markNotificationRead, { notificationId: first.notificationId });
    expect(read.changed).toBe(true);
    await expect(viewer.mutation(api.notifications.index.markNotificationRead, { notificationId: first.notificationId }))
      .resolves.toMatchObject({ changed: false, readAt: read.readAt });
    await expect(viewer.query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(1);

    await expect(viewer.mutation(api.notifications.index.markAllNotificationsRead, {})).resolves.toMatchObject({ markedCount: 1 });
    await expect(viewer.query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(0);
    expect((await viewer.query(api.notifications.index.listMyNotifications, page())).page.every((item) => item.readAt !== null)).toBe(true);

    const afterMarkAll = await notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
      payload: { messagePreview: "A new message after mark-all" },
    });
    await expect(viewer.query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(1);
    const after = await viewer.query(api.notifications.index.listMyNotifications, page());
    expect(after.page[0]).toMatchObject({ type: "proposal_received", readAt: null });
    await expect(viewer.mutation(api.notifications.index.markNotificationRead, {
      notificationId: afterMarkAll.notificationId,
    })).resolves.toMatchObject({ changed: true });
    await expect(viewer.query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(0);
  });

  test("keeps a notification created in the mark-all millisecond logically unread", async () => {
    const state = await setup();
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const viewer = asUser(state.t, state.clientId);

    const before = await notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
      payload: { projectTitle: "Before mark-all" },
    });
    const marked = await viewer.mutation(api.notifications.index.markAllNotificationsRead, {});
    expect(marked).toEqual({ markedCount: 1, readAt: fixedNow });

    const after = await notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
      payload: { projectTitle: "After mark-all in the same millisecond" },
    });

    const stored = await state.t.run(async (ctx) => ({
      before: await ctx.db.get(before.notificationId),
      after: await ctx.db.get(after.notificationId),
      recipientState: await ctx.db
        .query("notificationRecipientStates")
        .withIndex("by_recipientUserId", (q) => q.eq("recipientUserId", state.clientId))
        .unique(),
    }));
    expect(stored.before?.createdAt).toBe(fixedNow);
    expect(stored.recipientState).toMatchObject({ readThroughAt: fixedNow, unreadCount: 1 });
    expect(stored.after?.createdAt).toBe(fixedNow + 1);
    expect(stored.after).not.toHaveProperty("readAt");

    const listed = await viewer.query(api.notifications.index.listMyNotifications, page());
    expect(listed.page).toEqual([
      expect.objectContaining({ id: after.notificationId, createdAt: fixedNow + 1, readAt: null }),
      expect.objectContaining({ id: before.notificationId, createdAt: fixedNow, readAt: fixedNow }),
    ]);
    await expect(viewer.query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(1);
  });

  test("deduplicates trusted retries per recipient without suppressing another recipient", async () => {
    const state = await setup();
    const args = {
      recipientUserId: state.clientId,
      entity: { type: "proposal" as const, id: state.proposalId },
      dedupeKey: `proposal:${state.projectId}:received`,
    };
    const first = await notify(state.t, args);
    const retry = await notify(state.t, args);
    expect(retry).toEqual({ notificationId: first.notificationId, created: false });
    await expect(asUser(state.t, state.clientId).query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(1);

    const other = await notify(state.t, { ...args, recipientUserId: state.companyId });
    expect(other.created).toBe(true);
    await expect(asUser(state.t, state.companyId).query(api.notifications.index.getMyUnreadCount, {})).resolves.toBe(1);
  });

  test("Company fan-out excludes its actor while notifying other authorized active members", async () => {
    const state = await setup();
    const teammateId = await addUser(state.t, "company");
    await state.t.run(async (ctx) => {
      for (const userId of [state.companyId, teammateId]) {
        await ctx.db.insert("companyMembers", {
          companyId: state.companyRecordId,
          userId,
          role: userId === state.companyId ? "owner" : "staff",
          status: "active",
          createdAt: 1,
        });
      }
      await createNotificationForActiveCompanyMembers(ctx, {
        companyId: state.companyRecordId,
        actorUserId: state.companyId,
        type: "proposal_accepted",
        entity: { type: "proposal", id: state.proposalId },
        payload: { companyName: "Atlas Build" },
        dedupeKey: `proposal:${state.proposalId}:accepted`,
      });
    });

    expect((await asUser(state.t, state.companyId).query(
      api.notifications.index.listMyNotifications,
      page(),
    )).page).toEqual([]);
    expect((await asUser(state.t, teammateId).query(
      api.notifications.index.listMyNotifications,
      page(),
    )).page).toEqual([
      expect.objectContaining({
        type: "proposal_accepted",
        actorUserId: state.companyId,
      }),
    ]);
  });

  test("validates trusted creation input and query results react to new writes", async () => {
    const state = await setup();
    const viewer = asUser(state.t, state.clientId);
    expect((await viewer.query(api.notifications.index.listMyNotifications, page())).page).toEqual([]);

    await expect(notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
      payload: { rating: 6 },
    })).rejects.toThrow("INVALID_NOTIFICATION_PAYLOAD");
    await expect(notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
      payload: { scheduledAt: -1 },
    })).rejects.toThrow("INVALID_NOTIFICATION_PAYLOAD");
    await expect(notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
      dedupeKey: "   ",
    })).rejects.toThrow("INVALID_NOTIFICATION_DEDUPE_KEY");
    await expect(state.t.run(async (ctx) => await createNotification(ctx, {
      recipientUserId: state.clientId,
      type: "proposal_received",
      entity: { type: "project", id: state.projectId },
      payload: {},
    } as unknown as CreateNotificationArgs))).rejects.toThrow("INVALID_NOTIFICATION_ENTITY");

    await notify(state.t, {
      recipientUserId: state.clientId,
      entity: { type: "proposal", id: state.proposalId },
      payload: { companyName: "Atlas Build" },
    });
    const refreshed = await viewer.query(api.notifications.index.listMyNotifications, page());
    expect(refreshed.page).toHaveLength(1);
    expect(refreshed.page[0]).toMatchObject({ type: "proposal_received", payload: { companyName: "Atlas Build" } });
  });
});
