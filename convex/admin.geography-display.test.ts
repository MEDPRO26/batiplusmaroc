/// <reference types="vite/client" />

import type { WithoutSystemFields } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
const geography = {
  regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل",
  localityName: "ADMIN_DOUAR_ⵜⴰⵎⵍⵉⵍ", neighborhood: "ADMIN_NEIGHBORHOOD",
};
const address = "PRIVATE_VISIT_STREET_ADDRESS";
const now = Date.UTC(2026, 9, 9, 12);

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function setup(overrides: Partial<WithoutSystemFields<Doc<"projects">>> = {}) {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => {
    const result = {} as Record<"client" | "company" | "admin" | "seo_team", Id<"users">>;
    for (const role of ["client", "company", "admin", "seo_team"] as const) {
      result[role] = await ctx.db.insert("users", {
        accountType: role, firstName: role, lastName: "Tester",
        email: `${role}@private-geography.test`, onboardingStatus: "completed",
        countryCode: "MA", createdAt: 1, updatedAt: 1,
      });
    }
    return result;
  });
  const records = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Atlas BTP", city: "Agadir", verificationStatus: "verified",
      onboardingStatus: "completed", createdAt: 1, updatedAt: 1,
    });
    const projectId = await ctx.db.insert("projects", {
      clientId: users.client, countryCode: "MA", locationMode: "structured", ...geography,
      title: "Rural construction", primaryCategory: "renovation", description: "Rural work.",
      propertyType: "house", timeline: "flexible", surfaceUnknown: true,
      visibility: "invite_only", status: "in_discussion", lastCompletedStep: 5,
      submittedAt: 10, publishedAt: 11, createdAt: 1, updatedAt: 1, ...overrides,
    });
    const quoteId = await ctx.db.insert("projectQuotes", {
      projectId, companyId, submittedByUserId: users.company, message: "Initial proposal",
      estimatedPrice: 100_000, currency: "MAD", estimatedDuration: 30,
      availableStartDate: "2026-10-20", scope: "Renovation", quoteType: "initial",
      status: "discussion_open", submittedAt: 2, createdAt: 2, updatedAt: 2,
    });
    const conversationId = await ctx.db.insert("conversations", {
      projectId, companyId, clientId: users.client, quoteId, status: "active",
      createdBy: users.client, createdAt: 3, updatedAt: 3,
    });
    const assessmentId = await ctx.db.insert("siteAssessments", {
      projectId, companyId, clientId: users.client, initialQuoteId: quoteId, conversationId,
      status: "scheduled", active: true, invitedByUserId: users.client, invitedAt: 4,
      siteAddress: "PRIVATE_ASSESSMENT_ADDRESS", clientNote: "PRIVATE_CLIENT_NOTE",
      companyNote: "PRIVATE_COMPANY_NOTE", createdAt: 4, updatedAt: 4,
    });
    await ctx.db.insert("siteVisits", {
      projectId, companyId, clientId: users.client, initialQuoteId: quoteId, conversationId,
      assessmentId, proposedByUserId: users.company, proposedDate: "2026-10-12",
      proposedTime: "10:00", timezone: "Africa/Casablanca", siteAddress: address,
      note: "PRIVATE_VISIT_NOTE", status: "confirmed", active: true, proposedAt: 5,
      confirmedByUserId: users.client, confirmedAt: 6, createdAt: 5, updatedAt: 6,
    });
    return { projectId, assessmentId };
  });
  return { t, users, ...records };
}

async function adminReads(state: Awaited<ReturnType<typeof setup>>) {
  const admin = asUser(state.t, state.users.admin);
  return {
    projects: await admin.query(api.admin.projects.listProjects, { status: "all" }),
    review: await admin.query(api.admin.projects.getProjectReview, { projectId: state.projectId }),
    visits: await admin.query(api.admin.siteVisits.listSiteVisits, { status: "all", now }),
    detail: await admin.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: state.assessmentId, now }),
  };
}

describe("GEO9.1 Admin location display and privacy", () => {
  test("returns detailed geography for no-city invite-only projects without changing records", async () => {
    const state = await setup();
    const before = await state.t.run((ctx) => ctx.db.get(state.projectId));
    const reads = await adminReads(state);
    const expected = { ...geography, legacyCity: null };
    for (const dto of [reads.projects[0], reads.review, reads.visits[0], reads.detail?.project]) {
      expect(dto).toMatchObject({ city: null, location: expected });
      expect(Object.keys(dto!.location).sort()).toEqual([
        "communeName", "legacyCity", "localityName", "neighborhood", "provinceCode", "regionCode",
      ]);
    }
    expect(reads.review?.status).toBe("in_discussion");
    expect(reads.visits[0].status).toBe("confirmed");
    expect(await state.t.run((ctx) => ctx.db.get(state.projectId))).toEqual(before);
  });

  test("retains legacy city-only records unfiltered without inferring a region or province", async () => {
    const state = await setup({
      locationMode: undefined, city: "rabat", regionCode: undefined, provinceCode: undefined,
      communeName: undefined, localityName: undefined,
    });
    const reads = await adminReads(state);
    for (const dto of [reads.projects[0], reads.review, reads.visits[0], reads.detail?.project]) {
      expect(dto).toMatchObject({ city: "rabat", location: {
        legacyCity: "rabat", regionCode: null, provinceCode: null,
        communeName: null, localityName: null, neighborhood: geography.neighborhood,
      } });
    }
  });

  test("retains incomplete structured drafts and suppresses their leftover legacy fallback", async () => {
    const state = await setup({
      status: "draft", city: "rabat", provinceCode: undefined,
      communeName: undefined, localityName: undefined,
    });
    const reads = await adminReads(state);
    for (const dto of [reads.projects[0], reads.review, reads.visits[0], reads.detail?.project]) {
      expect(dto?.location).toMatchObject({ regionCode: "05", provinceCode: null, localityName: null, legacyCity: null });
    }
    expect(reads.projects[0].status).toBe("draft");
    expect(reads.review?.status).toBe("draft");
  });

  test("preserves recorded invalid historical codes for Admin review without repairing storage", async () => {
    const state = await setup({ regionCode: "historical-region", provinceCode: "99.999" });
    const reads = await adminReads(state);
    expect(reads.visits[0].location).toMatchObject({ regionCode: "historical-region", provinceCode: "99.999" });
    expect(await state.t.run((ctx) => ctx.db.get(state.projectId))).toMatchObject({ regionCode: "historical-region", provinceCode: "99.999" });
  });

  test("keeps addresses, notes and contact data out of list/review geography DTOs", async () => {
    const state = await setup();
    const reads = await adminReads(state);
    const serialized = JSON.stringify([reads.projects, reads.review, reads.visits, reads.detail?.project]);
    for (const privateValue of [address, "PRIVATE_ASSESSMENT_ADDRESS", "PRIVATE_CLIENT_NOTE", "PRIVATE_COMPANY_NOTE", "PRIVATE_VISIT_NOTE", "@private-geography.test", '"siteAddress"']) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(reads.detail?.visit?.siteAddress).toBe(address);
    expect(JSON.stringify(reads.detail?.project.location)).not.toContain(address);
  });

  test.each([null, "client", "company", "seo_team"] as const)(
    "denies %s callers on every changed/existing Admin read boundary",
    async (role) => {
      const state = await setup();
      const caller = role === null ? state.t : asUser(state.t, state.users[role]);
      const error = role === null ? "NOT_AUTHENTICATED" : "ADMIN_REQUIRED";
      await expect(caller.query(api.admin.projects.listProjects, { status: "all" })).rejects.toThrow(error);
      await expect(caller.query(api.admin.projects.getProjectReview, { projectId: state.projectId })).rejects.toThrow(error);
      await expect(caller.query(api.admin.siteVisits.listSiteVisits, { status: "all", now })).rejects.toThrow(error);
      await expect(caller.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: state.assessmentId, now })).rejects.toThrow(error);
    },
  );

  test.each(["revoked", "deleted"] as const)("rechecks a %s Admin on subsequent reads", async (kind) => {
    const state = await setup();
    await adminReads(state);
    await state.t.run(async (ctx) => {
      if (kind === "deleted") await ctx.db.delete(state.users.admin);
      else await ctx.db.patch(state.users.admin, { accountType: "seo_team" });
    });
    await expect(adminReads(state)).rejects.toThrow("ADMIN_REQUIRED");
    const caller = asUser(state.t, state.users.admin);
    await expect(caller.query(api.admin.projects.getProjectReview, { projectId: state.projectId })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(caller.query(api.admin.siteVisits.listSiteVisits, { status: "all", now })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(caller.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: state.assessmentId, now })).rejects.toThrow("ADMIN_REQUIRED");
  });

  test("ownership mismatches still skip list rows and deny private visit detail", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { clientId: state.users.admin }));
    const admin = asUser(state.t, state.users.admin);
    expect(await admin.query(api.admin.siteVisits.listSiteVisits, { status: "all", now })).toEqual([]);
    await expect(admin.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: state.assessmentId, now })).rejects.toThrow("SITE_VISIT_INTEGRITY_ERROR");
  });
});
