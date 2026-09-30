/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const webPush = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => webPush);

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

function makeBackend() {
  return convexTest(schema, modules);
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}

async function addUser(t: Backend, isAnonymous = false) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${crypto.randomUUID()}@push.test`,
    accountType: "client",
    isAnonymous,
    onboardingStatus: "completed",
    countryCode: "MA",
    createdAt: 1,
    updatedAt: 1,
  }));
}

const subscription = (suffix: string, locale: "fr" | "en" = "fr") => ({
  endpoint: `https://push.example.test/subscriptions/${suffix}`,
  p256dh: "A".repeat(87),
  auth: "B".repeat(22),
  locale,
});

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

describe("push subscription API", () => {
  test("registers the first device, updates a duplicate endpoint, and keeps secrets private", async () => {
    const t = makeBackend();
    const userId = await addUser(t);
    const viewer = asUser(t, userId);
    const device = subscription("phone");

    await expect(viewer.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      device,
    )).resolves.toMatchObject({ created: true });
    await expect(viewer.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      { ...device, auth: "E".repeat(22), locale: "en" },
    )).resolves.toMatchObject({ created: false });

    await expect(viewer.query(
      api.notifications.pushSubscriptions.getMyPushSubscriptionState,
      { endpoint: device.endpoint },
    )).resolves.toEqual({ registered: true, updatedAt: expect.any(Number) });

    const stored = await t.run((ctx) => ctx.db.query("pushSubscriptions").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      userId,
      endpoint: device.endpoint,
      auth: "E".repeat(22),
      locale: "en",
    });
    expect(Object.keys(await viewer.query(
      api.notifications.pushSubscriptions.getMyPushSubscriptionState,
      { endpoint: device.endpoint },
    ))).toEqual(["registered", "updatedAt"]);
  });

  test("requires every new registration to declare its device locale", async () => {
    const t = makeBackend();
    const userId = await addUser(t);
    const viewer = asUser(t, userId);
    const currentDevice = subscription("legacy-client");
    const device = {
      endpoint: currentDevice.endpoint,
      p256dh: currentDevice.p256dh,
      auth: currentDevice.auth,
    };

    await expect(viewer.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      device as never,
    )).rejects.toThrow();
    await expect(t.run((ctx) => ctx.db.query("pushSubscriptions").collect()))
      .resolves.toEqual([]);
  });

  test("supports multiple devices and unregisters only the current endpoint", async () => {
    const t = makeBackend();
    const userId = await addUser(t);
    const viewer = asUser(t, userId);
    const phone = subscription("phone");
    const laptop = subscription("laptop");

    await viewer.mutation(api.notifications.pushSubscriptions.registerMyPushSubscription, phone);
    await viewer.mutation(api.notifications.pushSubscriptions.registerMyPushSubscription, laptop);
    await expect(viewer.mutation(
      api.notifications.pushSubscriptions.unregisterMyPushSubscription,
      { endpoint: phone.endpoint },
    )).resolves.toEqual({ removed: true });

    const stored = await t.run((ctx) => ctx.db.query("pushSubscriptions").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0].endpoint).toBe(laptop.endpoint);
  });

  test("enforces the documented 20-device cap without disturbing registered devices", async () => {
    const t = makeBackend();
    const userId = await addUser(t);
    const viewer = asUser(t, userId);
    for (let index = 0; index < 20; index += 1) {
      await viewer.mutation(
        api.notifications.pushSubscriptions.registerMyPushSubscription,
        subscription(`device-${index}`),
      );
    }
    await expect(viewer.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      subscription("device-20"),
    )).rejects.toThrow("PUSH_SUBSCRIPTION_LIMIT_REACHED");
    await expect(t.run((ctx) => ctx.db.query("pushSubscriptions").collect()))
      .resolves.toHaveLength(20);
  });

  test("allows proof-of-possession rebinding but rejects endpoint-only cross-user claims", async () => {
    const t = makeBackend();
    const ownerId = await addUser(t);
    const otherId = await addUser(t);
    const owner = asUser(t, ownerId);
    const other = asUser(t, otherId);
    const device = subscription("owner");
    await owner.mutation(api.notifications.pushSubscriptions.registerMyPushSubscription, device);
    await t.run(async (ctx) => {
      const stored = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", device.endpoint))
        .unique();
      if (!stored) throw new Error("Expected stored subscription");
      await ctx.db.patch(stored._id, { lastUsedAt: 123 });
    });

    await expect(other.query(
      api.notifications.pushSubscriptions.getMyPushSubscriptionState,
      { endpoint: device.endpoint },
    )).resolves.toEqual({ registered: false, updatedAt: null });
    await expect(other.mutation(
      api.notifications.pushSubscriptions.unregisterMyPushSubscription,
      { endpoint: device.endpoint },
    )).resolves.toEqual({ removed: false });
    await expect(other.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      { ...device, auth: "C".repeat(22) },
    )).rejects.toThrow("PUSH_SUBSCRIPTION_NOT_FOUND");
    await expect(other.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      device,
    )).resolves.toMatchObject({ created: false });

    await expect(owner.query(
      api.notifications.pushSubscriptions.getMyPushSubscriptionState,
      { endpoint: device.endpoint },
    )).resolves.toEqual({ registered: false, updatedAt: null });
    await expect(other.query(
      api.notifications.pushSubscriptions.getMyPushSubscriptionState,
      { endpoint: device.endpoint },
    )).resolves.toEqual({ registered: true, updatedAt: expect.any(Number) });
    const stored = await t.run((ctx) => ctx.db.query("pushSubscriptions").collect());
    expect(stored).toEqual([expect.objectContaining({ userId: otherId, ...device })]);
    expect(stored[0]).not.toHaveProperty("lastUsedAt");
  });

  test("does not bypass the device cap when rebinding a shared-browser endpoint", async () => {
    const t = makeBackend();
    const ownerId = await addUser(t);
    const fullAccountId = await addUser(t);
    const owner = asUser(t, ownerId);
    const fullAccount = asUser(t, fullAccountId);
    const sharedBrowser = subscription("shared-browser");
    await owner.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      sharedBrowser,
    );
    for (let index = 0; index < 20; index += 1) {
      await fullAccount.mutation(
        api.notifications.pushSubscriptions.registerMyPushSubscription,
        subscription(`full-account-${index}`),
      );
    }

    await expect(fullAccount.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      sharedBrowser,
    )).rejects.toThrow("PUSH_SUBSCRIPTION_LIMIT_REACHED");
    await expect(owner.query(
      api.notifications.pushSubscriptions.getMyPushSubscriptionState,
      { endpoint: sharedBrowser.endpoint },
    )).resolves.toEqual({ registered: true, updatedAt: expect.any(Number) });
  });

  test("rejects unauthenticated, anonymous, malformed, and caller-targeted requests", async () => {
    const t = makeBackend();
    const anonymousId = await addUser(t, true);
    const device = subscription("blocked");
    await expect(t.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      device,
    )).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(t, anonymousId).mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      device,
    )).rejects.toThrow("PUSH_SUBSCRIPTIONS_FORBIDDEN");

    const userId = await addUser(t);
    const viewer = asUser(t, userId);
    await expect(viewer.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      { ...device, endpoint: "http://push.example.test/insecure" },
    )).rejects.toThrow("INVALID_PUSH_SUBSCRIPTION");
    await expect(viewer.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      { ...device, userId } as never,
    )).rejects.toThrow();
  });
});

describe("authenticated test push", () => {
  test("sends only to the caller's subscriptions with localized safe payload", async () => {
    const t = makeBackend();
    const ownerId = await addUser(t);
    const otherId = await addUser(t);
    const owner = asUser(t, ownerId);
    const other = asUser(t, otherId);
    const ownerDevice = subscription("owner-test");
    const otherDevice = subscription("other-test");
    await owner.mutation(api.notifications.pushSubscriptions.registerMyPushSubscription, ownerDevice);
    await other.mutation(api.notifications.pushSubscriptions.registerMyPushSubscription, otherDevice);

    await expect(owner.action(
      api.notifications.pushTest.sendMyTestPush,
      { locale: "fr" },
    )).resolves.toEqual({ sent: 1, removed: 0, failed: 0 });
    expect(webPush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:notifications@batiplusmaroc.com",
      "C".repeat(87),
      "D".repeat(43),
    );
    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    expect(webPush.sendNotification.mock.calls[0][0]).toMatchObject({ endpoint: ownerDevice.endpoint });
    expect(JSON.parse(webPush.sendNotification.mock.calls[0][1] as string)).toEqual({
      title: "Batiplus Maroc",
      body: "Les notifications Batiplus sont activées.",
      locale: "fr",
      url: "/fr/notifications",
      tag: "batiplus-push-test",
    });
    await expect(t.run(async (ctx) => ({
      notifications: await ctx.db.query("notifications").collect(),
      recipientStates: await ctx.db.query("notificationRecipientStates").collect(),
    }))).resolves.toEqual({ notifications: [], recipientStates: [] });
  });

  test.each([404, 410])("removes permanent %s subscriptions", async (statusCode) => {
    const t = makeBackend();
    const userId = await addUser(t);
    const viewer = asUser(t, userId);
    await viewer.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      subscription("expired"),
    );
    webPush.sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode }));

    await expect(viewer.action(
      api.notifications.pushTest.sendMyTestPush,
      { locale: "en" },
    )).resolves.toEqual({ sent: 0, removed: 1, failed: 0 });
    await expect(t.run((ctx) => ctx.db.query("pushSubscriptions").collect()))
      .resolves.toEqual([]);
  });

  test("fails safely when server-side VAPID configuration is missing", async () => {
    const t = makeBackend();
    const userId = await addUser(t);
    const viewer = asUser(t, userId);
    await viewer.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      subscription("unconfigured"),
    );
    delete process.env.VAPID_PRIVATE_KEY;

    await expect(viewer.action(
      api.notifications.pushTest.sendMyTestPush,
      { locale: "en" },
    )).rejects.toThrow("PUSH_NOT_CONFIGURED");
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });

  test.each(["mailto:", "not-a-uri", "http://notifications.example.com", "https://"])(
    "rejects invalid VAPID subject %s before delivery",
    async (subject) => {
      const t = makeBackend();
      const userId = await addUser(t);
      const viewer = asUser(t, userId);
      await viewer.mutation(
        api.notifications.pushSubscriptions.registerMyPushSubscription,
        subscription(`invalid-subject-${subject.length}`),
      );
      process.env.VAPID_SUBJECT = subject;

      await expect(viewer.action(
        api.notifications.pushTest.sendMyTestPush,
        { locale: "fr" },
      )).rejects.toThrow("PUSH_NOT_CONFIGURED");
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    },
  );

  test("preserves temporary failures and denies anonymous or cross-user targeting", async () => {
    const t = makeBackend();
    const ownerId = await addUser(t);
    const otherId = await addUser(t);
    const owner = asUser(t, ownerId);
    await owner.mutation(
      api.notifications.pushSubscriptions.registerMyPushSubscription,
      subscription("temporary"),
    );
    webPush.sendNotification.mockRejectedValue(Object.assign(new Error("unavailable"), { statusCode: 503 }));

    await expect(owner.action(
      api.notifications.pushTest.sendMyTestPush,
      { locale: "en" },
    )).resolves.toEqual({ sent: 0, removed: 0, failed: 1 });
    await expect(t.run((ctx) => ctx.db.query("pushSubscriptions").collect()))
      .resolves.toHaveLength(1);
    await expect(asUser(t, otherId).action(
      api.notifications.pushTest.sendMyTestPush,
      { locale: "en" },
    )).rejects.toThrow("PUSH_SUBSCRIPTION_NOT_FOUND");
    await expect(t.action(
      api.notifications.pushTest.sendMyTestPush,
      { locale: "en" },
    )).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(owner.action(
      api.notifications.pushTest.sendMyTestPush,
      { locale: "en", userId: otherId } as never,
    )).rejects.toThrow();
  });
});
