/// <reference types="vite/client" />

import type { WithoutSystemFields } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { buildProjectMarketplaceSearchText } from "./projects/marketplaceSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
const recorded = {
  regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل",
  localityName: "PRIVATE_DOUAR_SENTINEL_ⵜⴰⵎⵍⵉⵍ", neighborhood: "PRIVATE_NEIGHBORHOOD_SENTINEL",
};
const exactAddress = "PRIVATE_EXACT_SITE_ADDRESS_SENTINEL";
const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}
async function user(t: Backend, role: NonNullable<Doc<"users">["accountType"]>) {
  return await t.run((ctx) => ctx.db.insert("users", {
    accountType: role, onboardingStatus: "completed", countryCode: "MA", firstName: "Samir", lastName: "Test", createdAt: 1, updatedAt: 1,
  }));
}
async function company(t: Backend) {
  const userId = await user(t, "company");
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name: "Construction Company", city: "Rabat", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
  }));
  const membershipId = await t.run((ctx) => ctx.db.insert("companyMembers", { userId, companyId, role: "owner", status: "active", createdAt: 1 }));
  return { userId, companyId, membershipId };
}
async function project(t: Backend, clientId: Id<"users">, overrides: Partial<WithoutSystemFields<Doc<"projects">>> = {}) {
  const input = {
    clientId, countryCode: "MA" as const, ...recorded, title: "Rural renovation project",
    description: "A safe general description of the renovation work.", primaryCategory: "renovation" as const,
    propertyType: "house" as const, surfaceUnknown: true, timeline: "flexible" as const,
    status: "published" as const, visibility: "marketplace" as const, lastCompletedStep: 5,
    createdAt: 1, updatedAt: 1, publishedAt: 1, ...overrides,
  };
  return await t.run((ctx) => ctx.db.insert("projects", { ...input, marketplaceSearchText: buildProjectMarketplaceSearchText(input) }));
}
async function setup(overrides: Partial<WithoutSystemFields<Doc<"projects">>> = {}) {
  const t = convexTest(schema, modules);
  const clientId = await user(t, "client");
  const otherClientId = await user(t, "client");
  const adminId = await user(t, "admin");
  const seoId = await user(t, "seo_team");
  const member = await company(t);
  const other = await company(t);
  const projectId = await project(t, clientId, overrides);
  return { t, clientId, otherClientId, adminId, seoId, member, other, projectId };
}
type State = Awaited<ReturnType<typeof setup>>;
async function quote(state: State) {
  return await state.t.run((ctx) => ctx.db.insert("projectQuotes", {
    projectId: state.projectId, companyId: state.member.companyId, submittedByUserId: state.member.userId,
    message: "A submitted initial proposal.", estimatedPrice: 100_000, currency: "MAD", estimatedDuration: 30,
    availableStartDate: "2099-01-01", scope: "Renovation work", quoteType: "initial", status: "submitted",
    createdAt: 1, updatedAt: 1, submittedAt: 1,
  }));
}
async function openDiscussion(state: State) {
  const quoteId = await quote(state);
  const opened = await asUser(state.t, state.clientId).mutation(api.quotes.index.reviewInitialQuote, { quoteId, action: "open_discussion" });
  return { quoteId, conversationId: opened.conversationId! };
}
async function companyDetail(state: State, userId = state.member.userId) {
  return await asUser(state.t, userId).query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: state.projectId });
}
function noRestrictedDetails(dto: unknown) {
  const serialized = JSON.stringify(dto);
  for (const value of [recorded.localityName, recorded.neighborhood, exactAddress, '"localityName"', '"neighborhood"', '"siteAddress"']) {
    expect(serialized).not.toContain(value);
  }
}
function detailedLocation() {
  return { regionCode: recorded.regionCode, provinceCode: recorded.provinceCode, communeName: recorded.communeName,
    legacyCity: null, localityName: recorded.localityName, neighborhood: recorded.neighborhood };
}

describe("GEO3 audience-specific project location readers", () => {
  test.each([undefined, "rabat"] as const)("public and pre-interest Company readers support structured records with city=%s", async (city) => {
    const state = await setup({ city });
    const { t, projectId, member } = state;
    const responses = [
      await t.query(api.projects.index.getPublicProject, { projectId }),
      await t.query(api.projects.index.listPublicProjects, {}),
      await companyDetail(state),
      await asUser(t, member.userId).query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage),
    ];
    expect(responses[0]).toMatchObject({ city: city ?? null, location: {
      regionCode: "05", provinceCode: "05.081", communeName: recorded.communeName, legacyCity: null,
    } });
    expect(responses[2]).toMatchObject({ id: projectId, city: city ?? null });
    expect((responses[1] as { id: Id<"projects"> }[]).map((item) => item.id)).toEqual([projectId]);
    expect((responses[3] as { page: { id: Id<"projects"> }[] }).page.map((item) => item.id)).toEqual([projectId]);
    for (const response of responses) noRestrictedDetails(response);
  });

  test("legacy-only project responses preserve city display without exposing historical neighborhood", async () => {
    const state = await setup({ city: "agadir", regionCode: undefined, provinceCode: undefined, communeName: undefined, localityName: undefined });
    for (const response of [await companyDetail(state), await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId })]) {
      expect(response).toMatchObject({ city: "agadir", location: { regionCode: null, provinceCode: null, communeName: null, legacyCity: "agadir" } });
      noRestrictedDetails(response);
    }
  });

  test("missing and invalid administrative codes remain readable without inventing a valid pair", async () => {
    const state = await setup({ regionCode: "05", provinceCode: "01.511" });
    expect(await companyDetail(state)).toMatchObject({ location: { regionCode: "05", provinceCode: null } });
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { regionCode: "PRIVATE_UNKNOWN_CODE", provinceCode: "99.999", communeName: undefined }));
    const response = await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId });
    expect(response).toMatchObject({ location: { regionCode: null, provinceCode: null, communeName: null, legacyCity: null } });
    expect(JSON.stringify(response)).not.toContain("PRIVATE_UNKNOWN_CODE");
    noRestrictedDetails(response);
  });

  test.each(["draft", "pending_review", "needs_changes", "cancelled", "archived"] as const)("%s projects retain their public/Company access denials", async (status) => {
    const state = await setup({ status });
    expect(await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId })).toBeNull();
    expect(await state.t.query(api.projects.index.listPublicProjects, {})).toEqual([]);
    expect(await companyDetail(state)).toBeNull();
    expect((await asUser(state.t, state.member.userId).query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage)).page).toEqual([]);
  });

  test("owning Client and current Admin readers receive all recorded fields, including incomplete drafts", async () => {
    const state = await setup({ status: "draft", city: "rabat", regionCode: "historical-unknown", provinceCode: undefined });
    const { t, clientId, adminId, projectId } = state;
    const expected = { ...detailedLocation(), regionCode: "historical-unknown", provinceCode: null };
    const owner = asUser(t, clientId);
    const admin = asUser(t, adminId);
    const responses = [
      await owner.query(api.projects.index.getMyProject, { projectId }),
      (await owner.query(api.projects.index.getMyProjects, {}))[0],
      (await owner.query(api.projects.index.getWizard, { projectId })).draft,
      await admin.query(api.projects.index.getMyProject, { projectId }),
      await admin.query(api.admin.projects.getProjectReview, { projectId }),
      (await admin.query(api.admin.projects.listProjects, { status: "all" }))[0],
    ];
    for (const response of responses) expect(response).toMatchObject({ location: expected });
    expect((await owner.query(api.projects.index.getWizard, { projectId })).draft?.resumeStep).toBe(2);
    const stored = await t.run((ctx) => ctx.db.get("projects", projectId));
    expect(stored).toMatchObject({ regionCode: "historical-unknown", communeName: recorded.communeName,
      localityName: recorded.localityName, neighborhood: recorded.neighborhood, city: "rabat", status: "draft" });
    expect(stored).not.toHaveProperty("provinceCode");
  });

  test("other Clients, Companies, SEO users and anonymous callers cannot use owner/Admin endpoints", async () => {
    const state = await setup();
    for (const userId of [state.otherClientId, state.member.userId, state.seoId]) {
      const caller = asUser(state.t, userId);
      expect(await caller.query(api.projects.index.getMyProject, { projectId: state.projectId })).toBeNull();
      await expect(caller.query(api.admin.projects.getProjectReview, { projectId: state.projectId })).rejects.toThrow("ADMIN_REQUIRED");
    }
    await expect(state.t.query(api.projects.index.getMyProject, { projectId: state.projectId })).rejects.toThrow("NOT_AUTHENTICATED");
    await state.t.run((ctx) => ctx.db.patch(state.adminId, { accountType: "seo_team" }));
    await expect(asUser(state.t, state.adminId).query(api.admin.projects.getProjectReview, { projectId: state.projectId })).rejects.toThrow("ADMIN_REQUIRED");
    expect(await asUser(state.t, state.adminId).query(api.projects.index.getMyProject, { projectId: state.projectId })).toBeNull();
  });

  test("a cleared marked record keeps historical fields private and inactive in public/Company projections", async () => {
    // Historical published records must remain readable, even if geography is now incomplete.
    const state = await setup({ locationMode: "structured", city: "agadir", regionCode: undefined, provinceCode: undefined,
      communeName: undefined, localityName: undefined });
    const { t, projectId, member, clientId, adminId } = state;
    const before = await t.run((ctx) => ctx.db.get(projectId));
    const general = { regionCode: null, provinceCode: null, communeName: null, legacyCity: null };
    const publicDetail = await t.query(api.projects.index.getPublicProject, { projectId });
    const publicList = await t.query(api.projects.index.listPublicProjects, {});
    const companyPage = await asUser(t, member.userId).query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage);
    for (const response of [publicDetail, publicList[0], await companyDetail(state), companyPage.page[0]]) {
      expect(response).toMatchObject({ city: "agadir", location: general });
      expect(JSON.stringify(response)).not.toContain('"locationMode"');
      noRestrictedDetails(response);
    }
    for (const caller of [asUser(t, clientId), asUser(t, adminId)]) {
      expect(await caller.query(api.projects.index.getMyProject, { projectId })).toMatchObject({
        city: "agadir", neighborhood: recorded.neighborhood, location: { ...general, localityName: null, neighborhood: recorded.neighborhood },
      });
    }
    expect(await t.run((ctx) => ctx.db.get(projectId))).toEqual(before);
  });
});

describe("GEO3 mutual-interest location authorization", () => {
  test("a submitted proposal and even a forged conversation without an unlocked source reveal no details", async () => {
    const state = await setup();
    const quoteId = await quote(state);
    noRestrictedDetails(await companyDetail(state));
    await state.t.run((ctx) => ctx.db.insert("conversations", {
      projectId: state.projectId, companyId: state.member.companyId, clientId: state.clientId,
      quoteId, status: "active", createdBy: state.clientId, createdAt: 1, updatedAt: 1,
    }));
    noRestrictedDetails(await companyDetail(state));
  });

  test("Client-opened discussion grants that Company details but keeps public and feed cards general", async () => {
    const state = await setup({ locationMode: "structured" });
    await openDiscussion(state);
    expect(await companyDetail(state)).toMatchObject({ city: null, location: detailedLocation(), neighborhood: recorded.neighborhood });
    noRestrictedDetails(await companyDetail(state, state.other.userId));
    noRestrictedDetails(await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId }));
    noRestrictedDetails(await asUser(state.t, state.member.userId).query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage));
  });

  test("receiving an invitation does not unlock access; acceptance uses the existing conversation gate", async () => {
    const state = await setup({ visibility: "invite_only" });
    const invitation = await asUser(state.t, state.clientId).mutation(api.invitations.index.inviteCompanyToProject, {
      projectId: state.projectId, companyId: state.member.companyId,
    });
    expect(await companyDetail(state)).toBeNull();
    await asUser(state.t, state.member.userId).mutation(api.invitations.index.acceptInvitation, { invitationId: invitation.invitationId });
    expect(await companyDetail(state)).toMatchObject({ location: detailedLocation() });
    expect(await companyDetail(state, state.other.userId)).toBeNull();
    expect(await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId })).toBeNull();
    expect(await state.t.query(api.projects.index.listPublicProjects, {})).toEqual([]);
    expect((await asUser(state.t, state.member.userId).query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage)).page).toEqual([]);
    const conversation = await state.t.run((ctx) => ctx.db.query("conversations")
      .withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", state.projectId).eq("companyId", state.member.companyId)).unique());
    await state.t.run((ctx) => ctx.db.delete(conversation!._id));
    noRestrictedDetails(await companyDetail(state));
  });

  test("an invitation marked accepted without a valid owning Client relationship cannot reveal details", async () => {
    const state = await setup({ visibility: "invite_only" });
    const invitationId = await state.t.run((ctx) => ctx.db.insert("invitations", {
      projectId: state.projectId, companyId: state.member.companyId, clientUserId: state.otherClientId,
      status: "accepted", createdAt: 1, updatedAt: 1, acceptedAt: 1,
    }));
    await state.t.run((ctx) => ctx.db.insert("conversations", {
      projectId: state.projectId, companyId: state.member.companyId, clientId: state.clientId,
      invitationId, status: "active", createdBy: state.clientId, createdAt: 1, updatedAt: 1,
    }));
    expect(await companyDetail(state)).toBeNull();
  });

  test("active staff share Company authorization, while revocation or role changes remove access immediately", async () => {
    const state = await setup();
    await openDiscussion(state);
    const staffId = await user(state.t, "company");
    const membershipId = await state.t.run((ctx) => ctx.db.insert("companyMembers", {
      userId: staffId, companyId: state.member.companyId, role: "staff", status: "active", createdAt: 1,
    }));
    expect(await companyDetail(state, staffId)).toMatchObject({ location: detailedLocation() });
    await state.t.run((ctx) => ctx.db.patch(membershipId, { status: "inactive" }));
    await expect(companyDetail(state, staffId)).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await state.t.run((ctx) => ctx.db.patch(state.member.userId, { accountType: "client" }));
    await expect(companyDetail(state)).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
  });

  test.each(["ownership", "source company", "source project", "source status", "duplicate conversation"] as const)("%s changes fail closed on every subsequent detail read", async (change) => {
    const state = await setup();
    const { quoteId, conversationId } = await openDiscussion(state);
    expect(await companyDetail(state)).toMatchObject({ location: detailedLocation() });
    await state.t.run(async (ctx) => {
      if (change === "ownership") await ctx.db.patch(state.projectId, { clientId: state.otherClientId });
      if (change === "source company") await ctx.db.patch(quoteId, { companyId: state.other.companyId });
      if (change === "source project") {
        const otherProject = await ctx.db.insert("projects", { clientId: state.clientId, countryCode: "MA", surfaceUnknown: true,
          visibility: "marketplace", status: "draft", lastCompletedStep: 0, createdAt: 1, updatedAt: 1 });
        await ctx.db.patch(quoteId, { projectId: otherProject });
      }
      if (change === "source status") await ctx.db.patch(quoteId, { status: "withdrawn" });
      if (change === "duplicate conversation") {
        const existing = await ctx.db.get("conversations", conversationId);
        if (!existing) throw new Error("Missing test conversation");
        const { _id, _creationTime, ...input } = existing;
        void _id; void _creationTime;
        await ctx.db.insert("conversations", input);
      }
    });
    noRestrictedDetails(await companyDetail(state));
  });
});

test("exact addresses stay in the authorized site-visit workflow even after mutual interest", async () => {
  const state = await setup();
  const { t, projectId, clientId, member } = state;
  const { quoteId, conversationId } = await openDiscussion(state);
  await t.run(async (ctx) => {
    const assessmentId = await ctx.db.insert("siteAssessments", {
      projectId, clientId, companyId: member.companyId, initialQuoteId: quoteId, conversationId,
      status: "scheduled", active: true, invitedByUserId: clientId, invitedAt: 1, acceptedAt: 1, createdAt: 1, updatedAt: 1,
    });
    const visitId = await ctx.db.insert("siteVisits", {
      assessmentId, projectId, clientId, companyId: member.companyId, conversationId, initialQuoteId: quoteId,
      proposedByUserId: clientId, proposedDate: "2099-01-01", proposedTime: "10:00", timezone: "Africa/Casablanca",
      siteAddress: exactAddress, status: "confirmed", active: true, proposedAt: 1, createdAt: 1, updatedAt: 1,
    });
    const proposalId = await ctx.db.insert("siteVisitProposals", {
      visitId, assessmentId, sequence: 1, proposedByUserId: clientId,
      proposedDate: "2099-01-01", proposedTime: "10:00", timezone: "Africa/Casablanca",
      siteAddress: exactAddress, proposedAt: 1,
    });
    await ctx.db.patch(visitId, { currentProposalId: proposalId });
  });
  for (const response of [
    await companyDetail(state),
    await asUser(t, clientId).query(api.projects.index.getMyProject, { projectId }),
    await asUser(t, state.adminId).query(api.admin.projects.getProjectReview, { projectId }),
  ]) {
    expect(JSON.stringify(response)).not.toContain(exactAddress);
    expect(JSON.stringify(response)).not.toContain('"siteAddress"');
  }
  const privateVisit = await asUser(t, member.userId).query(api.siteVisits.index.getForConversation, { conversationId });
  expect(privateVisit.assessment?.visit?.siteAddress).toBe(exactAddress);
  await expect(asUser(t, state.other.userId).query(api.siteVisits.index.getForConversation, { conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
  await expect(asUser(t, state.otherClientId).query(api.siteVisits.index.getForProject, { projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
  await expect(t.query(api.siteVisits.index.getForConversation, { conversationId })).rejects.toThrow("NOT_AUTHENTICATED");
});
