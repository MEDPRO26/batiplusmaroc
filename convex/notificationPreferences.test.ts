/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  ACTIVE_NOTIFICATION_TYPES,
  NOTIFICATION_TYPES,
} from "./notifications/constants";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_DELIVERY_POLICY,
  getNotificationDeliveryPolicy,
  resolveNotificationDelivery,
  type NotificationPreferenceCategory,
} from "./notifications/deliveryPolicy";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
type AccountType = "client" | "company" | "admin" | "seo_team";

function makeBackend() {
  return convexTest(schema, modules);
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}

async function addUser(t: Backend, accountType: AccountType, isAnonymous = false) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${crypto.randomUUID()}@notification-preferences.test`,
    accountType,
    isAnonymous,
    onboardingStatus: "completed",
    countryCode: "MA",
    createdAt: 1,
    updatedAt: 1,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notification delivery policy", () => {
  test("maps every active event explicitly and keeps the reserved event disabled", () => {
    const expectedCategories: Record<string, NotificationPreferenceCategory> = {
      proposal_received: "projects",
      proposal_accepted: "projects",
      invitation_received: "projects",
      invitation_accepted: "projects",
      invitation_declined: "projects",
      message_received: "messages",
      site_visit_proposed: "site_visits",
      site_visit_confirmed: "site_visits",
      site_visit_rescheduled: "site_visits",
      site_visit_cancelled: "site_visits",
      final_quote_submitted: "commercial",
      final_quote_accepted: "commercial",
      commission_due: "commercial",
      commission_paid: "commercial",
      deal_completed: "commercial",
      review_received: "commercial",
      company_verification_approved: "account",
      company_verification_rejected: "account",
    };

    expect([...ACTIVE_NOTIFICATION_TYPES].sort()).toEqual(Object.keys(expectedCategories).sort());
    expect(Object.keys(NOTIFICATION_DELIVERY_POLICY).sort()).toEqual([...NOTIFICATION_TYPES].sort());
    for (const [type, category] of Object.entries(expectedCategories)) {
      expect(getNotificationDeliveryPolicy(type)).toEqual({
        active: true,
        inApp: true,
        pushEligible: true,
        category,
        defaultPushEnabled: true,
      });
    }
    expect(getNotificationDeliveryPolicy("deal_created")).toEqual({
      active: false,
      inApp: false,
      pushEligible: false,
      category: null,
      defaultPushEnabled: false,
    });
  });

  test("fails closed for an unknown notification type", () => {
    expect(getNotificationDeliveryPolicy("future_unknown_event")).toEqual({
      active: false,
      inApp: false,
      pushEligible: false,
      category: null,
      defaultPushEnabled: false,
    });
    expect(resolveNotificationDelivery("future_unknown_event", {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
    }).pushEnabledForUser).toBe(false);
  });

  test("resolves global and category push gates without changing in-app delivery", () => {
    const disabled = resolveNotificationDelivery("message_received");
    expect(disabled).toMatchObject({
      inApp: true,
      pushEligible: true,
      category: "messages",
      pushEnabledForUser: false,
    });

    const enabled = resolveNotificationDelivery("message_received", {
      pushEnabled: true,
      pushCategories: { ...DEFAULT_NOTIFICATION_PREFERENCES.pushCategories },
    });
    expect(enabled).toMatchObject({ inApp: true, pushEnabledForUser: true });

    const categoryDisabled = resolveNotificationDelivery("message_received", {
      pushEnabled: true,
      pushCategories: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.pushCategories,
        messages: false,
      },
    });
    expect(categoryDisabled).toMatchObject({ inApp: true, pushEnabledForUser: false });
  });
});

describe("notification preferences API", () => {
  test("returns safe defaults without creating a document", async () => {
    const t = makeBackend();
    const userId = await addUser(t, "client");
    await expect(asUser(t, userId).query(
      api.notifications.preferences.getMyNotificationPreferences,
      {},
    )).resolves.toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      updatedAt: null,
    });
    await expect(t.run((ctx) => ctx.db.query("notificationPreferences").collect()))
      .resolves.toEqual([]);
  });

  test("supports every account role and stores only that user's preferences", async () => {
    const t = makeBackend();
    const ids = await Promise.all(
      (["client", "company", "admin", "seo_team"] as const).map((role) => addUser(t, role)),
    );
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);

    for (const [index, userId] of ids.entries()) {
      const viewer = asUser(t, userId);
      await expect(viewer.mutation(
        api.notifications.preferences.updateMyNotificationPreferences,
        { pushEnabled: index % 2 === 0 },
      )).resolves.toMatchObject({
        pushEnabled: index % 2 === 0,
        pushCategories: DEFAULT_NOTIFICATION_PREFERENCES.pushCategories,
        updatedAt: 1_800_000_000_000,
      });
    }

    const documents = await t.run((ctx) => ctx.db.query("notificationPreferences").collect());
    expect(documents).toHaveLength(4);
    expect(new Set(documents.map((item) => item.userId))).toEqual(new Set(ids));
  });

  test("partially updates categories while preserving existing values", async () => {
    const t = makeBackend();
    const userId = await addUser(t, "company");
    const viewer = asUser(t, userId);

    await viewer.mutation(api.notifications.preferences.updateMyNotificationPreferences, {
      pushEnabled: true,
      pushCategories: { messages: false, commercial: false },
    });
    const updated = await viewer.mutation(
      api.notifications.preferences.updateMyNotificationPreferences,
      { pushCategories: { messages: true } },
    );

    expect(updated).toMatchObject({
      pushEnabled: true,
      pushCategories: {
        projects: true,
        messages: true,
        site_visits: true,
        commercial: false,
        account: true,
      },
    });
  });

  test("denies unauthenticated and anonymous users", async () => {
    const t = makeBackend();
    await expect(t.query(
      api.notifications.preferences.getMyNotificationPreferences,
      {},
    )).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(t.mutation(
      api.notifications.preferences.updateMyNotificationPreferences,
      { pushEnabled: true },
    )).rejects.toThrow("NOT_AUTHENTICATED");

    const anonymousId = await addUser(t, "client", true);
    await expect(asUser(t, anonymousId).query(
      api.notifications.preferences.getMyNotificationPreferences,
      {},
    )).rejects.toThrow("NOTIFICATION_PREFERENCES_FORBIDDEN");
  });

  test("isolates users and exposes no cross-user update argument", async () => {
    const t = makeBackend();
    const firstId = await addUser(t, "client");
    const secondId = await addUser(t, "client");
    await asUser(t, firstId).mutation(
      api.notifications.preferences.updateMyNotificationPreferences,
      { pushEnabled: true, pushCategories: { projects: false } },
    );

    await expect(asUser(t, secondId).query(
      api.notifications.preferences.getMyNotificationPreferences,
      {},
    )).resolves.toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: null });
    await expect(asUser(t, firstId).mutation(
      api.notifications.preferences.updateMyNotificationPreferences,
      { userId: secondId, pushEnabled: false } as never,
    )).rejects.toThrow();
  });

  test("rejects unknown categories and empty updates", async () => {
    const t = makeBackend();
    const userId = await addUser(t, "client");
    const viewer = asUser(t, userId);
    await expect(viewer.mutation(
      api.notifications.preferences.updateMyNotificationPreferences,
      { pushCategories: { email: true } } as never,
    )).rejects.toThrow();
    await expect(viewer.mutation(
      api.notifications.preferences.updateMyNotificationPreferences,
      {},
    )).rejects.toThrow("NOTIFICATION_PREFERENCES_UPDATE_REQUIRED");
  });
});
