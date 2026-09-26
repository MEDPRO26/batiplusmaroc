/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getCurrentCommissionRateBps } from "./marketplaceSettings/index";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
type AccountType = "client" | "company" | "admin" | "seo_team";

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|session`,
    tokenIdentifier: `test|${userId}`,
  });
}

async function seedUser(t: Backend, accountType: AccountType) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@settings.test`,
      accountType,
      onboardingStatus: "completed",
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function setup() {
  const t = convexTest(schema, modules);
  return {
    t,
    adminId: await seedUser(t, "admin"),
    clientId: await seedUser(t, "client"),
    companyId: await seedUser(t, "company"),
    seoId: await seedUser(t, "seo_team"),
  };
}

describe("global marketplace commission setting", () => {
  test("admin reads the explicit unconfigured state and can configure the rate", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminId);
    await expect(admin.query(api.marketplaceSettings.index.getCommissionSetting, {}))
      .resolves.toEqual({
        configured: false,
        commissionRateBps: null,
        updatedAt: null,
        updatedByUserId: null,
      });
    await expect(
      admin.mutation(api.marketplaceSettings.index.updateCommissionRate, {
        commissionRateBps: 1_050,
      }),
    ).resolves.toEqual({ commissionRateBps: 1_050, changed: true });
    await expect(admin.query(api.marketplaceSettings.index.getCommissionSetting, {}))
      .resolves.toMatchObject({
        configured: true,
        commissionRateBps: 1_050,
        updatedByUserId: state.adminId,
      });
  });

  test("client, company, SEO team, and anonymous callers cannot read or update", async () => {
    const state = await setup();
    for (const userId of [state.clientId, state.companyId, state.seoId]) {
      await expect(
        asUser(state.t, userId).query(
          api.marketplaceSettings.index.getCommissionSetting,
          {},
        ),
      ).rejects.toThrow("ADMIN_REQUIRED");
      await expect(
        asUser(state.t, userId).mutation(
          api.marketplaceSettings.index.updateCommissionRate,
          { commissionRateBps: 1_000 },
        ),
      ).rejects.toThrow("ADMIN_REQUIRED");
    }
    await expect(
      state.t.query(api.marketplaceSettings.index.getCommissionSetting, {}),
    ).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(
      state.t.mutation(api.marketplaceSettings.index.updateCommissionRate, {
        commissionRateBps: 1_000,
      }),
    ).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test.each([-1, 3_001, 10.5, Number.NaN])(
    "rejects invalid numeric rate %s",
    async (commissionRateBps) => {
      const state = await setup();
      await expect(
        asUser(state.t, state.adminId).mutation(
          api.marketplaceSettings.index.updateCommissionRate,
          { commissionRateBps },
        ),
      ).rejects.toThrow("INVALID_COMMISSION_RATE");
    },
  );

  test("the strict argument validator rejects malformed strings", async () => {
    const state = await setup();
    const malformed = { commissionRateBps: "10" } as unknown as {
      commissionRateBps: number;
    };
    await expect(
      asUser(state.t, state.adminId).mutation(
        api.marketplaceSettings.index.updateCommissionRate,
        malformed,
      ),
    ).rejects.toThrow();
  });

  test("each real change appends immutable old/new audit history", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminId);
    await admin.mutation(api.marketplaceSettings.index.updateCommissionRate, {
      commissionRateBps: 1_000,
    });
    await admin.mutation(api.marketplaceSettings.index.updateCommissionRate, {
      commissionRateBps: 800,
    });
    await expect(
      admin.mutation(api.marketplaceSettings.index.updateCommissionRate, {
        commissionRateBps: 800,
      }),
    ).resolves.toEqual({ commissionRateBps: 800, changed: false });

    const history = await state.t.run((ctx) =>
      ctx.db
        .query("marketplaceSettingsHistory")
        .withIndex("by_settingKey_and_createdAt", (q) =>
          q.eq("settingKey", "commission_rate_bps"),
        )
        .order("asc")
        .take(10),
    );
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      oldCommissionRateBps: null,
      newCommissionRateBps: 1_000,
      actorUserId: state.adminId,
    });
    expect(history[1]).toMatchObject({
      oldCommissionRateBps: 1_000,
      newCommissionRateBps: 800,
      actorUserId: state.adminId,
    });
    expect(history[0]._id).not.toBe(history[1]._id);
  });

  test("trusted helper returns the current value and fails for missing or invalid data", async () => {
    const state = await setup();
    await expect(
      state.t.run((ctx) => getCurrentCommissionRateBps(ctx)),
    ).rejects.toThrow("COMMISSION_CONFIGURATION_REQUIRED");

    const settingId = await state.t.run((ctx) =>
      ctx.db.insert("marketplaceSettings", {
        key: "global",
        commissionRateBps: 750,
        updatedAt: 1,
        updatedByUserId: state.adminId,
      }),
    );
    await expect(
      state.t.run((ctx) => getCurrentCommissionRateBps(ctx)),
    ).resolves.toBe(750);
    await state.t.run((ctx) =>
      ctx.db.patch(settingId, { commissionRateBps: 3_001 }),
    );
    await expect(
      state.t.run((ctx) => getCurrentCommissionRateBps(ctx)),
    ).rejects.toThrow("INVALID_COMMISSION_RATE");
  });
});
