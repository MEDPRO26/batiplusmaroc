/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

async function seedUser(
  t: Backend,
  accountType: "client" | "company" | "admin" | "seo_team",
  firstName: string,
) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${firstName.toLocaleLowerCase()}@admin-visits.test`,
    firstName,
    lastName: "Tester",
    accountType,
    countryCode: "MA",
    onboardingStatus: "completed",
    createdAt: 1,
    updatedAt: 1,
  }));
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

const listArgs = { status: "all" as const, now: Date.UTC(2026, 8, 24, 12) };

async function setup() {
  const t = convexTest(schema, modules);
  const clientId = await seedUser(t, "client", "Hamza");
  const companyUserId = await seedUser(t, "company", "Amine");
  const adminId = await seedUser(t, "admin", "Admin");
  const seoId = await seedUser(t, "seo_team", "Seo");
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name: "Atlas BTP",
    slug: "atlas-btp",
    city: "agadir",
    onboardingStatus: "completed",
    verificationStatus: "verified",
    createdAt: 1,
    updatedAt: 1,
  }));
  await t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId,
    userId: companyUserId,
    role: "owner",
    status: "active",
    createdAt: 1,
  }));
  const projectId = await t.run((ctx) => ctx.db.insert("projects", {
    clientId,
    primaryCategory: "houseConstruction",
    city: "agadir",
    countryCode: "MA",
    title: "Villa construction",
    propertyType: "house",
    surface: 220,
    surfaceUnknown: false,
    description: "Build a family villa.",
    budgetRange: "500000_1000000",
    budgetMin: 500_000,
    budgetMax: 1_000_000,
    budgetUnknown: false,
    timeline: "three_to_six_months",
    visibility: "marketplace",
    status: "in_discussion",
    lastCompletedStep: 6,
    createdAt: 1,
    updatedAt: 1,
    submittedAt: 1,
    publishedAt: 1,
  }));
  const quoteId = await t.run((ctx) => ctx.db.insert("projectQuotes", {
    projectId,
    companyId,
    submittedByUserId: companyUserId,
    message: "We can deliver this villa with an experienced team.",
    estimatedPrice: 720_000,
    currency: "MAD",
    estimatedDuration: 150,
    availableStartDate: "2026-10-15",
    scope: "Structure, finishes, utilities, testing, and handover.",
    quoteType: "initial",
    status: "discussion_open",
    createdAt: 2,
    updatedAt: 2,
    submittedAt: 2,
  }));
  const conversationId = await t.run((ctx) => ctx.db.insert("conversations", {
    projectId,
    quoteId,
    clientId,
    companyId,
    status: "active",
    createdBy: clientId,
    createdAt: 3,
    updatedAt: 3,
  }));
  const assessmentId = await t.run((ctx) => ctx.db.insert("siteAssessments", {
    projectId,
    clientId,
    companyId,
    initialQuoteId: quoteId,
    conversationId,
    status: "invited",
    active: true,
    invitedByUserId: clientId,
    invitedAt: Date.UTC(2026, 8, 20, 9),
    createdAt: Date.UTC(2026, 8, 20, 9),
    updatedAt: Date.UTC(2026, 8, 20, 9),
  }));
  return { t, clientId, companyUserId, adminId, seoId, companyId, projectId, quoteId, conversationId, assessmentId };
}

async function seedVisit(state: Awaited<ReturnType<typeof setup>>, status: "proposed" | "confirmed" | "completed" | "declined" | "cancelled", proposedDate = "2026-09-28") {
  return await state.t.run((ctx) => ctx.db.insert("siteVisits", {
    assessmentId: state.assessmentId,
    projectId: state.projectId,
    clientId: state.clientId,
    companyId: state.companyId,
    conversationId: state.conversationId,
    initialQuoteId: state.quoteId,
    proposedByUserId: state.companyUserId,
    proposedDate,
    proposedTime: "10:00",
    timezone: "Africa/Casablanca",
    siteAddress: "18 Avenue Mohammed V, Agadir",
    status,
    active: status === "proposed" || status === "confirmed",
    proposedAt: Date.UTC(2026, 8, 21, 10),
    confirmedByUserId: status === "confirmed" || status === "completed" || status === "cancelled" ? state.clientId : undefined,
    confirmedAt: status === "confirmed" || status === "completed" || status === "cancelled" ? Date.UTC(2026, 8, 22, 10) : undefined,
    completedByUserId: status === "completed" ? state.companyUserId : undefined,
    completedAt: status === "completed" ? Date.UTC(2026, 8, 28, 12) : undefined,
    declinedByUserId: status === "declined" ? state.clientId : undefined,
    declinedAt: status === "declined" ? Date.UTC(2026, 8, 22, 10) : undefined,
    cancelledByUserId: status === "cancelled" ? state.companyUserId : undefined,
    cancelledAt: status === "cancelled" ? Date.UTC(2026, 8, 23, 10) : undefined,
    cancellationReason: status === "cancelled" ? "Client requested a scope review" : undefined,
    createdAt: Date.UTC(2026, 8, 21, 10),
    updatedAt: Date.UTC(2026, 8, 22, 10),
  }));
}

describe("admin site visit tracking", () => {
  test("allows admins and denies guests, clients, companies, and SEO team", async () => {
    const state = await setup();
    await expect(state.t.query(api.admin.siteVisits.listSiteVisits, listArgs)).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.clientId).query(api.admin.siteVisits.listSiteVisits, listArgs)).rejects.toThrow("ADMIN_REQUIRED");
    await expect(asUser(state.t, state.companyUserId).query(api.admin.siteVisits.listSiteVisits, listArgs)).rejects.toThrow("ADMIN_REQUIRED");
    await expect(asUser(state.t, state.seoId).query(api.admin.siteVisits.listSiteVisits, listArgs)).rejects.toThrow("ADMIN_REQUIRED");
    await expect(asUser(state.t, state.adminId).query(api.admin.siteVisits.listSiteVisits, listArgs)).resolves.toHaveLength(1);
  });

  test("projects the real lifecycle states and updates the read model immediately", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminId);
    expect((await admin.query(api.admin.siteVisits.listSiteVisits, listArgs))[0]).toMatchObject({ status: "invited", assessmentStatus: "invited" });

    await state.t.run((ctx) => ctx.db.patch(state.assessmentId, { status: "accepted", acceptedAt: Date.UTC(2026, 8, 20, 12), acceptedMarketplaceTermsAt: Date.UTC(2026, 8, 20, 12) }));
    expect((await admin.query(api.admin.siteVisits.listSiteVisits, listArgs))[0]).toMatchObject({ status: "accepted", riskSignal: "scheduling_pending" });

    const visitId = await seedVisit(state, "proposed");
    expect((await admin.query(api.admin.siteVisits.listSiteVisits, listArgs))[0]).toMatchObject({ status: "proposed", proposedBy: "company", riskSignal: null });

    await state.t.run((ctx) => ctx.db.patch(visitId, { status: "confirmed", confirmedByUserId: state.clientId, confirmedAt: Date.UTC(2026, 8, 22, 10) }));
    expect((await admin.query(api.admin.siteVisits.listSiteVisits, listArgs))[0]).toMatchObject({ status: "confirmed" });

    await state.t.run((ctx) => ctx.db.patch(visitId, { proposedDate: "2026-09-20" }));
    expect((await admin.query(api.admin.siteVisits.listSiteVisits, listArgs))[0]).toMatchObject({ riskSignal: "visit_follow_up_needed" });

    await state.t.run((ctx) => ctx.db.patch(visitId, { status: "completed", active: false, completedByUserId: state.companyUserId, completedAt: Date.UTC(2026, 8, 20, 12) }));
    expect((await admin.query(api.admin.siteVisits.listSiteVisits, listArgs))[0]).toMatchObject({ status: "completed", finalQuoteStatus: "not_available", riskSignal: null });

    await state.t.run((ctx) => ctx.db.patch(visitId, { status: "cancelled", cancellationReason: "Scope changed" }));
    await expect(admin.query(api.admin.siteVisits.listSiteVisits, { ...listArgs, status: "cancelled_declined" })).resolves.toHaveLength(1);
  });

  test("filters by project, company, city, status, and date", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.assessmentId, { status: "accepted" }));
    await seedVisit(state, "proposed");
    const admin = asUser(state.t, state.adminId);
    const matching = { ...listArgs, status: "proposed" as const, projectSearch: "villa", companySearch: "atlas", city: "agadir" as const, dateFrom: "2026-09-28", dateTo: "2026-09-29" };
    await expect(admin.query(api.admin.siteVisits.listSiteVisits, matching)).resolves.toHaveLength(1);
    await expect(admin.query(api.admin.siteVisits.listSiteVisits, { ...matching, companySearch: "other" })).resolves.toHaveLength(0);
    await expect(admin.query(api.admin.siteVisits.listSiteVisits, { ...matching, city: "rabat" })).resolves.toHaveLength(0);
    await expect(admin.query(api.admin.siteVisits.listSiteVisits, { ...matching, dateFrom: "2026-99-99" })).rejects.toThrow("INVALID_ADMIN_SITE_VISIT_FILTER");
  });

  test("skips stale orphaned rows in the list while detail remains fail-closed", async () => {
    const state = await setup();
    await state.t.run(async (ctx) => {
      await ctx.db.delete(state.clientId);
      await ctx.db.delete(state.companyId);
    });
    const admin = asUser(state.t, state.adminId);
    await expect(admin.query(api.admin.siteVisits.listSiteVisits, listArgs)).resolves.toEqual([]);
    await expect(admin.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: state.assessmentId, now: listArgs.now })).rejects.toThrow("SITE_VISIT_INTEGRITY_ERROR");
  });

  test("returns the exact address only from the admin detail DTO", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.assessmentId, { status: "accepted", acceptedAt: 4, acceptedMarketplaceTermsAt: 4 }));
    const visitId = await seedVisit(state, "confirmed");
    await state.t.run(async (ctx) => {
      await ctx.db.insert("marketplaceActivity", {
        projectId: state.projectId,
        eventType: "site_assessment_accepted",
        actorUserId: state.companyUserId,
        actorType: "company",
        companyId: state.companyId,
        siteAssessmentId: state.assessmentId,
        oldStatus: "invited",
        newStatus: "accepted",
        createdAt: 5,
      });
      await ctx.db.insert("marketplaceActivity", {
        projectId: state.projectId,
        eventType: "site_visit_confirmed",
        actorUserId: state.clientId,
        actorType: "client",
        companyId: state.companyId,
        siteAssessmentId: state.assessmentId,
        siteVisitId: visitId,
        oldStatus: "proposed",
        newStatus: "confirmed",
        metadata: { proposedDate: "2026-09-29", proposedTime: "10:30", timezone: "Africa/Casablanca" },
        createdAt: 6,
      });
    });
    const admin = asUser(state.t, state.adminId);
    const list = await admin.query(api.admin.siteVisits.listSiteVisits, listArgs);
    expect(JSON.stringify(list)).not.toContain("18 Avenue Mohammed V");
    const detail = await admin.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: state.assessmentId, now: listArgs.now });
    expect(detail).toMatchObject({
      project: { title: "Villa construction", city: "agadir" },
      client: { displayName: "Hamza Tester", accountReference: expect.stringMatching(/^BPM-C-/) },
      company: { name: "Atlas BTP", verificationStatus: "verified", slug: "atlas-btp" },
      visit: { siteAddress: "18 Avenue Mohammed V, Agadir", status: "confirmed" },
      activity: [
        { eventType: "site_assessment_accepted", actor: { type: "company" } },
        { eventType: "site_visit_confirmed", actor: { type: "client" } },
      ],
      finalQuoteStatus: "not_available",
    });
    expect(detail?.client.accountReference).not.toContain(String(state.clientId).slice(-8).toLocaleUpperCase());
    expect(detail?.discussion.reference).not.toContain(String(state.conversationId).slice(-8).toLocaleUpperCase());
    await expect(asUser(state.t, state.clientId).query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: state.assessmentId, now: listArgs.now })).rejects.toThrow("ADMIN_REQUIRED");
  });
});
