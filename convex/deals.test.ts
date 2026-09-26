/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { CommissionTier } from "./marketplaceSettings/constants";
import * as companyCommissionModule from "./deals/company";
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
      email: `${crypto.randomUUID()}@deal.test`,
      firstName: "Deal",
      lastName: accountType,
      accountType,
      onboardingStatus: "completed",
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function setupAcceptedSource(
  price = 395_000,
  commissionTiers: CommissionTier[] = APPROVED_TIERS,
) {
  const t = convexTest(schema, modules);
  const clientUserId = await seedUser(t, "client");
  const otherClientUserId = await seedUser(t, "client");
  const companyUserId = await seedUser(t, "company");
  const inactiveCompanyUserId = await seedUser(t, "company");
  const otherCompanyUserId = await seedUser(t, "company");
  const adminUserId = await seedUser(t, "admin");
  const seoUserId = await seedUser(t, "seo_team");
  await t.run((ctx) =>
    ctx.db.insert("marketplaceSettings", {
      key: "global",
      commissionTiers,
      commissionConfigVersion: 1,
      updatedAt: 1,
      updatedByUserId: adminUserId,
    }),
  );
  const companyId = await t.run((ctx) =>
    ctx.db.insert("companies", {
      name: "Atlas Build",
      onboardingStatus: "completed",
      verificationStatus: "verified",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const otherCompanyId = await t.run((ctx) =>
    ctx.db.insert("companies", {
      name: "Other Build",
      onboardingStatus: "completed",
      verificationStatus: "verified",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("companyMembers", {
      companyId,
      userId: companyUserId,
      role: "owner",
      status: "active",
      createdAt: 1,
    });
    await ctx.db.insert("companyMembers", {
      companyId,
      userId: inactiveCompanyUserId,
      role: "staff",
      status: "inactive",
      createdAt: 1,
    });
    await ctx.db.insert("companyMembers", {
      companyId: otherCompanyId,
      userId: otherCompanyUserId,
      role: "owner",
      status: "active",
      createdAt: 1,
    });
  });
  const projectId = await t.run((ctx) =>
    ctx.db.insert("projects", {
      clientId: clientUserId,
      countryCode: "MA",
      surfaceUnknown: false,
      budgetUnknown: false,
      visibility: "marketplace",
      status: "published",
      lastCompletedStep: 6,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const initialQuoteId = await t.run((ctx) =>
    ctx.db.insert("projectQuotes", {
      projectId,
      companyId,
      submittedByUserId: companyUserId,
      message: "Complete project delivery.",
      estimatedPrice: price,
      currency: "MAD",
      estimatedDuration: 90,
      availableStartDate: "2099-01-01",
      scope: "Complete construction scope.",
      quoteType: "initial",
      status: "discussion_open",
      createdAt: 2,
      updatedAt: 2,
      submittedAt: 2,
    }),
  );
  const conversationId = await t.run((ctx) =>
    ctx.db.insert("conversations", {
      projectId,
      quoteId: initialQuoteId,
      clientId: clientUserId,
      companyId,
      status: "active",
      createdBy: clientUserId,
      createdAt: 3,
      updatedAt: 3,
    }),
  );
  const finalQuoteId = await t.run((ctx) =>
    ctx.db.insert("finalQuotes", {
      projectId,
      clientId: clientUserId,
      companyId,
      initialQuoteId,
      conversationId,
      status: "accepted",
      requestedAt: 4,
      requestedByUserId: clientUserId,
      requestTrigger: "client_request",
      acceptedAt: 6,
      acceptedByUserId: clientUserId,
      createdAt: 4,
      updatedAt: 6,
    }),
  );
  const acceptedRevisionId = await t.run((ctx) =>
    ctx.db.insert("finalQuoteRevisions", {
      finalQuoteId,
      revisionNumber: 2,
      price,
      currency: "MAD",
      duration: 75,
      plannedStartDate: "2099-02-01",
      validUntil: "2099-12-31",
      scope: "Accepted complete construction scope.",
      inclusions: "Labour, materials, and supervision.",
      exclusions: "Owner-supplied appliances.",
      paymentTerms: "Twenty percent on signature and balance by progress.",
      submittedByUserId: companyUserId,
      submittedAt: 5,
      createdAt: 5,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(finalQuoteId, {
      currentRevisionId: acceptedRevisionId,
      acceptedRevisionId,
    });
    await ctx.db.patch(projectId, {
      status: "company_selected",
      selectedCompanyId: companyId,
      selectedFinalQuoteId: finalQuoteId,
      selectedAt: 6,
      updatedAt: 6,
    });
  });

  return {
    t,
    clientUserId,
    otherClientUserId,
    companyUserId,
    inactiveCompanyUserId,
    otherCompanyUserId,
    adminUserId,
    seoUserId,
    companyId,
    otherCompanyId,
    projectId,
    initialQuoteId,
    conversationId,
    finalQuoteId,
    acceptedRevisionId,
  };
}

async function createDeal(t: Backend, finalQuoteId: Id<"finalQuotes">) {
  return await t.mutation(internal.deals.index.createFromAcceptedFinalQuote, {
    finalQuoteId,
  });
}

describe("Deal creation and immutable commercial truth", () => {
  test("accepted current Final Quote creates one active Deal with exact snapshots", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    expect(created.duplicate).toBe(false);

    const state = await source.t.run(async (ctx) => ({
      deal: await ctx.db.get(created.dealId),
      history: await ctx.db
        .query("dealStatusHistory")
        .withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId))
        .take(10),
      activity: await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId))
        .take(10),
    }));

    expect(state.deal).toMatchObject({
      projectId: source.projectId,
      clientUserId: source.clientUserId,
      companyId: source.companyId,
      createdByUserId: source.clientUserId,
      acceptedFinalQuoteId: source.finalQuoteId,
      acceptedFinalQuoteRevisionId: source.acceptedRevisionId,
      conversationId: source.conversationId,
      initialQuoteId: source.initialQuoteId,
      agreedAmountMad: 395_000,
      commissionRateBps: 500,
      commissionAmountMad: 19_750,
      commissionTierMinAmountMad: 300_001,
      commissionTierMaxAmountMad: 500_000,
      commissionConfigVersion: 1,
      commissionDebtorCompanyId: source.companyId,
      commissionBeneficiary: "batiplus",
      commissionStatus: "due",
      currency: "MAD",
      status: "active",
    });
    expect(state.history).toEqual([
      expect.objectContaining({
        dealId: created.dealId,
        toStatus: "active",
        actorUserId: source.clientUserId,
      }),
    ]);
    expect(state.history[0]).not.toHaveProperty("fromStatus");
    expect(state.activity).toEqual([
      expect.objectContaining({
        eventType: "deal_created",
        dealId: created.dealId,
        actorUserId: source.clientUserId,
        newStatus: "active",
        metadata: {
          agreedAmountMad: 395_000,
          commissionRateBps: 500,
          commissionAmountMad: 19_750,
          commissionTierMinAmountMad: 300_001,
          commissionTierMaxAmountMad: 500_000,
          commissionConfigVersion: 1,
          currency: "MAD",
        },
      }),
      expect.objectContaining({
        eventType: "commission_due",
        dealId: created.dealId,
        companyId: source.companyId,
        actorUserId: source.clientUserId,
        newStatus: "due",
        metadata: expect.objectContaining({
          debtor: "company",
          beneficiary: "batiplus",
          commissionRateBps: 500,
          commissionAmountMad: 19_750,
          commissionConfigVersion: 1,
        }),
      }),
    ]);
  });

  test("commission rounds half-up to the nearest centime", async () => {
    const source = await setupAcceptedSource(123_456.78);
    const created = await createDeal(source.t, source.finalQuoteId);
    const deal = await source.t.run((ctx) => ctx.db.get(created.dealId));
    expect(deal).toMatchObject({
      agreedAmountMad: 123_456.78,
      commissionRateBps: 300,
      commissionAmountMad: 3_703.7,
      commissionTierMinAmountMad: 0,
      commissionTierMaxAmountMad: 300_000,
    });
  });

  test("a newly created Deal uses the currently configured commission rate", async () => {
    const source = await setupAcceptedSource(395_000, [
      { minAmountMad: 0, maxAmountMad: null, commissionRateBps: 800 },
    ]);
    const created = await createDeal(source.t, source.finalQuoteId);
    const deal = await source.t.run((ctx) => ctx.db.get(created.dealId));
    expect(deal).toMatchObject({
      agreedAmountMad: 395_000,
      commissionRateBps: 800,
      commissionAmountMad: 31_600,
      commissionTierMinAmountMad: 0,
      commissionTierMaxAmountMad: null,
    });
  });

  test("an existing Deal keeps its snapshots after the admin changes the tier schedule", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    await asUser(source.t, source.adminUserId).mutation(
      api.marketplaceSettings.index.updateCommissionTiers,
      {
        commissionTiers: [
          { minAmountMad: 0, maxAmountMad: null, commissionRateBps: 700 },
        ],
      },
    );
    const deal = await source.t.run((ctx) => ctx.db.get(created.dealId));
    expect(deal).toMatchObject({
      agreedAmountMad: 395_000,
      commissionRateBps: 500,
      commissionAmountMad: 19_750,
      commissionTierMinAmountMad: 300_001,
      commissionTierMaxAmountMad: 500_000,
      commissionConfigVersion: 1,
    });
  });

  test("Deal creation fails safely when commission is not configured", async () => {
    const source = await setupAcceptedSource();
    await source.t.run(async (ctx) => {
      const settings = await ctx.db
        .query("marketplaceSettings")
        .withIndex("by_key", (q) => q.eq("key", "global"))
        .unique();
      if (settings) await ctx.db.delete(settings._id);
    });
    await expect(createDeal(source.t, source.finalQuoteId)).rejects.toThrow(
      "COMMISSION_CONFIGURATION_REQUIRED",
    );
  });

  test("retry returns the same Deal and emits history and activity once", async () => {
    const source = await setupAcceptedSource();
    const first = await createDeal(source.t, source.finalQuoteId);
    const second = await createDeal(source.t, source.finalQuoteId);
    expect(second).toEqual({ dealId: first.dealId, duplicate: true });
    const counts = await source.t.run(async (ctx) => ({
      deals: await ctx.db
        .query("deals")
        .withIndex("by_projectId", (q) => q.eq("projectId", source.projectId))
        .take(2),
      history: await ctx.db
        .query("dealStatusHistory")
        .withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", first.dealId))
        .take(2),
      activity: await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", first.dealId))
        .take(3),
    }));
    expect(counts.deals).toHaveLength(1);
    expect(counts.history).toHaveLength(1);
    expect(counts.activity).toHaveLength(2);
  });

  test("Deal snapshots do not follow later Final Quote changes", async () => {
    const source = await setupAcceptedSource();
    await createDeal(source.t, source.finalQuoteId);
    await source.t.run((ctx) =>
      ctx.db.patch(source.acceptedRevisionId, { price: 1 }),
    );
    const deal = await asUser(source.t, source.clientUserId).query(
      api.deals.index.getByProject,
      { projectId: source.projectId },
    );
    expect(deal).toMatchObject({
      agreedAmountMad: 395_000,
      commissionRateBps: 500,
      commissionAmountMad: 19_750,
      commissionTierMinAmountMad: 300_001,
      commissionTierMaxAmountMad: 500_000,
      commissionConfigVersion: 1,
    });
  });

  test("calculated and relationship fields cannot be forged as creation input", async () => {
    const source = await setupAcceptedSource();
    const forged = {
      finalQuoteId: source.finalQuoteId,
      projectId: source.projectId,
      companyId: source.otherCompanyId,
      agreedAmountMad: 1,
      commissionRateBps: 0,
      commissionAmountMad: 0,
    } as unknown as { finalQuoteId: Id<"finalQuotes"> };
    await expect(
      source.t.mutation(internal.deals.index.createFromAcceptedFinalQuote, forged),
    ).rejects.toThrow();
    const rows = await source.t.run((ctx) =>
      ctx.db
        .query("deals")
        .withIndex("by_projectId", (q) => q.eq("projectId", source.projectId))
        .take(1),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("Deal source validation and uniqueness", () => {
  test("a Final Quote that is not accepted is rejected", async () => {
    const source = await setupAcceptedSource();
    await source.t.run((ctx) =>
      ctx.db.patch(source.finalQuoteId, { status: "submitted" }),
    );
    await expect(createDeal(source.t, source.finalQuoteId)).rejects.toThrow(
      "DEAL_REQUIRES_ACCEPTED_CURRENT_FINAL_QUOTE",
    );
  });

  test("a mismatched selected project/company pair is rejected", async () => {
    const source = await setupAcceptedSource();
    await source.t.run((ctx) =>
      ctx.db.patch(source.projectId, { selectedCompanyId: source.otherCompanyId }),
    );
    await expect(createDeal(source.t, source.finalQuoteId)).rejects.toThrow(
      "DEAL_SOURCE_INTEGRITY_ERROR",
    );
  });

  test("an accepted old revision that is not current is rejected", async () => {
    const source = await setupAcceptedSource();
    const newerRevisionId = await source.t.run((ctx) =>
      ctx.db.insert("finalQuoteRevisions", {
        finalQuoteId: source.finalQuoteId,
        revisionNumber: 3,
        price: 410_000,
        currency: "MAD",
        duration: 70,
        plannedStartDate: "2099-03-01",
        validUntil: "2099-12-31",
        scope: "Newer scope.",
        inclusions: "Labour and materials.",
        exclusions: "Appliances.",
        paymentTerms: "Progress payments.",
        submittedByUserId: source.companyUserId,
        submittedAt: 7,
        createdAt: 7,
      }),
    );
    await source.t.run((ctx) =>
      ctx.db.patch(source.finalQuoteId, { currentRevisionId: newerRevisionId }),
    );
    await expect(createDeal(source.t, source.finalQuoteId)).rejects.toThrow(
      "DEAL_REQUIRES_ACCEPTED_CURRENT_FINAL_QUOTE",
    );
  });

  test("a selected project cannot acquire a second authoritative Deal", async () => {
    const source = await setupAcceptedSource();
    await createDeal(source.t, source.finalQuoteId);
    const secondFinalQuoteId = await source.t.run((ctx) =>
      ctx.db.insert("finalQuotes", {
        projectId: source.projectId,
        clientId: source.clientUserId,
        companyId: source.companyId,
        initialQuoteId: source.initialQuoteId,
        conversationId: source.conversationId,
        status: "accepted",
        requestedAt: 8,
        requestedByUserId: source.clientUserId,
        requestTrigger: "client_request",
        acceptedAt: 10,
        acceptedByUserId: source.clientUserId,
        createdAt: 8,
        updatedAt: 10,
      }),
    );
    const secondRevisionId = await source.t.run((ctx) =>
      ctx.db.insert("finalQuoteRevisions", {
        finalQuoteId: secondFinalQuoteId,
        revisionNumber: 1,
        price: 420_000,
        currency: "MAD",
        duration: 80,
        plannedStartDate: "2099-04-01",
        validUntil: "2099-12-31",
        scope: "Second accepted scope.",
        inclusions: "Labour and materials.",
        exclusions: "Appliances.",
        paymentTerms: "Progress payments.",
        submittedByUserId: source.companyUserId,
        submittedAt: 9,
        createdAt: 9,
      }),
    );
    await source.t.run(async (ctx) => {
      await ctx.db.patch(secondFinalQuoteId, {
        currentRevisionId: secondRevisionId,
        acceptedRevisionId: secondRevisionId,
      });
      await ctx.db.patch(source.projectId, {
        selectedFinalQuoteId: secondFinalQuoteId,
      });
    });
    await expect(createDeal(source.t, secondFinalQuoteId)).rejects.toThrow(
      "DEAL_ALREADY_EXISTS_FOR_PROJECT",
    );
  });
});

describe("Deal read authorization", () => {
  test("owner client, active selected-company member, and admin can read", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    for (const userId of [
      source.clientUserId,
      source.companyUserId,
      source.adminUserId,
    ]) {
      await expect(
        asUser(source.t, userId).query(api.deals.index.getByProject, {
          projectId: source.projectId,
        }),
      ).resolves.toMatchObject({ id: created.dealId, projectId: source.projectId });
    }
  });

  test("unrelated, inactive, SEO-team, and anonymous users are blocked", async () => {
    const source = await setupAcceptedSource();
    await createDeal(source.t, source.finalQuoteId);
    for (const userId of [
      source.otherClientUserId,
      source.inactiveCompanyUserId,
      source.otherCompanyUserId,
      source.seoUserId,
    ]) {
      await expect(
        asUser(source.t, userId).query(api.deals.index.getByProject, {
          projectId: source.projectId,
        }),
      ).rejects.toThrow("DEAL_NOT_FOUND");
    }
    await expect(
      source.t.query(api.deals.index.getByProject, { projectId: source.projectId }),
    ).rejects.toThrow("NOT_AUTHENTICATED");
  });
});

describe("Deal completion lifecycle", () => {
  test("owning Client completes the Deal and Project atomically while commission stays due", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    const client = asUser(source.t, source.clientUserId);
    await expect(client.query(api.deals.index.getByProject, { projectId: source.projectId }))
      .resolves.toMatchObject({ status: "active", reviewEligible: false, completedAt: null });

    const before = await source.t.run((ctx) => ctx.db.get(created.dealId));
    const result = await client.mutation(api.deals.index.completeDeal, { dealId: created.dealId });
    expect(result).toMatchObject({ dealId: created.dealId, projectId: source.projectId, status: "completed", reviewEligible: true });

    const state = await source.t.run(async (ctx) => ({
      deal: await ctx.db.get(created.dealId),
      project: await ctx.db.get(source.projectId),
      dealHistory: await ctx.db.query("dealStatusHistory").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).collect(),
      projectHistory: await ctx.db.query("projectStatusHistory").withIndex("by_projectId_and_changedAt", (q) => q.eq("projectId", source.projectId)).collect(),
      activity: await ctx.db.query("marketplaceActivity").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).collect(),
    }));
    expect(state.deal).toMatchObject({ status: "completed", completedAt: result.completedAt, completedByUserId: source.clientUserId, commissionStatus: "due" });
    expect(state.project).toMatchObject({ status: "completed", updatedAt: result.completedAt });
    expect(state.dealHistory).toHaveLength(2);
    expect(state.dealHistory[1]).toMatchObject({ fromStatus: "active", toStatus: "completed", actorUserId: source.clientUserId, createdAt: result.completedAt });
    expect(state.projectHistory).toEqual([expect.objectContaining({ oldStatus: "company_selected", newStatus: "completed", changedBy: source.clientUserId, changedAt: result.completedAt })]);
    expect(state.activity.map((item) => item.eventType)).toEqual(["deal_created", "commission_due", "deal_completed"]);
    expect(state.activity[2]).toMatchObject({ oldStatus: "active", newStatus: "completed", metadata: { projectOldStatus: "company_selected", projectNewStatus: "completed", commissionStatus: "due", reviewEligible: true } });
    expect(state.deal).toMatchObject({
      agreedAmountMad: before?.agreedAmountMad,
      commissionRateBps: before?.commissionRateBps,
      commissionAmountMad: before?.commissionAmountMad,
      commissionConfigVersion: before?.commissionConfigVersion,
    });
    await expect(client.query(api.deals.index.getByProject, { projectId: source.projectId }))
      .resolves.toMatchObject({ status: "completed", reviewEligible: true, completedAt: result.completedAt });
  });

  test("completion is independent from an already-paid commission", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    const paid = await asUser(source.t, source.adminUserId).mutation(api.admin.deals.markCommissionPaid, { dealId: created.dealId, paymentReference: "BANK-42" });
    await asUser(source.t, source.clientUserId).mutation(api.deals.index.completeDeal, { dealId: created.dealId });
    const deal = await source.t.run((ctx) => ctx.db.get(created.dealId));
    expect(deal).toMatchObject({ status: "completed", commissionStatus: "paid", commissionPaidAt: paid.paidAt, commissionPaymentReference: "BANK-42" });
    expect(await source.t.run((ctx) => ctx.db.query("commissionStatusHistory").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).collect())).toHaveLength(1);
  });

  test("repeated completion is rejected without rewriting timestamps or audit", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    const client = asUser(source.t, source.clientUserId);
    const first = await client.mutation(api.deals.index.completeDeal, { dealId: created.dealId });
    await expect(client.mutation(api.deals.index.completeDeal, { dealId: created.dealId })).rejects.toThrow("DEAL_ALREADY_COMPLETED");
    const state = await source.t.run(async (ctx) => ({
      deal: await ctx.db.get(created.dealId),
      dealHistory: await ctx.db.query("dealStatusHistory").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).collect(),
      projectHistory: await ctx.db.query("projectStatusHistory").withIndex("by_projectId_and_changedAt", (q) => q.eq("projectId", source.projectId)).collect(),
      completedActivity: await ctx.db.query("marketplaceActivity").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).filter((q) => q.eq(q.field("eventType"), "deal_completed")).collect(),
    }));
    expect(state.deal?.completedAt).toBe(first.completedAt);
    expect(state.dealHistory).toHaveLength(2);
    expect(state.projectHistory).toHaveLength(1);
    expect(state.completedActivity).toHaveLength(1);
  });

  test("other roles and anonymous callers cannot complete a Deal", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    await expect(asUser(source.t, source.otherClientUserId).mutation(api.deals.index.completeDeal, { dealId: created.dealId })).rejects.toThrow("DEAL_NOT_FOUND");
    for (const userId of [source.companyUserId, source.otherCompanyUserId, source.adminUserId, source.seoUserId]) {
      await expect(asUser(source.t, userId).mutation(api.deals.index.completeDeal, { dealId: created.dealId })).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    }
    await expect(source.t.mutation(api.deals.index.completeDeal, { dealId: created.dealId })).rejects.toThrow("NOT_AUTHENTICATED");
    expect(await source.t.run((ctx) => ctx.db.get(created.dealId))).toMatchObject({ status: "active" });
  });

  test("invalid Deal state and relationship corruption fail without partial writes", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    const client = asUser(source.t, source.clientUserId);
    await source.t.run((ctx) => ctx.db.patch(source.projectId, { selectedCompanyId: source.otherCompanyId }));
    await expect(client.mutation(api.deals.index.completeDeal, { dealId: created.dealId })).rejects.toThrow("DEAL_COMPLETION_INTEGRITY_ERROR");
    let state = await source.t.run(async (ctx) => ({ deal: await ctx.db.get(created.dealId), project: await ctx.db.get(source.projectId), histories: await ctx.db.query("dealStatusHistory").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).collect() }));
    expect(state.deal).toMatchObject({ status: "active" });
    expect(state.project).toMatchObject({ status: "company_selected" });
    expect(state.histories).toHaveLength(1);

    await source.t.run(async (ctx) => { await ctx.db.patch(source.projectId, { selectedCompanyId: source.companyId }); await ctx.db.patch(created.dealId, { status: "cancelled" }); });
    await expect(client.mutation(api.deals.index.completeDeal, { dealId: created.dealId })).rejects.toThrow("DEAL_NOT_COMPLETABLE");
    state = await source.t.run(async (ctx) => ({ deal: await ctx.db.get(created.dealId), project: await ctx.db.get(source.projectId), histories: await ctx.db.query("dealStatusHistory").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).collect() }));
    expect(state.deal).toMatchObject({ status: "cancelled" });
    expect(state.project).toMatchObject({ status: "company_selected" });
    expect(state.histories).toHaveLength(1);
  });

  test("an incomplete legacy relationship is rejected with a controlled error and rolls back", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    await source.t.run((ctx) => ctx.db.delete(source.acceptedRevisionId));
    await expect(asUser(source.t, source.clientUserId).mutation(api.deals.index.completeDeal, { dealId: created.dealId }))
      .rejects.toThrow("DEAL_COMPLETION_INTEGRITY_ERROR");
    const state = await source.t.run(async (ctx) => ({
      deal: await ctx.db.get(created.dealId),
      project: await ctx.db.get(source.projectId),
      dealHistory: await ctx.db.query("dealStatusHistory").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).collect(),
      projectHistory: await ctx.db.query("projectStatusHistory").withIndex("by_projectId_and_changedAt", (q) => q.eq("projectId", source.projectId)).collect(),
    }));
    expect(state.deal).toMatchObject({ status: "active" });
    expect(state.project).toMatchObject({ status: "company_selected" });
    expect(state.dealHistory).toHaveLength(1);
    expect(state.projectHistory).toHaveLength(0);
  });
});

describe("Admin commission payment tracking", () => {
  test("admin can mark a due commission paid exactly once with immutable history", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    const admin = asUser(source.t, source.adminUserId);
    const result = await admin.mutation(api.admin.deals.markCommissionPaid, {
      dealId: created.dealId,
      paymentReference: "  BANK-2026-0042  ",
      paymentNote: "  Confirmed by finance team.  ",
    });
    expect(result.commissionStatus).toBe("paid");
    expect(await source.t.run((ctx) => ctx.db.get(created.dealId))).toMatchObject({
      commissionStatus: "paid",
      commissionPaidByAdminUserId: source.adminUserId,
      commissionPaymentReference: "BANK-2026-0042",
      commissionPaymentNote: "Confirmed by finance team.",
    });
    const history = await source.t.run((ctx) => ctx.db.query("commissionStatusHistory").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", created.dealId)).collect());
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: "due", toStatus: "paid", actorAdminUserId: source.adminUserId });
    await expect(admin.mutation(api.admin.deals.markCommissionPaid, { dealId: created.dealId })).rejects.toThrow("COMMISSION_ALREADY_PAID");
    expect(await source.t.run((ctx) => ctx.db.query("commissionStatusHistory").collect())).toHaveLength(1);
  });

  test("non-admins cannot list or update commission obligations", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    await expect(asUser(source.t, source.companyUserId).query(api.admin.deals.listCommissionObligations, { status: "all" })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(asUser(source.t, source.clientUserId).mutation(api.admin.deals.markCommissionPaid, { dealId: created.dealId })).rejects.toThrow("ADMIN_REQUIRED");
  });

  test("admin list filters by status and searches project or company", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    await source.t.run((ctx) => ctx.db.patch(source.projectId, { title: "Riad restoration" }));
    const admin = asUser(source.t, source.adminUserId);
    const due = await admin.query(api.admin.deals.listCommissionObligations, { status: "due", search: "atlas" });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ dealId: created.dealId, projectTitle: "Riad restoration", companyName: "Atlas Build", commissionStatus: "due" });
    expect(await admin.query(api.admin.deals.listCommissionObligations, { status: "paid" })).toEqual([]);
  });
});

describe("Company commission visibility", () => {
  test("debtor Company sees only its own safe commission DTO", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    await source.t.run((ctx) => ctx.db.patch(source.projectId, { title: "Villa Anfa" }));

    const rows = await asUser(source.t, source.companyUserId).query(
      api.deals.company.listMyCommissionObligations,
      {},
    );
    expect(rows).toEqual([
      expect.objectContaining({
        dealId: created.dealId,
        projectTitle: "Villa Anfa",
        agreedAmountMad: 395_000,
        commissionRateBps: 500,
        commissionAmountMad: 19_750,
        commissionConfigVersion: 1,
        commissionStatus: "due",
        beneficiary: "batiplus",
        paidAt: null,
        snapshotComplete: true,
      }),
    ]);
    expect(rows[0]).not.toHaveProperty("paymentNote");
    expect(rows[0]).not.toHaveProperty("paymentReference");
    expect(rows[0]).not.toHaveProperty("commissionPaidByAdminUserId");
    expect(rows[0]).not.toHaveProperty("clientUserId");
    expect(rows[0]).not.toHaveProperty("projectId");
  });

  test("another Company gets no rows and cannot probe with a Company ID", async () => {
    const source = await setupAcceptedSource();
    await createDeal(source.t, source.finalQuoteId);
    await expect(
      asUser(source.t, source.otherCompanyUserId).query(
        api.deals.company.listMyCommissionObligations,
        {},
      ),
    ).resolves.toEqual([]);
  });

  test("client, admin, SEO team, inactive member, and anonymous callers are denied", async () => {
    const source = await setupAcceptedSource();
    await createDeal(source.t, source.finalQuoteId);
    for (const userId of [source.clientUserId, source.adminUserId, source.seoUserId]) {
      await expect(
        asUser(source.t, userId).query(api.deals.company.listMyCommissionObligations, {}),
      ).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    }
    await expect(
      asUser(source.t, source.inactiveCompanyUserId).query(
        api.deals.company.listMyCommissionObligations,
        {},
      ),
    ).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await expect(
      source.t.query(api.deals.company.listMyCommissionObligations, {}),
    ).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("Admin payment transition becomes visible without exposing operational details", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    const paid = await asUser(source.t, source.adminUserId).mutation(
      api.admin.deals.markCommissionPaid,
      {
        dealId: created.dealId,
        paymentReference: "BANK-PRIVATE-42",
        paymentNote: "Internal reconciliation note",
      },
    );
    const rows = await asUser(source.t, source.companyUserId).query(
      api.deals.company.listMyCommissionObligations,
      {},
    );
    expect(rows[0]).toMatchObject({ commissionStatus: "paid", paidAt: paid.paidAt });
    expect(JSON.stringify(rows[0])).not.toContain("BANK-PRIVATE-42");
    expect(JSON.stringify(rows[0])).not.toContain("Internal reconciliation note");
  });

  test("incomplete snapshots are read-only and never recalculated", async () => {
    const source = await setupAcceptedSource();
    const created = await createDeal(source.t, source.finalQuoteId);
    await source.t.run((ctx) => ctx.db.patch(created.dealId, { commissionConfigVersion: 0 }));
    const rows = await asUser(source.t, source.companyUserId).query(
      api.deals.company.listMyCommissionObligations,
      {},
    );
    expect(rows[0]).toMatchObject({
      snapshotComplete: false,
      agreedAmountMad: null,
      commissionRateBps: null,
      commissionAmountMad: null,
      commissionConfigVersion: null,
    });
  });

  test("Company commission module exposes a query only and no payment mutation", () => {
    expect(Object.keys(companyCommissionModule)).toEqual(["listMyCommissionObligations"]);
  });
});
