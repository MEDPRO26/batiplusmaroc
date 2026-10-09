/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { toDetailedProjectLocation, toGeneralProjectLocation } from "../lib/geography/project-location";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
const recorded = { regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل",
  localityName: "PRIVATE_DOUAR_GEO92B", neighborhood: "PRIVATE_NEIGHBORHOOD_GEO92B" };
const address = "PRIVATE_SITE_ADDRESS_GEO92B";
const directions = "PRIVATE_VISIT_DIRECTIONS_GEO92B";
const shapes = [
  { name: "structured no city", fields: recorded },
  { name: "legacy city only", fields: { city: "tangier" as const, neighborhood: recorded.neighborhood } },
  { name: "incomplete historical", fields: {} },
  { name: "structured with preserved legacy city", fields: { ...recorded, city: "rabat" as const } },
];
function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}
async function seedUser(t: Backend, accountType: NonNullable<Doc<"users">["accountType"]>) {
  return t.run(ctx => ctx.db.insert("users", { accountType, onboardingStatus: "completed", countryCode: "MA",
    firstName: "Test", lastName: "Reader", createdAt: 1, updatedAt: 1 }));
}
async function seedCompany(t: Backend) {
  const userId = await seedUser(t, "company");
  const companyId = await t.run(ctx => ctx.db.insert("companies", { name: "Company BP", city: "HQ_ONLY",
    onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1 }));
  const membershipId = await t.run(ctx => ctx.db.insert("companyMembers", { userId, companyId, role: "owner", status: "active", createdAt: 1 }));
  return { userId, companyId, membershipId };
}
async function setup(fields: typeof shapes[number]["fields"] = recorded) {
  const t = convexTest(schema, modules);
  const clientId = await seedUser(t, "client");
  const otherClientId = await seedUser(t, "client");
  const company = await seedCompany(t);
  const otherCompany = await seedCompany(t);
  const projectId = await t.run(ctx => ctx.db.insert("projects", { clientId, countryCode: "MA", ...fields,
    title: "Rural renovation", description: "A safe general description.", primaryCategory: "renovation", propertyType: "house",
    surfaceUnknown: true, timeline: "flexible", status: "published", visibility: "marketplace", lastCompletedStep: 6,
    createdAt: 1, updatedAt: 1, submittedAt: 1, publishedAt: 1 }));
  const quoteId = await t.run(ctx => ctx.db.insert("projectQuotes", { projectId, companyId: company.companyId, submittedByUserId: company.userId,
    message: "We can inspect the renovation work.", estimatedPrice: 100_000, currency: "MAD", estimatedDuration: 30,
    availableStartDate: "2099-01-01", scope: "Survey and renovation", quoteType: "initial", status: "submitted", createdAt: 1, updatedAt: 1, submittedAt: 1 }));
  return { t, clientId, otherClientId, company, otherCompany, projectId, quoteId };
}
type State = Awaited<ReturnType<typeof setup>>;
async function engage(state: State) {
  const client = asUser(state.t, state.clientId);
  const opened = await client.mutation(api.quotes.index.reviewInitialQuote, { quoteId: state.quoteId, action: "open_discussion" });
  const conversationId = opened.conversationId!;
  const invited = await client.mutation(api.siteVisits.index.invite, { conversationId });
  await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" });
  return { conversationId, assessmentId: invited.assessmentId };
}
function schedule(days = 2) {
  const proposedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(Date.now() + days * 86_400_000);
  return { proposedDate, proposedTime: "10:00", timezone: "Africa/Casablanca" as const, siteAddress: address, note: directions };
}
function noAddress(dto: unknown) {
  const json = JSON.stringify(dto);
  for (const value of [address, directions, '"siteAddress"']) expect(json).not.toContain(value);
}
function generalOnly(dto: unknown) {
  noAddress(dto);
  const json = JSON.stringify(dto);
  for (const value of [recorded.localityName, recorded.neighborhood, '"localityName"', '"neighborhood"']) expect(json).not.toContain(value);
}
async function projectReads(state: State) {
  const client = asUser(state.t, state.clientId);
  const company = asUser(state.t, state.company.userId);
  return {
    clientDashboard: await client.query(api.projects.index.getMyProjects, {}),
    clientDetail: await client.query(api.projects.index.getMyProject, { projectId: state.projectId }),
    companyDashboard: await company.query(api.projects.marketplace.listCompanyMarketplaceProjects, { paginationOpts: { numItems: 8, cursor: null } }),
    companyDetail: await company.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: state.projectId }),
  };
}
async function snapshot(state: State) {
  return state.t.run(async ctx => ({
    project: await ctx.db.get(state.projectId), quote: await ctx.db.get(state.quoteId),
    assessments: await ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", q => q.eq("projectId", state.projectId)).take(10),
    visits: await ctx.db.query("siteVisits").withIndex("by_projectId_and_createdAt", q => q.eq("projectId", state.projectId)).take(10),
    proposals: await ctx.db.query("siteVisitProposals").take(10), notifications: await ctx.db.query("notifications").take(100),
    activity: await ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", q => q.eq("projectId", state.projectId)).take(100),
    deals: await ctx.db.query("deals").take(10), commissionSummaries: await ctx.db.query("companyCommissionSummaries").take(10),
    commissionHistory: await ctx.db.query("commissionStatusHistory").take(10),
  }));
}

describe.each(shapes)("GEO9.2B $name compatibility", ({ fields }) => {
  test("dashboard and Project detail readers preserve their audience projections before interest", async () => {
    const state = await setup(fields);
    const before = await snapshot(state);
    const reads = await projectReads(state);
    for (const dto of [reads.clientDashboard[0], reads.clientDetail]) {
      expect(dto).toMatchObject({ city: "city" in fields ? fields.city : null, location: toDetailedProjectLocation(fields) });
      noAddress(dto);
    }
    for (const dto of [reads.companyDashboard.page[0], reads.companyDetail]) {
      expect(dto).toMatchObject({ city: "city" in fields ? fields.city : null, location: toGeneralProjectLocation(fields) });
      generalOnly(dto);
    }
    expect((await asUser(state.t, state.company.userId).query(api.siteVisits.index.getForProject, { projectId: state.projectId })).assessment).toBeNull();
    expect(await snapshot(state)).toEqual(before);
  });

  test("visit addresses stay in authorized detail while dashboard summaries stay general after interest", async () => {
    const state = await setup(fields);
    const { conversationId, assessmentId } = await engage(state);
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId, ...schedule() });
    const before = await snapshot(state);
    const reads = await projectReads(state);
    generalOnly(reads.companyDashboard);
    for (const dto of [reads.clientDashboard, reads.clientDetail, reads.companyDetail]) noAddress(dto);
    expect(reads.companyDetail?.location).toEqual(toDetailedProjectLocation(fields));
    for (const userId of [state.clientId, state.company.userId]) {
      const caller = asUser(state.t, userId);
      for (const detail of [await caller.query(api.siteVisits.index.getForProject, { projectId: state.projectId }),
        await caller.query(api.siteVisits.index.getForConversation, { conversationId })]) {
        expect(detail.assessment?.visit).toMatchObject({ siteAddress: address, note: directions, proposedTime: "10:00", timezone: "Africa/Casablanca" });
        expect(detail.assessment).not.toHaveProperty("location");
      }
    }
    expect(await snapshot(state)).toEqual(before);
  });

  test("scheduling, exact retries, rescheduling, confirmation and completion preserve Project and financial state", async () => {
    const state = await setup(fields);
    const { assessmentId } = await engage(state);
    const client = asUser(state.t, state.clientId);
    const company = asUser(state.t, state.company.userId);
    const before = await state.t.run(ctx => ctx.db.get(state.projectId));
    const proposal = { assessmentId, ...schedule() };
    const first = await client.mutation(api.siteVisits.index.proposeVisit, proposal);
    expect(await client.mutation(api.siteVisits.index.proposeVisit, proposal)).toMatchObject({ visitId: first.visitId, duplicate: true });
    expect(await company.mutation(api.siteVisits.index.proposeVisit, { ...proposal, proposedTime: "14:00" })).toMatchObject({ visitId: first.visitId });
    await client.mutation(api.siteVisits.index.respondToVisit, { visitId: first.visitId, decision: "confirm" });
    await expect(client.mutation(api.siteVisits.index.completeVisit, { visitId: first.visitId })).rejects.toThrow("SITE_VISIT_NOT_YET_DUE");
    await state.t.run(async ctx => {
      const visit = await ctx.db.get(first.visitId);
      const pastDate = schedule(-2).proposedDate;
      await ctx.db.patch(first.visitId, { proposedDate: pastDate });
      await ctx.db.patch(visit!.currentProposalId!, { proposedDate: pastDate });
    });
    await company.mutation(api.siteVisits.index.completeVisit, { visitId: first.visitId });
    const after = await snapshot(state);
    expect(after.project).toEqual(before);
    expect(after.project?.city).toEqual("city" in fields ? fields.city : undefined);
    expect(after.visits).toHaveLength(1);
    expect(after.visits[0]).toMatchObject({ status: "completed", active: false });
    expect(after.proposals.map(item => item.sequence)).toEqual([1, 2]);
    expect(after.deals).toEqual([]);
    expect(after.commissionSummaries).toEqual([]);
    expect(after.commissionHistory).toEqual([]);
  });

  test("other Clients/Companies and anonymous readers cannot retrieve visit details", async () => {
    const state = await setup(fields);
    const { conversationId, assessmentId } = await engage(state);
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId, ...schedule() });
    await expect(state.t.query(api.siteVisits.index.getForProject, { projectId: state.projectId })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.otherClientId).query(api.siteVisits.index.getForProject, { projectId: state.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    for (const userId of [state.otherClientId, state.otherCompany.userId]) {
      await expect(asUser(state.t, userId).query(api.siteVisits.index.getForConversation, { conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    }
    const outsider = await asUser(state.t, state.otherCompany.userId).query(api.siteVisits.index.getForProject, { projectId: state.projectId });
    expect(outsider.assessment).toBeNull();
    expect(await asUser(state.t, state.otherClientId).query(api.projects.index.getMyProject, { projectId: state.projectId })).toBeNull();
  });
});

describe("GEO9.2B current access rechecks", () => {
  test.each(["membership", "role", "ownership"] as const)("revoked %s prevents Site Visit detail access", async (revoked) => {
    const state = await setup();
    const { conversationId, assessmentId } = await engage(state);
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId, ...schedule() });
    await state.t.run(async ctx => {
      if (revoked === "membership") await ctx.db.patch(state.company.membershipId, { status: "inactive" });
      if (revoked === "role") await ctx.db.patch(state.company.userId, { accountType: "client" });
      if (revoked === "ownership") await ctx.db.patch(state.projectId, { clientId: state.otherClientId });
    });
    const caller = asUser(state.t, revoked === "ownership" ? state.clientId : state.company.userId);
    await expect(caller.query(api.siteVisits.index.getForProject, { projectId: state.projectId })).rejects.toThrow();
    await expect(caller.query(api.siteVisits.index.getForConversation, { conversationId })).rejects.toThrow();
  });
  test("SEO callers and locked discussions cannot use visit workflows", async () => {
    const state = await setup();
    const seoId = await seedUser(state.t, "seo_team");
    await expect(asUser(state.t, seoId).query(api.siteVisits.index.getForProject, { projectId: state.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    const { conversationId } = await engage(state);
    await state.t.run(ctx => ctx.db.patch(state.quoteId, { status: "submitted" }));
    for (const userId of [state.clientId, state.company.userId]) {
      await expect(asUser(state.t, userId).query(api.siteVisits.index.getForConversation, { conversationId })).rejects.toThrow("CONVERSATION_LOCKED");
    }
  });
});
