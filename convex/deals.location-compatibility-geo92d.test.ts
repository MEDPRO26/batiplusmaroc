/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
type DealPath = "marketplace" | "invitation";
type Geography = Pick<Doc<"projects">, "city" | "locationMode" | "regionCode" | "provinceCode" | "communeName" | "localityName" | "neighborhood">;
const localityName = "Douar Aït Atlas — دوار ⴰⵣⵓⵍ";
const neighborhood = "AUTHORIZED_NEIGHBORHOOD_GEO92D";
const siteAddress = "PRIVATE_SITE_ADDRESS_GEO92D_42";
const clientName = "PRIVATE_CLIENT_GEO92D";
const structured = {
  locationMode: "structured", regionCode: "05", provinceCode: "05.081",
  communeName: "Aït Tamlil", localityName, neighborhood,
} as const;
const emptyGeneral = { regionCode: null, provinceCode: null, communeName: null, legacyCity: null };
const general = { ...emptyGeneral, regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil" };
const locations = [
  { name: "rural without city", fields: structured, city: null, expected: { ...general, localityName, neighborhood } },
  { name: "structured with historical city", fields: { ...structured, city: "tangier" } as const,
    city: "tangier", expected: { ...general, localityName, neighborhood } },
  { name: "legacy city only", fields: { city: "tangier" } as const, city: "tangier",
    expected: { ...emptyGeneral, legacyCity: "tangier", localityName: null, neighborhood: null } },
] as const;

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` });
}

async function setup(path: DealPath, fields: Geography = structured) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (accountType: Doc<"users">["accountType"]) => ctx.db.insert("users", {
      accountType, firstName: clientName, email: `${accountType}@private-geo92d.test`,
      onboardingStatus: "completed", countryCode: "MA", createdAt: 1, updatedAt: 1,
    });
    const clientId = await user("client");
    const otherClientId = await user("client");
    const companyUserId = await user("company");
    const competitorUserId = await user("company");
    const adminId = await user("admin");
    const seoId = await user("seo_team");
    const companyId = await ctx.db.insert("companies", {
      name: "Atlas Build", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
    });
    const competitorId = await ctx.db.insert("companies", {
      name: "Other Build", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
    });
    const membershipId = await ctx.db.insert("companyMembers", {
      companyId, userId: companyUserId, role: "owner", status: "active", createdAt: 1,
    });
    await ctx.db.insert("companyMembers", {
      companyId: competitorId, userId: competitorUserId, role: "owner", status: "active", createdAt: 1,
    });
    const projectId = await ctx.db.insert("projects", {
      clientId, countryCode: "MA", primaryCategory: "renovation", title: "Rural renovation",
      propertyType: "house", surfaceUnknown: true, description: "Renovation with electrical work, plumbing and finishes.",
      timeline: "one_to_three_months", visibility: path === "marketplace" ? "marketplace" : "invite_only",
      status: "published", lastCompletedStep: 6, createdAt: 1, updatedAt: 1, submittedAt: 1, publishedAt: 1, ...fields,
    });
    await ctx.db.insert("marketplaceSettings", {
      key: "global", commissionTiers: [
        { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
        { minAmountMad: 300_001, maxAmountMad: 500_000, commissionRateBps: 500 },
        { minAmountMad: 500_001, maxAmountMad: null, commissionRateBps: 1_000 },
      ], commissionConfigVersion: 1, updatedAt: 1, updatedByUserId: adminId,
    });
    return { clientId, otherClientId, companyUserId, competitorUserId, adminId, seoId,
      companyId, competitorId, membershipId, projectId };
  });
  const client = asUser(t, ids.clientId);
  const company = asUser(t, ids.companyUserId);
  let invitationId: Id<"invitations"> | undefined;
  if (path === "invitation") {
    const created = await client.mutation(api.invitations.index.inviteCompanyToProject, {
      projectId: ids.projectId, companyId: ids.companyId,
    });
    invitationId = created.invitationId;
    await company.mutation(api.invitations.index.acceptInvitation, { invitationId });
  }
  const quote = await company.mutation(api.quotes.index.submitInitialQuote, {
    projectId: ids.projectId, message: "Our team will renovate with a dedicated supervisor.",
    estimatedPrice: 185_000.25, estimatedDuration: 75, availableStartDate: "2099-01-15",
    scope: "Electrical work, plumbing, finishes, supervision and cleanup.",
  });
  const opened = path === "marketplace"
    ? await client.mutation(api.quotes.index.reviewInitialQuote, { quoteId: quote.quoteId, action: "open_discussion" })
    : quote;
  const conversationId = opened.conversationId!;
  const requested = await client.mutation(api.finalQuotes.index.request, { conversationId });
  const submitted = await company.mutation(api.finalQuotes.index.submitRevision, {
    conversationId, price: 380_000.25, duration: 75, plannedStartDate: "2099-02-01", validUntil: "2099-12-31",
    scope: "Renovation, finishing, supervision and cleanup.", inclusions: "Labour and materials.",
    exclusions: "Municipal fees.", paymentTerms: "PRIVATE_PAYMENT_TERMS_GEO92D by agreed milestones.",
  });
  await client.mutation(api.finalQuotes.index.review, {
    finalQuoteId: requested.finalQuoteId, revisionId: submitted.revisionId, action: "accept",
  });
  const deal = await t.run((ctx) => ctx.db.query("deals")
    .withIndex("by_projectId", q => q.eq("projectId", ids.projectId)).unique());
  await t.run((ctx) => ctx.db.insert("siteAssessments", {
    projectId: ids.projectId, clientId: ids.clientId, companyId: ids.companyId, initialQuoteId: quote.quoteId,
    conversationId, status: "declined", active: false, siteAddress,
    invitedByUserId: ids.clientId, invitedAt: 1, createdAt: 1, updatedAt: 1,
  }));
  // Settle notifications from quote acceptance before asserting that reads write nothing.
  await t.finishAllScheduledFunctions(() => {});
  return { t, ...ids, client, company, invitationId, quoteId: quote.quoteId, conversationId,
    finalQuoteId: requested.finalQuoteId, revisionId: submitted.revisionId, dealId: deal!._id };
}
type State = Awaited<ReturnType<typeof setup>>;

async function snapshot(s: State) {
  return s.t.run(async (ctx) => ({
    project: await ctx.db.get(s.projectId), deal: await ctx.db.get(s.dealId),
    final: await ctx.db.get(s.finalQuoteId), revision: await ctx.db.get(s.revisionId),
    quote: await ctx.db.get(s.quoteId), conversation: await ctx.db.get(s.conversationId),
    invitations: await ctx.db.query("invitations").take(10), visits: await ctx.db.query("siteAssessments").take(10),
    commissionHistory: await ctx.db.query("commissionStatusHistory").take(10),
    commissionSummaries: await ctx.db.query("companyCommissionSummaries").take(10),
    notifications: await ctx.db.query("notifications").take(20),
  }));
}

function expectPrivateFieldsAbsent(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [siteAddress, clientName, "private-geo92d.test", "PRIVATE_PAYMENT_TERMS",
    '"clientUserId"', '"clientId"', '"siteAddress"', '"paymentTerms"', '"commissionPaymentReference"']) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe.each(["marketplace", "invitation"] as const)("GEO9.2D %s Company work", path => {
  test.each(locations)("$name preserves accepted quote and financial snapshots", async ({ fields, city, expected }) => {
    const s = await setup(path, fields);
    const before = await snapshot(s);
    const rows = await s.company.query(api.deals.company.listMyDeals, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ dealId: s.dealId, projectId: s.projectId, projectTitle: "Rural renovation",
      city, location: expected, status: "active", agreedAmountMad: 380_000.25,
      conversationId: s.conversationId, createdAt: before.deal!.createdAt, completedAt: null });
    expectPrivateFieldsAbsent(rows);
    expect(before.deal).toMatchObject({ acceptedFinalQuoteId: s.finalQuoteId, acceptedFinalQuoteRevisionId: s.revisionId,
      agreedAmountMad: 380_000.25, currency: "MAD", commissionRateBps: 500, commissionAmountMad: 19_000.01,
      commissionConfigVersion: 1, commissionTierMinAmountMad: 300_001, commissionTierMaxAmountMad: 500_000,
      commissionDebtorCompanyId: s.companyId, commissionBeneficiary: "batiplus", commissionStatus: "due" });
    expect(await s.company.query(api.deals.company.getMyCommissionSummary, {})).toEqual({
      totalDueMad: 19_000.01, totalPaidMad: 0, dueCount: 1,
    });
    expect(await snapshot(s)).toEqual(before);
    expect(await asUser(s.t, s.competitorUserId).query(api.deals.company.listMyDeals, {})).toEqual([]);
  });

  test("cleared structured geography never reactivates historical city", async () => {
    const s = await setup(path);
    await s.t.run(ctx => ctx.db.patch(s.projectId, {
      city: "tangier", regionCode: undefined, provinceCode: undefined, communeName: undefined,
      localityName: undefined, neighborhood: undefined,
    }));
    const before = await snapshot(s);
    expect((await s.company.query(api.deals.company.listMyDeals, {}))[0]).toMatchObject({
      city: "tangier", location: { ...emptyGeneral, localityName: null, neighborhood: null },
    });
    expect(await snapshot(s)).toEqual(before);
  });

  test.each(["missing conversation", "duplicate conversations", "source locked", "current owner changed", "conversation owner mismatch", "source Company mismatch"])(
    "%s keeps only general geography despite the Deal", async failure => {
      const s = await setup(path);
      await s.t.run(async ctx => {
        if (failure === "missing conversation") await ctx.db.delete(s.conversationId);
        if (failure === "duplicate conversations") {
          const original = (await ctx.db.get(s.conversationId))!;
          await ctx.db.insert("conversations", { projectId: s.projectId, companyId: s.companyId,
            clientId: s.clientId, quoteId: original.quoteId, invitationId: original.invitationId,
            status: "active", createdBy: s.clientId, createdAt: 1, updatedAt: 1 });
        }
        if (failure === "source locked") {
          await ctx.db.patch(s.quoteId, { status: "submitted" });
          if (s.invitationId) await ctx.db.patch(s.invitationId, { status: "pending" });
        }
        if (failure === "current owner changed") await ctx.db.patch(s.projectId, { clientId: s.otherClientId });
        if (failure === "conversation owner mismatch") await ctx.db.patch(s.conversationId, { clientId: s.otherClientId });
        if (failure === "source Company mismatch") {
          if (s.invitationId) await ctx.db.patch(s.invitationId, { companyId: s.competitorId });
          else await ctx.db.patch(s.quoteId, { companyId: s.competitorId });
        }
      });
      const before = await snapshot(s);
      const rows = await s.company.query(api.deals.company.listMyDeals, {});
      expect(rows[0]).toMatchObject({ dealId: s.dealId, location: general });
      expect(rows[0].location).not.toHaveProperty("localityName");
      expect(rows[0].location).not.toHaveProperty("neighborhood");
      expect(JSON.stringify(rows)).not.toContain(localityName);
      expect(JSON.stringify(rows)).not.toContain(neighborhood);
      expectPrivateFieldsAbsent(rows);
      expect(await snapshot(s)).toEqual(before);
    },
  );

  test("commission payment stays explicit and its snapshots survive location reads", async () => {
    const s = await setup(path);
    await asUser(s.t, s.adminId).mutation(api.admin.deals.markCommissionPaid, {
      dealId: s.dealId, paymentReference: "PRIVATE_PAYMENT_REFERENCE_GEO92D", paymentNote: "Private receipt note.",
    });
    await s.t.finishAllScheduledFunctions(() => {});
    const before = await snapshot(s);
    expectPrivateFieldsAbsent(await s.company.query(api.deals.company.listMyDeals, {}));
    expect((await s.company.query(api.deals.company.listMyCommissionObligations, {}))[0]).toMatchObject({
      agreedAmountMad: 380_000.25, commissionAmountMad: 19_000.01, commissionRateBps: 500,
      commissionConfigVersion: 1, commissionStatus: "paid", snapshotComplete: true,
    });
    expect(await snapshot(s)).toEqual(before);
  });
});

describe("GEO9.2D Company work access and history", () => {
  test("unauthorized roles, inactive membership and incomplete onboarding are denied", async () => {
    const s = await setup("marketplace");
    const before = await snapshot(s);
    await expect(s.t.query(api.deals.company.listMyDeals, {})).rejects.toThrow("NOT_AUTHENTICATED");
    for (const userId of [s.clientId, s.otherClientId, s.adminId, s.seoId]) {
      await expect(asUser(s.t, userId).query(api.deals.company.listMyDeals, {})).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    }
    expect(await snapshot(s)).toEqual(before);
    await s.t.run(ctx => ctx.db.patch(s.membershipId, { status: "inactive" }));
    await expect(s.company.query(api.deals.company.listMyDeals, {})).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await s.t.run(async ctx => {
      await ctx.db.patch(s.membershipId, { status: "active" });
      await ctx.db.patch(s.companyUserId, { onboardingStatus: "pending" });
    });
    await expect(s.company.query(api.deals.company.listMyDeals, {})).rejects.toThrow("COMPANY_ONBOARDING_REQUIRED");
  });

  test.each(["completed", "cancelled"] as const)("%s history retains existing read permissions", async status => {
    const s = await setup("marketplace");
    await s.t.run(async ctx => {
      await ctx.db.patch(s.dealId, { status, completedAt: status === "completed" ? 100 : undefined });
      await ctx.db.patch(s.conversationId, { status: "closed" });
    });
    const before = await snapshot(s);
    expect((await s.company.query(api.deals.company.listMyDeals, {}))[0]).toMatchObject({
      status, location: { ...general, localityName, neighborhood }, completedAt: status === "completed" ? 100 : null,
    });
    expect(await snapshot(s)).toEqual(before);
  });

  test("missing historical Project yields an empty general location without removing the Deal", async () => {
    const s = await setup("marketplace");
    await s.t.run(ctx => ctx.db.delete(s.projectId));
    const before = await snapshot(s);
    expect((await s.company.query(api.deals.company.listMyDeals, {}))[0]).toMatchObject({
      dealId: s.dealId, projectTitle: "—", city: null, location: emptyGeneral, agreedAmountMad: 380_000.25,
    });
    expect(await snapshot(s)).toEqual(before);
  });
});
