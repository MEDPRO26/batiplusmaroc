/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` });
}

async function user(t: Backend, accountType: "client" | "company" | "admin" | "seo_team") {
  return await t.run((ctx) => ctx.db.insert("users", { email: `${crypto.randomUUID()}@final.test`, firstName: "Test", lastName: accountType,
    accountType, onboardingStatus: "completed", countryCode: "MA", createdAt: 1, updatedAt: 1 }));
}

async function setup() {
  const t = convexTest(schema, modules); const clientId = await user(t, "client"); const otherClientId = await user(t, "client");
  const companyUserId = await user(t, "company"); const competitorUserId = await user(t, "company"); const seoId = await user(t, "seo_team"); const adminId = await user(t, "admin");
  const companyId = await t.run((ctx) => ctx.db.insert("companies", { name: "Atlas Build", slug: "atlas-build", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1 }));
  const competitorId = await t.run((ctx) => ctx.db.insert("companies", { name: "Rival Build", slug: "rival-build", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1 }));
  await t.run(async (ctx) => { await ctx.db.insert("companyMembers", { companyId, userId: companyUserId, role: "owner", status: "active", createdAt: 1 }); await ctx.db.insert("companyMembers", { companyId: competitorId, userId: competitorUserId, role: "owner", status: "active", createdAt: 1 }); });
  const projectId = await t.run((ctx) => ctx.db.insert("projects", { clientId, primaryCategory: "renovation", city: "rabat", countryCode: "MA", title: "Villa renovation", propertyType: "house", surface: 200, surfaceUnknown: false, description: "Complete renovation project with structural and finishing work.", budgetRange: "250000_500000", budgetMin: 250000, budgetMax: 500000, budgetUnknown: false, timeline: "one_to_three_months", visibility: "marketplace", status: "published", lastCompletedStep: 6, createdAt: 1, updatedAt: 1, submittedAt: 1, publishedAt: 1 }));
  const initialQuoteId = await t.run((ctx) => ctx.db.insert("projectQuotes", { projectId, companyId, submittedByUserId: companyUserId, message: "We are ready to deliver this complete project.", estimatedPrice: 400000, currency: "MAD", estimatedDuration: 90, availableStartDate: "2099-01-01", scope: "Complete construction and finishing scope for the property.", quoteType: "initial", status: "discussion_open", createdAt: 2, updatedAt: 2, submittedAt: 2 }));
  const conversationId = await t.run((ctx) => ctx.db.insert("conversations", { projectId, quoteId: initialQuoteId, clientId, companyId, status: "active", createdBy: clientId, createdAt: 3, updatedAt: 3 }));
  return { t, clientId, otherClientId, companyUserId, competitorUserId, seoId, adminId, companyId, projectId, initialQuoteId, conversationId };
}

const revision = {
  price: 380000, duration: 75, plannedStartDate: "2099-02-01", validUntil: "2099-12-31",
  scope: "Complete structural renovation, finishing, coordination, and final site cleanup.",
  inclusions: "Labour, materials, supervision, cleanup, and final handover.", exclusions: "Municipal fees and owner-supplied appliances.",
  paymentTerms: "Twenty percent on signature, monthly milestones, and ten percent at handover.", companyNote: "Prepared after the detailed discussion.",
} satisfies Omit<FunctionArgs<typeof api.finalQuotes.index.submitRevision>, "conversationId" | "pdf">;

describe("final quote request and privacy", () => {
  test("owner request is idempotent and creates one trusted activity", async () => {
    const s = await setup(); const c = asUser(s.t, s.clientId);
    const first = await c.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    const second = await c.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    expect(second).toEqual({ finalQuoteId: first.finalQuoteId, duplicate: true });
    const state = await s.t.run(async (ctx) => ({ parents: await ctx.db.query("finalQuotes").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", s.projectId).eq("companyId", s.companyId)).take(10), events: await ctx.db.query("marketplaceActivity").withIndex("by_finalQuoteId_and_createdAt", (q) => q.eq("finalQuoteId", first.finalQuoteId)).take(10) }));
    expect(state.parents).toHaveLength(1); expect(state.events.map((e) => e.eventType)).toEqual(["final_quote_requested"]);
  });

  test("wrong client, company, SEO, and anonymous callers cannot read or request", async () => {
    const s = await setup();
    await expect(asUser(s.t, s.otherClientId).mutation(api.finalQuotes.index.request, { conversationId: s.conversationId })).rejects.toThrow("PROJECT_NOT_FOUND");
    await expect(asUser(s.t, s.competitorUserId).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(s.t, s.seoId).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(s.t.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("company cannot self-trigger without a client request or completed related visit", async () => {
    const s = await setup();
    await expect(asUser(s.t, s.companyUserId).mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision })).rejects.toThrow("FINAL_QUOTE_NOT_REQUESTED");
  });

  test("wrong and unverified companies cannot submit for the relationship", async () => {
    const s = await setup();
    await asUser(s.t, s.clientId).mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    await expect(asUser(s.t, s.competitorUserId).mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await s.t.run((ctx) => ctx.db.patch(s.companyId, { verificationStatus: "pending" }));
    await expect(asUser(s.t, s.companyUserId).mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision })).rejects.toThrow("COMPANY_VERIFICATION_REQUIRED");
  });
});

describe("immutable revision state machine", () => {
  test("request, submit, request changes, revise, and accept select the company atomically", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId); const company = asUser(s.t, s.companyUserId);
    const requested = await client.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    const first = await company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision });
    await client.mutation(api.finalQuotes.index.review, { finalQuoteId: requested.finalQuoteId, revisionId: first.revisionId, action: "request_changes", reason: "Remove the pool work and revise the final price." });
    const second = await company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision, price: 350000, scope: `${revision.scope} Pool work is excluded.` });
    await expect(client.mutation(api.finalQuotes.index.review, { finalQuoteId: requested.finalQuoteId, revisionId: first.revisionId, action: "accept" })).rejects.toThrow("FINAL_QUOTE_REVISION_NOT_CURRENT");
    await client.mutation(api.finalQuotes.index.review, { finalQuoteId: requested.finalQuoteId, revisionId: second.revisionId, action: "accept" });
    const state = await s.t.run(async (ctx) => ({ project: await ctx.db.get(s.projectId), parent: await ctx.db.get(requested.finalQuoteId), first: await ctx.db.get(first.revisionId), second: await ctx.db.get(second.revisionId), events: await ctx.db.query("marketplaceActivity").withIndex("by_finalQuoteId_and_createdAt", (q) => q.eq("finalQuoteId", requested.finalQuoteId)).order("asc").take(20) }));
    expect(state.first).toMatchObject({ revisionNumber: 1, price: 380000 }); expect(state.second).toMatchObject({ revisionNumber: 2, price: 350000 });
    expect(state.parent).toMatchObject({ status: "accepted", currentRevisionId: second.revisionId, acceptedRevisionId: second.revisionId });
    expect(state.project).toMatchObject({ status: "company_selected", selectedCompanyId: s.companyId, selectedFinalQuoteId: requested.finalQuoteId });
    expect(state.events.map((event) => event.eventType)).toEqual(["final_quote_requested", "final_quote_submitted", "final_quote_changes_requested", "final_quote_revised", "final_quote_accepted", "company_selected"]);
  });

  test("change reason is required and accepted quotes are terminal", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId); const company = asUser(s.t, s.companyUserId);
    const parent = await client.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId }); const submitted = await company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision });
    await expect(client.mutation(api.finalQuotes.index.review, { finalQuoteId: parent.finalQuoteId, revisionId: submitted.revisionId, action: "request_changes", reason: " " })).rejects.toThrow("FINAL_QUOTE_CHANGE_REASON_REQUIRED");
    await client.mutation(api.finalQuotes.index.review, { finalQuoteId: parent.finalQuoteId, revisionId: submitted.revisionId, action: "accept" });
    await expect(client.mutation(api.finalQuotes.index.review, { finalQuoteId: parent.finalQuoteId, revisionId: submitted.revisionId, action: "decline" })).rejects.toThrow("FINAL_QUOTE_NOT_REVIEWABLE");
    await expect(company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision })).rejects.toThrow("FINAL_QUOTE_PROJECT_NOT_ELIGIBLE");
  });

  test("acceptance revalidates that the selected company still has an active member", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId); const company = asUser(s.t, s.companyUserId);
    const parent = await client.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    const submitted = await company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision });
    await s.t.run(async (ctx) => {
      const membership = await ctx.db.query("companyMembers").withIndex("by_companyId_and_userId", (q) => q.eq("companyId", s.companyId).eq("userId", s.companyUserId)).unique();
      if (!membership) throw new Error("missing membership");
      await ctx.db.patch(membership._id, { status: "inactive" });
    });
    await expect(client.mutation(api.finalQuotes.index.review, { finalQuoteId: parent.finalQuoteId, revisionId: submitted.revisionId, action: "accept" })).rejects.toThrow("FINAL_QUOTE_NOT_REVIEWABLE");
    const state = await s.t.run(async (ctx) => ({ project: await ctx.db.get(s.projectId), parent: await ctx.db.get(parent.finalQuoteId), events: await ctx.db.query("marketplaceActivity").withIndex("by_finalQuoteId_and_createdAt", (q) => q.eq("finalQuoteId", parent.finalQuoteId)).take(20) }));
    expect(state.project?.selectedCompanyId).toBeUndefined(); expect(state.parent?.status).toBe("submitted"); expect(state.events.filter((event) => event.eventType === "company_selected")).toHaveLength(0);
  });

  test("expired revision cannot be accepted", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId); const company = asUser(s.t, s.companyUserId);
    const parent = await client.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    const submitted = await company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision });
    await s.t.run((ctx) => ctx.db.patch(submitted.revisionId, { validUntil: "2000-01-01" }));
    await expect(client.mutation(api.finalQuotes.index.review, { finalQuoteId: parent.finalQuoteId, revisionId: submitted.revisionId, action: "accept" })).rejects.toThrow("FINAL_QUOTE_EXPIRED");
  });

  test("owning company can withdraw submitted quote and cannot reopen it", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId); const company = asUser(s.t, s.companyUserId);
    const parent = await client.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId }); await company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision });
    await company.mutation(api.finalQuotes.index.withdraw, { finalQuoteId: parent.finalQuoteId, reason: "Capacity changed." });
    await expect(company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision })).rejects.toThrow("FINAL_QUOTE_NOT_SUBMITTABLE");
  });

  test("client can decline the latest submitted quote and decline is terminal", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId); const company = asUser(s.t, s.companyUserId);
    const parent = await client.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    const submitted = await company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision });
    await client.mutation(api.finalQuotes.index.review, { finalQuoteId: parent.finalQuoteId, revisionId: submitted.revisionId, action: "decline", reason: "The final commercial terms do not fit the approved budget." });
    await expect(client.mutation(api.finalQuotes.index.review, { finalQuoteId: parent.finalQuoteId, revisionId: submitted.revisionId, action: "accept" })).rejects.toThrow("FINAL_QUOTE_NOT_REVIEWABLE");
    await expect(company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision })).rejects.toThrow("FINAL_QUOTE_NOT_SUBMITTABLE");
    const state = await s.t.run(async (ctx) => ({ parent: await ctx.db.get(parent.finalQuoteId), events: await ctx.db.query("marketplaceActivity").withIndex("by_finalQuoteId_and_createdAt", (q) => q.eq("finalQuoteId", parent.finalQuoteId)).order("asc").take(10) }));
    expect(state.parent).toMatchObject({ status: "declined", declinedByUserId: s.clientId, declineReason: "The final commercial terms do not fit the approved budget." });
    expect(state.events.map((event) => event.eventType)).toEqual(["final_quote_requested", "final_quote_submitted", "final_quote_declined"]);
  });

  test("admin receives the safe revision and price activity projection", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId); const company = asUser(s.t, s.companyUserId);
    const parent = await client.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    const submitted = await company.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision });
    const activity = await asUser(s.t, s.adminId).query(api.admin.projects.listProjectActivity, { projectId: s.projectId });
    const row = activity.find((item) => item.eventType === "final_quote_submitted");
    expect(row).toMatchObject({ finalQuoteId: parent.finalQuoteId, finalQuoteRevisionId: submitted.revisionId, company: { id: s.companyId }, metadata: { revisionNumber: 1, price: revision.price, currency: "MAD" } });
    expect(JSON.stringify(row)).not.toContain("paymentTerms"); expect(JSON.stringify(row)).not.toContain("pdfStorageId");
  });
});

describe("site visit lifecycle gating", () => {
  test("confirmed visit blocks client request and company submit", async () => {
    const s = await setup();
    const assessmentId = await s.t.run((ctx) =>
      ctx.db.insert("siteAssessments", {
        projectId: s.projectId, clientId: s.clientId, companyId: s.companyId, initialQuoteId: s.initialQuoteId,
        conversationId: s.conversationId, status: "accepted", active: true, invitedByUserId: s.clientId,
        invitedAt: 10, acceptedAt: 11, createdAt: 10, updatedAt: 11,
      }),
    );
    await s.t.run((ctx) =>
      ctx.db.insert("siteVisits", {
        assessmentId, projectId: s.projectId, clientId: s.clientId, companyId: s.companyId,
        conversationId: s.conversationId, initialQuoteId: s.initialQuoteId, proposedByUserId: s.companyUserId,
        proposedDate: "2099-09-26", proposedTime: "17:32", timezone: "Africa/Casablanca",
        siteAddress: "12 Test Street, Casablanca", status: "confirmed", active: true,
        proposedAt: 12, confirmedByUserId: s.clientId, confirmedAt: 13, createdAt: 12, updatedAt: 13,
      }),
    );
    await expect(
      asUser(s.t, s.clientId).mutation(api.finalQuotes.index.request, { conversationId: s.conversationId }),
    ).rejects.toThrow("FINAL_QUOTE_SITE_VISIT_INCOMPLETE");
    await expect(
      asUser(s.t, s.companyUserId).mutation(api.finalQuotes.index.submitRevision, {
        conversationId: s.conversationId,
        ...revision,
      }),
    ).rejects.toThrow("FINAL_QUOTE_SITE_VISIT_INCOMPLETE");
  });

  test("proposed visit and accepted assessment without completion block final quote", async () => {
    const s = await setup();
    const assessmentId = await s.t.run((ctx) =>
      ctx.db.insert("siteAssessments", {
        projectId: s.projectId, clientId: s.clientId, companyId: s.companyId, initialQuoteId: s.initialQuoteId,
        conversationId: s.conversationId, status: "accepted", active: true, invitedByUserId: s.clientId,
        invitedAt: 10, acceptedAt: 11, createdAt: 10, updatedAt: 11,
      }),
    );
    await expect(
      asUser(s.t, s.clientId).mutation(api.finalQuotes.index.request, { conversationId: s.conversationId }),
    ).rejects.toThrow("FINAL_QUOTE_SITE_VISIT_INCOMPLETE");

    await s.t.run((ctx) =>
      ctx.db.insert("siteVisits", {
        assessmentId, projectId: s.projectId, clientId: s.clientId, companyId: s.companyId,
        conversationId: s.conversationId, initialQuoteId: s.initialQuoteId, proposedByUserId: s.clientId,
        proposedDate: "2099-09-26", proposedTime: "10:00", timezone: "Africa/Casablanca",
        siteAddress: "12 Test Street, Casablanca", status: "proposed", active: true,
        proposedAt: 12, createdAt: 12, updatedAt: 12,
      }),
    );
    await expect(
      asUser(s.t, s.companyUserId).mutation(api.finalQuotes.index.submitRevision, {
        conversationId: s.conversationId,
        ...revision,
      }),
    ).rejects.toThrow("FINAL_QUOTE_SITE_VISIT_INCOMPLETE");
  });

  test("a visit started after the client request still blocks submission", async () => {
    const s = await setup();
    await asUser(s.t, s.clientId).mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    const assessmentId = await s.t.run((ctx) => ctx.db.insert("siteAssessments", {
      projectId: s.projectId, clientId: s.clientId, companyId: s.companyId, initialQuoteId: s.initialQuoteId,
      conversationId: s.conversationId, status: "accepted", active: true, invitedByUserId: s.clientId,
      invitedAt: 10, acceptedAt: 11, createdAt: 10, updatedAt: 11,
    }));
    await s.t.run((ctx) => ctx.db.insert("siteVisits", {
      assessmentId, projectId: s.projectId, clientId: s.clientId, companyId: s.companyId,
      conversationId: s.conversationId, initialQuoteId: s.initialQuoteId, proposedByUserId: s.clientId,
      proposedDate: "2099-09-26", proposedTime: "10:00", timezone: "Africa/Casablanca",
      siteAddress: "12 Test Street, Casablanca", status: "proposed", active: true,
      proposedAt: 12, createdAt: 12, updatedAt: 12,
    }));
    await expect(asUser(s.t, s.companyUserId).mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision })).rejects.toThrow("FINAL_QUOTE_SITE_VISIT_INCOMPLETE");
  });

  test("admin list and detail expose real final quote status and amount", async () => {
    const s = await setup();
    const client = asUser(s.t, s.clientId);
    const company = asUser(s.t, s.companyUserId);
    const admin = asUser(s.t, s.adminId);
    const assessmentId = await s.t.run((ctx) =>
      ctx.db.insert("siteAssessments", {
        projectId: s.projectId, clientId: s.clientId, companyId: s.companyId, initialQuoteId: s.initialQuoteId,
        conversationId: s.conversationId, status: "accepted", active: true, invitedByUserId: s.clientId,
        invitedAt: 10, acceptedAt: 11, createdAt: 10, updatedAt: 11,
      }),
    );
    await s.t.run((ctx) =>
      ctx.db.insert("siteVisits", {
        assessmentId, projectId: s.projectId, clientId: s.clientId, companyId: s.companyId,
        conversationId: s.conversationId, initialQuoteId: s.initialQuoteId, proposedByUserId: s.clientId,
        proposedDate: "2020-01-01", proposedTime: "10:00", timezone: "Africa/Casablanca",
        siteAddress: "10 Test Street, Rabat", status: "completed", active: false,
        proposedAt: 12, completedByUserId: s.clientId, completedAt: 13, createdAt: 12, updatedAt: 13,
      }),
    );
    const requested = await company.mutation(api.finalQuotes.index.prepareAfterSiteVisit, {
      conversationId: s.conversationId,
    });
    const submitted = await company.mutation(api.finalQuotes.index.submitRevision, {
      conversationId: s.conversationId,
      ...revision,
      price: 2_000_000,
    });
    await client.mutation(api.finalQuotes.index.review, {
      finalQuoteId: requested.finalQuoteId,
      revisionId: submitted.revisionId,
      action: "accept",
    });
    const list = await admin.query(api.admin.siteVisits.listSiteVisits, {
      status: "all",
      now: Date.now(),
    });
    const row = list.find((item) => item.assessmentId === assessmentId);
    expect(row?.finalQuoteStatus).toBe("accepted");
    const detail = await admin.query(api.admin.siteVisits.getSiteVisitDetail, {
      assessmentId,
      now: Date.now(),
    });
    expect(detail?.finalQuote).toMatchObject({
      status: "accepted",
      revisionNumber: 1,
      price: 2_000_000,
      companySelected: true,
    });
    expect(detail?.activity.map((item) => item.eventType)).toEqual(
      expect.arrayContaining([
        "final_quote_requested",
        "final_quote_submitted",
        "final_quote_accepted",
        "company_selected",
      ]),
    );
  });
});

describe("completed visit and private PDF", () => {
  test("a completed related visit is a trusted trigger and records request before submission", async () => {
    const s = await setup();
    const assessmentId = await s.t.run((ctx) => ctx.db.insert("siteAssessments", { projectId: s.projectId, clientId: s.clientId, companyId: s.companyId, initialQuoteId: s.initialQuoteId, conversationId: s.conversationId, status: "accepted", active: true, invitedByUserId: s.clientId, invitedAt: 10, acceptedAt: 11, createdAt: 10, updatedAt: 11 }));
    await s.t.run((ctx) => ctx.db.insert("siteVisits", { assessmentId, projectId: s.projectId, clientId: s.clientId, companyId: s.companyId, conversationId: s.conversationId, initialQuoteId: s.initialQuoteId, proposedByUserId: s.clientId, proposedDate: "2020-01-01", proposedTime: "10:00", timezone: "Africa/Casablanca", siteAddress: "10 Test Street, Rabat", status: "completed", active: false, proposedAt: 12, completedByUserId: s.clientId, completedAt: 13, createdAt: 12, updatedAt: 13 }));
    const result = await asUser(s.t, s.companyUserId).mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision });
    const events = await s.t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_finalQuoteId_and_createdAt", (q) => q.eq("finalQuoteId", result.finalQuoteId)).order("asc").take(10));
    expect(events.map((event) => event.eventType)).toEqual(["final_quote_requested", "final_quote_submitted"]);
  });

  test("PDF metadata is private and download is participant-only", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId); const company = asUser(s.t, s.companyUserId);
    const parent = await client.mutation(api.finalQuotes.index.request, { conversationId: s.conversationId });
    const storageId = await s.t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.4"], { type: "application/pdf" })));
    const revisionId = await s.t.run(async (ctx) => { const now = Date.now(); const id = await ctx.db.insert("finalQuoteRevisions", { finalQuoteId: parent.finalQuoteId, revisionNumber: 1, ...revision, currency: "MAD", pdfStorageId: storageId, pdfFileName: "devis-final.pdf", pdfSize: 8, submittedByUserId: s.companyUserId, submittedAt: now, createdAt: now }); await ctx.db.patch(parent.finalQuoteId, { status: "submitted", currentRevisionId: id, updatedAt: now }); return id; });
    const expectedPath = `/api/final-quotes/${revisionId}/pdf`;
    await expect(client.query(api.finalQuotes.index.getPdfDownloadUrl, { revisionId })).resolves.toBe(expectedPath);
    await expect(company.query(api.finalQuotes.index.getPdfDownloadUrl, { revisionId })).resolves.toBe(expectedPath);
    await expect(asUser(s.t, s.adminId).query(api.finalQuotes.index.getPdfDownloadUrl, { revisionId })).resolves.toBe(expectedPath);
    await expect(asUser(s.t, s.otherClientId).query(api.finalQuotes.index.getPdfDownloadUrl, { revisionId })).rejects.toThrow("FINAL_QUOTE_NOT_FOUND");
    await expect(asUser(s.t, s.competitorUserId).query(api.finalQuotes.index.getPdfDownloadUrl, { revisionId })).rejects.toThrow("FINAL_QUOTE_NOT_FOUND");
    await expect(asUser(s.t, s.seoId).query(api.finalQuotes.index.getPdfDownloadUrl, { revisionId })).rejects.toThrow("FINAL_QUOTE_NOT_FOUND");
    await expect(s.t.query(api.finalQuotes.index.getPdfDownloadUrl, { revisionId })).rejects.toThrow("NOT_AUTHENTICATED");
    const dto = await client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
    expect(dto.finalQuote?.revisions[0]).toMatchObject({ hasPdf: true, pdfFileName: "devis-final.pdf" }); expect(dto.finalQuote?.revisions[0]).not.toHaveProperty("pdfStorageId");
  });
});
