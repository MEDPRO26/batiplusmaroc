/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ACTIVE_NOTIFICATION_TYPES } from "./notifications/constants";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notifications/deliveryPolicy";
import { createNotification } from "./notifications/model";
import {
  MARKETPLACE_PUSH_BODY_TEMPLATES,
  marketplacePushPresentation,
} from "./notifications/pushPresentation";
import schema from "./schema";

const webPush = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => webPush);

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

const subscription = (suffix: string) => ({
  endpoint: `https://push.example.test/subscriptions/${suffix}`,
  p256dh: "A".repeat(87),
  auth: "B".repeat(22),
});

async function seedMessageContext(t: Backend) {
  return await t.run(async (ctx) => {
    const recipientUserId = await ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@push-delivery.test`,
      firstName: "Nadia",
      accountType: "client",
      onboardingStatus: "completed",
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    });
    const senderUserId = await ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@push-delivery.test`,
      firstName: "Amine",
      accountType: "company",
      onboardingStatus: "completed",
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Atlas Build",
      onboardingStatus: "completed",
      verificationStatus: "verified",
      createdAt: 1,
      updatedAt: 1,
    });
    const projectId = await ctx.db.insert("projects", {
      clientId: recipientUserId,
      countryCode: "MA",
      title: "Villa Atlas",
      surfaceUnknown: true,
      budgetUnknown: true,
      visibility: "marketplace",
      status: "published",
      lastCompletedStep: 6,
      createdAt: 1,
      updatedAt: 1,
    });
    const quoteId = await ctx.db.insert("projectQuotes", {
      projectId,
      companyId,
      submittedByUserId: senderUserId,
      message: "Estimate",
      estimatedPrice: 100_000,
      currency: "MAD",
      estimatedDuration: 30,
      availableStartDate: "2026-10-01",
      scope: "Renovation",
      quoteType: "initial",
      status: "discussion_open",
      createdAt: 1,
      updatedAt: 1,
      submittedAt: 1,
    });
    const conversationId = await ctx.db.insert("conversations", {
      projectId,
      quoteId,
      clientId: recipientUserId,
      companyId,
      status: "active",
      createdBy: recipientUserId,
      createdAt: 1,
      updatedAt: 1,
    });
    return { recipientUserId, senderUserId, projectId, conversationId };
  });
}

async function enablePush(t: Backend, userId: Id<"users">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("notificationPreferences", {
      userId,
      pushEnabled: true,
      pushCategories: { ...DEFAULT_NOTIFICATION_PREFERENCES.pushCategories },
      updatedAt: 1,
    });
  });
}

async function addSubscriptions(t: Backend, userId: Id<"users">, suffixes: string[]) {
  await t.run(async (ctx) => {
    for (const suffix of suffixes) {
      await ctx.db.insert("pushSubscriptions", {
        userId,
        ...subscription(suffix),
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });
}

async function createMessageNotification(
  t: Backend,
  context: Awaited<ReturnType<typeof seedMessageContext>>,
  key: string,
) {
  return await t.run((ctx) => createNotification(ctx, {
    recipientUserId: context.recipientUserId,
    actorUserId: context.senderUserId,
    type: "message_received",
    entity: { type: "conversation", id: context.conversationId },
    payload: {
      actorDisplayName: "Amine",
      projectTitle: "Villa Atlas",
      messagePreview: "Private message text must never enter the push payload.",
    },
    dedupeKey: key,
  }));
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "C".repeat(87);
  process.env.VAPID_PRIVATE_KEY = "D".repeat(43);
  process.env.VAPID_SUBJECT = "mailto:notifications@batiplusmaroc.com";
  webPush.sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
  webPush.setVapidDetails.mockReset();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  vi.restoreAllMocks();
});

describe("marketplace push delivery", () => {
  test("schedules once after creation, fans out to every device, and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const context = await seedMessageContext(t);
    await enablePush(t, context.recipientUserId);
    await addSubscriptions(t, context.recipientUserId, ["phone", "laptop"]);

    const first = await createMessageNotification(t, context, "message:delivery:received");
    const duplicate = await createMessageNotification(t, context, "message:delivery:received");
    expect(first.created).toBe(true);
    expect(duplicate).toEqual({ notificationId: first.notificationId, created: false });

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].name).toContain("notifications/pushDelivery:deliverMarketplacePush");
    await t.finishAllScheduledFunctions(() => {});

    expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(webPush.sendNotification.mock.calls[0][1] as string);
    expect(payload).toEqual({
      title: "Batiplus Maroc",
      body: "Nouveau message de Amine au sujet de Villa Atlas.",
      url: `/fr/messages/${context.conversationId}`,
      tag: `batiplus-notification-${first.notificationId}`,
    });
    expect(JSON.stringify(payload)).not.toContain("Private message text");
    expect(JSON.stringify(payload)).not.toContain("push.example.test");

    await t.action(internal.notifications.pushDelivery.deliverMarketplacePush, {
      notificationId: first.notificationId,
    });
    expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
    await expect(t.run((ctx) => ctx.db.get(first.notificationId))).resolves.toMatchObject({
      pushDeliveryStatus: "completed",
      pushDeliveredCount: 2,
      pushRemovedCount: 0,
      pushFailedCount: 0,
    });
  });

  test("requires global preference, category preference, and a subscription", async () => {
    const cases = ["global", "category", "subscription"] as const;
    for (const blockedBy of cases) {
      const t = convexTest(schema, modules);
      const context = await seedMessageContext(t);
      if (blockedBy !== "global") await enablePush(t, context.recipientUserId);
      if (blockedBy === "category") {
        await t.run(async (ctx) => {
          const preference = await ctx.db.query("notificationPreferences").collect();
          await ctx.db.patch(preference[0]._id, {
            pushCategories: {
              ...DEFAULT_NOTIFICATION_PREFERENCES.pushCategories,
              messages: false,
            },
          });
        });
      }
      if (blockedBy !== "subscription") {
        await addSubscriptions(t, context.recipientUserId, [blockedBy]);
      }
      const result = await createMessageNotification(t, context, `message:${blockedBy}:received`);
      await t.finishAllScheduledFunctions(() => {});
      await expect(t.run((ctx) => ctx.db.get(result.notificationId))).resolves.toMatchObject({
        pushDeliveryStatus: "skipped",
        pushDeliveredCount: 0,
      });
    }
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });

  test("removes only permanent failures, preserves temporary failures, and cannot roll back domain state", async () => {
    const t = convexTest(schema, modules);
    const context = await seedMessageContext(t);
    await enablePush(t, context.recipientUserId);
    await addSubscriptions(t, context.recipientUserId, ["ok", "gone", "temporary"]);
    webPush.sendNotification.mockImplementation(async (value: { endpoint: string }) => {
      if (value.endpoint.endsWith("gone")) {
        throw Object.assign(new Error("gone"), { statusCode: 410 });
      }
      if (value.endpoint.endsWith("temporary")) {
        throw Object.assign(new Error("unavailable"), { statusCode: 503 });
      }
      return { statusCode: 201 };
    });

    const result = await t.run(async (ctx) => {
      await ctx.db.patch(context.projectId, { updatedAt: 99 });
      return await createNotification(ctx, {
        recipientUserId: context.recipientUserId,
        actorUserId: context.senderUserId,
        type: "message_received",
        entity: { type: "conversation", id: context.conversationId },
        payload: { actorDisplayName: "Amine", projectTitle: "Villa Atlas" },
        dedupeKey: "message:failures:received",
      });
    });
    await t.finishAllScheduledFunctions(() => {});

    const stored = await t.run(async (ctx) => ({
      project: await ctx.db.get(context.projectId),
      notification: await ctx.db.get(result.notificationId),
      subscriptions: await ctx.db.query("pushSubscriptions").collect(),
      recipientState: await ctx.db.query("notificationRecipientStates").collect(),
    }));
    expect(stored.project?.updatedAt).toBe(99);
    expect(stored.recipientState[0].unreadCount).toBe(1);
    expect(stored.notification).toMatchObject({
      pushDeliveryStatus: "completed",
      pushDeliveredCount: 1,
      pushRemovedCount: 1,
      pushFailedCount: 1,
    });
    expect(stored.subscriptions.map((item) => item.endpoint).sort()).toEqual([
      subscription("ok").endpoint,
      subscription("temporary").endpoint,
    ]);
  });
});

describe("marketplace push presentation", () => {
  test("keeps every active event body aligned with the existing EN/FR notification copy", () => {
    for (const type of ACTIVE_NOTIFICATION_TYPES) {
      expect(MARKETPLACE_PUSH_BODY_TEMPLATES.en[type]).toBe(en.notifications.events[type]);
      expect(MARKETPLACE_PUSH_BODY_TEMPLATES.fr[type]).toBe(fr.notifications.events[type]);
    }
  });

  test.each([
    ["proposal_received", "proposal"],
    ["message_received", "conversation"],
    ["site_visit_confirmed", "site_visit"],
    ["final_quote_submitted", "final_quote"],
    ["commission_due", "deal"],
    ["deal_completed", "deal"],
    ["review_received", "review"],
    ["company_verification_approved", "company_verification"],
  ] as const)("renders %s safely in both supported locales", (type, entityType) => {
    const notification = {
      _id: "notification-1" as Id<"notifications">,
      type,
      entity: { type: entityType, id: "entity-1" },
      payload: {
        actorDisplayName: "Amine",
        projectTitle: "Villa Atlas",
        companyName: "Atlas Build",
        amountMad: 12_000,
        rating: 5,
        messagePreview: "This private preview must not be rendered.",
      },
    } as Parameters<typeof marketplacePushPresentation>[0];
    for (const locale of ["en", "fr"] as const) {
      const payload = marketplacePushPresentation(notification, "company", locale);
      expect(payload.body).not.toContain("{");
      expect(payload.body).not.toContain("private preview");
      expect(payload.url).toMatch(new RegExp(`^/${locale}/`));
      expect(Object.keys(payload).sort()).toEqual(["body", "tag", "title", "url"]);
    }
  });

  test("renders localized role-safe deep links for representative event families", () => {
    const base = {
      _id: "notification-1" as Id<"notifications">,
      payload: { projectTitle: "Villa Atlas", companyName: "Atlas Build", amountMad: 12_000, rating: 5 },
    };
    const render = (type: string, entity: { type: string; id: string }, role: "client" | "company", locale: "fr" | "en") =>
      marketplacePushPresentation({ ...base, type, entity } as Parameters<typeof marketplacePushPresentation>[0], role, locale);

    expect(render("proposal_received", { type: "proposal", id: "proposal-1" }, "client", "en")).toMatchObject({
      body: "Atlas Build sent a proposal for Villa Atlas.",
      url: "/en/client/dashboard",
    });
    expect(render("site_visit_confirmed", { type: "site_visit", id: "visit-1" }, "company", "fr").url).toBe("/fr/messages");
    expect(render("commission_due", { type: "deal", id: "deal-1" }, "company", "en")).toMatchObject({
      body: "A commission of 12,000 MAD is due for Villa Atlas.",
      url: "/en/company/commissions",
    });
    expect(render("review_received", { type: "review", id: "review-1" }, "company", "fr").url).toBe("/fr/espace-entreprise/profil");
    expect(render("company_verification_rejected", { type: "company_verification", id: "verification-1" }, "company", "en").url).toBe("/en/company/verification");
  });
});
