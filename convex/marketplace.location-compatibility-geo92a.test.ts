/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
const localityName = "PRIVATE_DOUAR_GEO92A_ⵜⴰⵎⵍⵉⵍ";
const neighborhood = "PRIVATE_NEIGHBORHOOD_GEO92A";
const siteAddress = "PRIVATE_STREET_GEO92A_42";
const structured = {
  locationMode: "structured", regionCode: "05", provinceCode: "05.081",
  communeName: "Aït Tamlil — آيت تامليل", localityName, neighborhood,
} as const;
const generalStructured = {
  regionCode: "05", provinceCode: "05.081", communeName: structured.communeName, legacyCity: null,
};
const locations = [
  { name: "structured without city", fields: structured, city: null, general: generalStructured },
  { name: "legacy city only", fields: { city: "rabat", neighborhood } as const, city: "rabat",
    general: { regionCode: null, provinceCode: null, communeName: null, legacyCity: "rabat" } },
  { name: "structured with retained legacy city", fields: { ...structured, city: "rabat" } as const,
    city: "rabat", general: generalStructured },
] as const;
type LocationCase = (typeof locations)[number];

const initialInput = {
  message: "Our team can complete the agreed renovation with a dedicated supervisor.",
  estimatedPrice: 185_000.25, estimatedDuration: 75, availableStartDate: "2099-01-15",
  scope: "Plumbing, electrical work, finishes, supervision, and final site cleanup.",
} satisfies Omit<FunctionArgs<typeof api.quotes.index.submitInitialQuote>, "projectId">;
const finalInput = {
  price: 380_000.25, duration: 75, plannedStartDate: "2099-02-01", validUntil: "2099-12-31",
  scope: "Complete renovation, finishing, supervision, and final site cleanup.",
  inclusions: "Labour, materials, supervision, and cleanup.", exclusions: "Municipal fees.",
  paymentTerms: "Monthly milestones with the balance at handover.",
} satisfies Omit<FunctionArgs<typeof api.finalQuotes.index.submitRevision>, "conversationId" | "pdf">;

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` });
}

async function setup(location: LocationCase = locations[0], visibility: Doc<"projects">["visibility"] = "invite_only") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (accountType: Doc<"users">["accountType"]) => ctx.db.insert("users", {
      accountType, onboardingStatus: "completed", countryCode: "MA", createdAt: 1, updatedAt: 1,
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
      name: "Rival Build", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
    });
    const membershipId = await ctx.db.insert("companyMembers", {
      companyId, userId: companyUserId, role: "owner", status: "active", createdAt: 1,
    });
    await ctx.db.insert("companyMembers", {
      companyId: competitorId, userId: competitorUserId, role: "owner", status: "active", createdAt: 1,
    });
    const projectId = await ctx.db.insert("projects", {
      clientId, countryCode: "MA", primaryCategory: "renovation", title: "Renovation project",
      propertyType: "house", surfaceUnknown: true, description: "Complete renovation with electrical and plumbing work.",
      timeline: "one_to_three_months", visibility, status: "published", lastCompletedStep: 6,
      createdAt: 1, updatedAt: 1, submittedAt: 1, publishedAt: 1, ...location.fields,
    });
    await ctx.db.insert("marketplaceSettings", {
      key: "global", commissionTiers: [
        { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
        { minAmountMad: 300_001, maxAmountMad: 500_000, commissionRateBps: 500 },
        { minAmountMad: 500_001, maxAmountMad: null, commissionRateBps: 1_000 },
      ], commissionConfigVersion: 1, updatedAt: 1, updatedByUserId: adminId,
    });
    return { clientId, otherClientId, companyUserId, competitorUserId, adminId, seoId, companyId,
      competitorId, membershipId, projectId };
  });
  return { t, ...ids, client: asUser(t, ids.clientId), company: asUser(t, ids.companyUserId) };
}
type State = Awaited<ReturnType<typeof setup>>;

function expectGeneral(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [localityName, neighborhood, siteAddress, '"localityName"', '"neighborhood"', '"siteAddress"']) {
    expect(serialized).not.toContain(forbidden);
  }
}

async function snapshot(s: State) {
  return s.t.run(async (ctx) => ({
    project: await ctx.db.get(s.projectId),
    quotes: await ctx.db.query("projectQuotes").take(10),
    invitations: await ctx.db.query("invitations").take(10),
    conversations: await ctx.db.query("conversations").take(10),
    finals: await ctx.db.query("finalQuotes").take(10),
    revisions: await ctx.db.query("finalQuoteRevisions").take(10),
    deals: await ctx.db.query("deals").take(10),
    commissionHistory: await ctx.db.query("commissionStatusHistory").take(10),
    commissionSummaries: await ctx.db.query("companyCommissionSummaries").take(10),
    activity: await ctx.db.query("marketplaceActivity").take(30),
    notifications: await ctx.db.query("notifications").take(30),
  }));
}

async function invite(s: State) {
  return s.client.mutation(api.invitations.index.inviteCompanyToProject, { projectId: s.projectId, companyId: s.companyId });
}

async function openDiscussion(s: State, path: "marketplace" | "invitation") {
  if (path === "invitation") {
    const invitation = await invite(s);
    await s.company.mutation(api.invitations.index.acceptInvitation, { invitationId: invitation.invitationId });
  }
  const quote = await s.company.mutation(api.quotes.index.submitInitialQuote, { projectId: s.projectId, ...initialInput });
  if (path === "invitation") {
    expect(quote.status).toBe("discussion_open");
    expect(quote.conversationId).not.toBeNull();
    return { quoteId: quote.quoteId, conversationId: quote.conversationId! };
  }
  expect(quote).toMatchObject({ status: "submitted", conversationId: null });
  const opened = await s.client.mutation(api.quotes.index.reviewInitialQuote, { quoteId: quote.quoteId, action: "open_discussion" });
  expect(opened.conversationId).not.toBeNull();
  return { quoteId: quote.quoteId, conversationId: opened.conversationId! };
}

describe.each(locations)("GEO9.2A $name", (location) => {
  test("the owner picker and owner invitation DTO retain recorded geography", async () => {
    const s = await setup(location);
    const choices = await s.client.query(api.invitations.index.listMyEligibleProjectsForCompany, { companyId: s.companyId });
    expect(choices).toHaveLength(1);
    expect(choices![0]).toMatchObject({ id: s.projectId, city: location.city, location: {
      ...location.general, localityName: "localityName" in location.fields ? localityName : null, neighborhood,
    } });
    await invite(s);
    const owned = await s.client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId });
    expect(owned[0].location).toEqual(choices![0].location);
    expect(JSON.stringify(owned)).not.toContain(siteAddress);
    expect(await asUser(s.t, s.otherClientId).query(api.invitations.index.listMyEligibleProjectsForCompany, { companyId: s.companyId })).toEqual([]);
  });

  test.each(["pending", "accepted", "declined"] as const)("%s Company invitation summaries stay general", async (status) => {
    const s = await setup(location);
    const created = await invite(s);
    if (status !== "pending") {
      await s.company.mutation(status === "accepted" ? api.invitations.index.acceptInvitation : api.invitations.index.declineInvitation,
        { invitationId: created.invitationId });
    }
    const before = await snapshot(s);
    const rows = await s.company.query(api.invitations.index.listMyCompanyInvitations, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ projectId: s.projectId, status, city: location.city, location: location.general });
    expectGeneral(rows);
    expect(await asUser(s.t, s.competitorUserId).query(api.invitations.index.listMyCompanyInvitations, {})).toEqual([]);
    expect(await snapshot(s)).toEqual(before);
    expect(await asUser(s.t, s.competitorUserId).query(api.quotes.index.getSubmissionContext, { projectId: s.projectId })).toBeNull();
  });

  test("Company proposal and initial-quote summaries work before and after mutual interest without private joins", async () => {
    const s = await setup(location, "marketplace");
    const context = await s.company.query(api.quotes.index.getSubmissionContext, { projectId: s.projectId });
    expect(context?.project).toMatchObject({ city: location.city, location: location.general });
    const quote = await s.company.mutation(api.quotes.index.submitInitialQuote, { projectId: s.projectId, ...initialInput });
    expect(quote).toMatchObject({ status: "submitted", conversationId: null });
    expect(await s.company.query(api.messages.index.listMyThreads, {})).toEqual([]);
    expectGeneral(await s.company.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: s.projectId }));
    const proposal = (await s.company.query(api.proposals.index.listMyProposals, {}))[0];
    expect(proposal).toMatchObject({ quoteId: quote.quoteId, status: "submitted", estimatedPriceMad: initialInput.estimatedPrice,
      city: location.city, location: location.general, conversationId: null });
    expectGeneral(proposal);
    const detail = await s.company.query(api.quotes.index.getMyQuote, { quoteId: quote.quoteId });
    expect(detail).toMatchObject({ ...initialInput, currency: "MAD", project: context?.project });
    expectGeneral(detail);
    const received = await s.client.query(api.quotes.index.listReceivedInitialQuotes, { projectId: s.projectId });
    expect(received[0]).toMatchObject({ id: quote.quoteId, estimatedPrice: initialInput.estimatedPrice, status: "submitted" });
    const opened = await s.client.mutation(api.quotes.index.reviewInitialQuote, { quoteId: quote.quoteId, action: "open_discussion" });
    const authorized = await s.company.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: s.projectId });
    expect(authorized?.location).toMatchObject({ neighborhood });
    if ("localityName" in location.fields) expect(authorized?.location).toMatchObject({ localityName });
    await s.t.run((ctx) => ctx.db.insert("siteAssessments", {
      projectId: s.projectId, clientId: s.clientId, companyId: s.companyId, initialQuoteId: quote.quoteId,
      conversationId: opened.conversationId!, status: "declined", active: false, siteAddress,
      invitedByUserId: s.clientId, invitedAt: 1, createdAt: 1, updatedAt: 1,
    }));
    const before = await snapshot(s);
    const engaged = await s.company.query(api.proposals.index.listMyProposals, {});
    expect(engaged[0]).toMatchObject({ status: "discussion_open", conversationId: opened.conversationId, location: location.general });
    expectGeneral(engaged);
    expectGeneral(await s.company.query(api.quotes.index.getMyQuote, { quoteId: quote.quoteId }));
    expect(await snapshot(s)).toEqual(before);
    expect(await asUser(s.t, s.competitorUserId).query(api.proposals.index.listMyProposals, {})).toEqual([]);
  });

  test.each(["marketplace", "invitation"] as const)("%s path preserves final quote, selection, Deal and commission semantics", async (path) => {
    const s = await setup(location, path === "marketplace" ? "marketplace" : "invite_only");
    const opened = await openDiscussion(s, path);
    const requested = await s.client.mutation(api.finalQuotes.index.request, { conversationId: opened.conversationId });
    expect((await snapshot(s)).deals).toEqual([]);
    const submitted = await s.company.mutation(api.finalQuotes.index.submitRevision, { conversationId: opened.conversationId, ...finalInput });
    const before = await snapshot(s);
    for (const viewer of [s.client, s.company]) {
      const final = await viewer.query(api.finalQuotes.index.getForConversation, { conversationId: opened.conversationId });
      expect(final.finalQuote).toMatchObject({ id: requested.finalQuoteId, status: "submitted", revisions: [
        { ...finalInput, currency: "MAD", revisionNumber: 1 },
      ] });
      expectGeneral(final);
    }
    expect(await snapshot(s)).toEqual(before);
    const acceptance = { finalQuoteId: requested.finalQuoteId, revisionId: submitted.revisionId, action: "accept" as const };
    expect(await s.client.mutation(api.finalQuotes.index.review, acceptance)).toEqual({ status: "accepted", duplicate: false });
    expect(await s.client.mutation(api.finalQuotes.index.review, acceptance)).toEqual({ status: "accepted", duplicate: true });
    const after = await snapshot(s);
    expect(after.project).toMatchObject({ ...location.fields, status: "company_selected", selectedCompanyId: s.companyId,
      selectedFinalQuoteId: requested.finalQuoteId });
    expect(after.quotes[0]).toMatchObject({ ...initialInput, status: "discussion_open" });
    expect(after.revisions).toHaveLength(1);
    expect(after.deals).toHaveLength(1);
    expect(after.deals[0]).toMatchObject({ agreedAmountMad: 380_000.25, currency: "MAD", commissionRateBps: 500,
      commissionAmountMad: 19_000.01, commissionConfigVersion: 1, commissionStatus: "due", status: "active",
      acceptedFinalQuoteRevisionId: submitted.revisionId, commissionDebtorCompanyId: s.companyId, commissionBeneficiary: "batiplus" });
    expect(after.commissionHistory).toEqual([]);
    expect(after.commissionSummaries).toEqual([expect.objectContaining({
      companyId: s.companyId, dueCount: 1, dueAmountCentimes: 1_900_001, paidAmountCentimes: 0,
    })]);
  });
});

describe("GEO9.2A location DTO authorization", () => {
  test.each(["anonymous", "clientId", "otherClientId", "adminId", "seoId"] as const)("Company lists deny %s", async (audience) => {
    const s = await setup();
    const caller = audience === "anonymous" ? s.t : asUser(s.t, s[audience]);
    const before = await snapshot(s);
    for (const query of [api.invitations.index.listMyCompanyInvitations, api.proposals.index.listMyProposals]) {
      await expect(caller.query(query, {})).rejects.toThrow(audience === "anonymous" ? "NOT_AUTHENTICATED" : "COMPANY_ACCOUNT_REQUIRED");
    }
    await expect(caller.query(api.quotes.index.getSubmissionContext, { projectId: s.projectId })).rejects.toThrow(
      audience === "anonymous" ? "NOT_AUTHENTICATED" : "COMPANY_ACCOUNT_REQUIRED");
    expect(await snapshot(s)).toEqual(before);
  });

  test.each(["anonymous", "companyUserId", "adminId", "seoId"] as const)("owner invitation geography denies %s", async (audience) => {
    const s = await setup();
    const caller = audience === "anonymous" ? s.t : asUser(s.t, s[audience]);
    const error = audience === "anonymous" ? "NOT_AUTHENTICATED" : "CLIENT_ACCOUNT_REQUIRED";
    await expect(caller.query(api.invitations.index.listMyEligibleProjectsForCompany, { companyId: s.companyId })).rejects.toThrow(error);
    await expect(caller.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId })).rejects.toThrow(error);
  });

  test("another Client cannot read owner DTOs; stale invitation ownership fails closed", async () => {
    const s = await setup();
    await invite(s);
    await expect(asUser(s.t, s.otherClientId).query(api.invitations.index.listProjectInvitations, { projectId: s.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    await s.t.run((ctx) => ctx.db.patch(s.projectId, { clientId: s.otherClientId }));
    await expect(s.company.query(api.invitations.index.listMyCompanyInvitations, {})).rejects.toThrow("INVITATION_INTEGRITY_ERROR");
  });

  test("revoked Company membership denies invitation, proposal and quote reads", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.membershipId, { status: "inactive" }));
    await expect(s.company.query(api.invitations.index.listMyCompanyInvitations, {})).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await expect(s.company.query(api.proposals.index.listMyProposals, {})).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await expect(s.company.query(api.quotes.index.getSubmissionContext, { projectId: s.projectId })).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
  });

  test("a submitted initial quote does not grant competitors quote or final-quote access", async () => {
    const s = await setup(locations[0], "marketplace");
    const opened = await openDiscussion(s, "marketplace");
    await expect(asUser(s.t, s.competitorUserId).query(api.quotes.index.getMyQuote, { quoteId: opened.quoteId })).rejects.toThrow("QUOTE_NOT_FOUND");
    await expect(asUser(s.t, s.otherClientId).query(api.quotes.index.getReceivedInitialQuote, { quoteId: opened.quoteId })).rejects.toThrow("PROJECT_NOT_FOUND");
    for (const caller of [asUser(s.t, s.competitorUserId), asUser(s.t, s.otherClientId), asUser(s.t, s.seoId)]) {
      await expect(caller.query(api.finalQuotes.index.getForConversation, { conversationId: opened.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    }
    await expect(s.t.query(api.finalQuotes.index.getForConversation, { conversationId: opened.conversationId })).rejects.toThrow("NOT_AUTHENTICATED");
  });
});
