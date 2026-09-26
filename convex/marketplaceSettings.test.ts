/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { CommissionTier } from "./marketplaceSettings/constants";
import { resolveCommissionForDealAmount } from "./marketplaceSettings/index";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
type AccountType = "client" | "company" | "admin" | "seo_team";

const APPROVED_TIERS: CommissionTier[] = [
  { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
  { minAmountMad: 300_001, maxAmountMad: 500_000, commissionRateBps: 500 },
  { minAmountMad: 500_001, maxAmountMad: null, commissionRateBps: 1_000 },
];

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

async function saveApprovedTiers(state: Awaited<ReturnType<typeof setup>>) {
  return await asUser(state.t, state.adminId).mutation(
    api.marketplaceSettings.index.updateCommissionTiers,
    { commissionTiers: APPROVED_TIERS },
  );
}

describe("admin-managed marketplace commission tiers", () => {
  test("admin reads the explicit unconfigured state and saves a valid tier schedule", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminId);
    await expect(admin.query(api.marketplaceSettings.index.getCommissionSetting, {}))
      .resolves.toEqual({
        configured: false,
        commissionTiers: [],
        commissionConfigVersion: null,
        updatedAt: null,
        updatedByUserId: null,
      });
    await expect(saveApprovedTiers(state)).resolves.toEqual({
      commissionTiers: APPROVED_TIERS,
      commissionConfigVersion: 1,
      changed: true,
    });
    await expect(admin.query(api.marketplaceSettings.index.getCommissionSetting, {}))
      .resolves.toMatchObject({
        configured: true,
        commissionTiers: APPROVED_TIERS,
        commissionConfigVersion: 1,
        updatedByUserId: state.adminId,
      });
  });

  test("client, company, SEO team, and anonymous callers cannot read or update tiers", async () => {
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
          api.marketplaceSettings.index.updateCommissionTiers,
          { commissionTiers: APPROVED_TIERS },
        ),
      ).rejects.toThrow("ADMIN_REQUIRED");
    }
    await expect(
      state.t.query(api.marketplaceSettings.index.getCommissionSetting, {}),
    ).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(
      state.t.mutation(api.marketplaceSettings.index.updateCommissionTiers, {
        commissionTiers: APPROVED_TIERS,
      }),
    ).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test.each([
    ["empty", [], "COMMISSION_TIERS_REQUIRED"],
    ["overlap", [
      { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
      { minAmountMad: 250_000, maxAmountMad: null, commissionRateBps: 500 },
    ], "COMMISSION_TIERS_OVERLAP"],
    ["gap", [
      { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
      { minAmountMad: 350_000, maxAmountMad: null, commissionRateBps: 500 },
    ], "COMMISSION_TIERS_GAP"],
    ["unordered", [
      { minAmountMad: 0, maxAmountMad: 500_000, commissionRateBps: 300 },
      { minAmountMad: 0, maxAmountMad: null, commissionRateBps: 500 },
    ], "COMMISSION_TIERS_UNORDERED"],
    ["duplicate range", [
      { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
      { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 500 },
      { minAmountMad: 300_001, maxAmountMad: null, commissionRateBps: 700 },
    ], "COMMISSION_TIERS_UNORDERED"],
    ["two open tiers", [
      { minAmountMad: 0, maxAmountMad: null, commissionRateBps: 300 },
      { minAmountMad: 300_001, maxAmountMad: null, commissionRateBps: 500 },
    ], "COMMISSION_MULTIPLE_OPEN_TIERS"],
    ["bounded final tier", [
      { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
    ], "COMMISSION_FINAL_TIER_OPEN_REQUIRED"],
    ["negative boundary", [
      { minAmountMad: -1, maxAmountMad: null, commissionRateBps: 300 },
    ], "INVALID_COMMISSION_TIER_BOUNDARY"],
    ["nonzero first boundary", [
      { minAmountMad: 1, maxAmountMad: null, commissionRateBps: 300 },
    ], "COMMISSION_FIRST_TIER_ZERO_REQUIRED"],
    ["inverted boundary", [
      { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
      { minAmountMad: 300_001, maxAmountMad: 300_000, commissionRateBps: 500 },
      { minAmountMad: 300_001, maxAmountMad: null, commissionRateBps: 700 },
    ], "INVALID_COMMISSION_TIER_BOUNDARY"],
    ["decimal boundary", [
      { minAmountMad: 0, maxAmountMad: 300_000.5, commissionRateBps: 300 },
      { minAmountMad: 300_001, maxAmountMad: null, commissionRateBps: 500 },
    ], "INVALID_COMMISSION_TIER_BOUNDARY"],
    ["negative rate", [
      { minAmountMad: 0, maxAmountMad: null, commissionRateBps: -1 },
    ], "INVALID_COMMISSION_RATE"],
    ["decimal bps", [
      { minAmountMad: 0, maxAmountMad: null, commissionRateBps: 10.5 },
    ], "INVALID_COMMISSION_RATE"],
    ["NaN rate", [
      { minAmountMad: 0, maxAmountMad: null, commissionRateBps: Number.NaN },
    ], "INVALID_COMMISSION_RATE"],
    ["excessive rate", [
      { minAmountMad: 0, maxAmountMad: null, commissionRateBps: 3_001 },
    ], "INVALID_COMMISSION_RATE"],
  ] as const)("rejects %s configuration", async (_name, commissionTiers, code) => {
    const state = await setup();
    await expect(
      asUser(state.t, state.adminId).mutation(
        api.marketplaceSettings.index.updateCommissionTiers,
        { commissionTiers: commissionTiers as unknown as CommissionTier[] },
      ),
    ).rejects.toThrow(code);
  });

  test("strict argument validation rejects malformed tier values", async () => {
    const state = await setup();
    const malformed = {
      commissionTiers: [{
        minAmountMad: "0",
        maxAmountMad: null,
        commissionRateBps: 300,
      }],
    } as unknown as { commissionTiers: CommissionTier[] };
    await expect(
      asUser(state.t, state.adminId).mutation(
        api.marketplaceSettings.index.updateCommissionTiers,
        malformed,
      ),
    ).rejects.toThrow();

    const malformedRate = {
      commissionTiers: [{
        minAmountMad: 0,
        maxAmountMad: null,
        commissionRateBps: "3",
      }],
    } as unknown as { commissionTiers: CommissionTier[] };
    await expect(
      asUser(state.t, state.adminId).mutation(
        api.marketplaceSettings.index.updateCommissionTiers,
        malformedRate,
      ),
    ).rejects.toThrow();
  });

  test("real changes increment the version and append complete immutable schedules", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminId);
    await saveApprovedTiers(state);
    const changed = [
      { minAmountMad: 0, maxAmountMad: 250_000, commissionRateBps: 300 },
      { minAmountMad: 250_001, maxAmountMad: 600_000, commissionRateBps: 600 },
      { minAmountMad: 600_001, maxAmountMad: null, commissionRateBps: 900 },
    ];
    await expect(
      admin.mutation(api.marketplaceSettings.index.updateCommissionTiers, {
        commissionTiers: changed,
      }),
    ).resolves.toMatchObject({ commissionConfigVersion: 2, changed: true });
    await expect(
      admin.mutation(api.marketplaceSettings.index.updateCommissionTiers, {
        commissionTiers: changed,
      }),
    ).resolves.toMatchObject({ commissionConfigVersion: 2, changed: false });

    const history = await state.t.run((ctx) =>
      ctx.db
        .query("marketplaceSettingsHistory")
        .withIndex("by_settingKey_and_createdAt", (q) =>
          q.eq("settingKey", "commission_tiers"),
        )
        .order("asc")
        .take(10),
    );
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      oldCommissionTiers: [],
      newCommissionTiers: APPROVED_TIERS,
      oldCommissionConfigVersion: null,
      newCommissionConfigVersion: 1,
      actorUserId: state.adminId,
    });
    expect(history[1]).toMatchObject({
      oldCommissionTiers: APPROVED_TIERS,
      newCommissionTiers: changed,
      oldCommissionConfigVersion: 1,
      newCommissionConfigVersion: 2,
      actorUserId: state.adminId,
    });
  });
});

describe("flat-bracket commission resolution", () => {
  test.each([
    [299_999, APPROVED_TIERS[0], 300, 8_999.97],
    [300_000, APPROVED_TIERS[0], 300, 9_000],
    [300_001, APPROVED_TIERS[1], 500, 15_000.05],
    [499_999, APPROVED_TIERS[1], 500, 24_999.95],
    [500_000, APPROVED_TIERS[1], 500, 25_000],
    [500_001, APPROVED_TIERS[2], 1_000, 50_000.1],
    [1_000_000, APPROVED_TIERS[2], 1_000, 100_000],
    [2_000_000, APPROVED_TIERS[2], 1_000, 200_000],
  ])("resolves exact boundary %i", async (amount, tier, rate, commission) => {
    const state = await setup();
    await saveApprovedTiers(state);
    const result = await state.t.run((ctx) =>
      resolveCommissionForDealAmount(ctx, amount),
    );
    expect(result).toEqual({
      agreedAmountMad: amount,
      commissionRateBps: rate,
      commissionAmountMad: commission,
      matchedTier: {
        minAmountMad: tier.minAmountMad,
        maxAmountMad: tier.maxAmountMad,
      },
      configurationVersion: 1,
    });
  });

  test.each([
    [300_000, 300, 9_000],
    [450_000, 500, 22_500],
    [500_000, 500, 25_000],
    [800_000, 1_000, 80_000],
    [1_000_000, 1_000, 100_000],
  ])("applies one rate to all of %i MAD", async (amount, rate, commission) => {
    const state = await setup();
    await saveApprovedTiers(state);
    await expect(
      state.t.run((ctx) => resolveCommissionForDealAmount(ctx, amount)),
    ).resolves.toMatchObject({
      agreedAmountMad: amount,
      commissionRateBps: rate,
      commissionAmountMad: commission,
    });
  });

  test("missing or corrupt configuration fails safely without a fallback", async () => {
    const state = await setup();
    await expect(
      state.t.run((ctx) => resolveCommissionForDealAmount(ctx, 450_000)),
    ).rejects.toThrow("COMMISSION_CONFIGURATION_REQUIRED");
    await state.t.run((ctx) =>
      ctx.db.insert("marketplaceSettings", {
        key: "global",
        commissionTiers: [
          { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
          { minAmountMad: 250_000, maxAmountMad: null, commissionRateBps: 500 },
        ],
        commissionConfigVersion: 1,
        updatedAt: 1,
        updatedByUserId: state.adminId,
      }),
    );
    await expect(
      state.t.run((ctx) => resolveCommissionForDealAmount(ctx, 450_000)),
    ).rejects.toThrow("COMMISSION_CONFIGURATION_INVALID");
  });
});
