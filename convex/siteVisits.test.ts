/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

async function seedUser(t: Backend, accountType: "client" | "company" | "admin") {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${crypto.randomUUID()}@assessment.test`, firstName: accountType, lastName: "Tester", accountType,
    countryCode: "MA", acceptedTerms: true, termsAcceptedAt: 1, marketingOptIn: false,
    onboardingStatus: "completed", createdAt: 1, updatedAt: 1,
  }));
}

async function seedCompany(t: Backend, name: string) {
  const userId = await seedUser(t, "company");
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name, slug: `${name.toLowerCase()}-${crypto.randomUUID()}`, city: "Rabat", onboardingStatus: "completed",
    verificationStatus: "verified", createdAt: 1, updatedAt: 1,
  }));
  await t.run((ctx) => ctx.db.insert("companyMembers", { companyId, userId, role: "owner", status: "active", createdAt: 1 }));
  return { userId, companyId };
}

async function seedProject(t: Backend, clientId: Id<"users">) {
  return await t.run((ctx) => ctx.db.insert("projects", {
    clientId, primaryCategory: "renovation", city: "rabat", countryCode: "MA", title: "Riad renovation",
    propertyType: "house", surface: 180, surfaceUnknown: false, description: "Complete renovation.",
    budgetRange: "250000_500000", budgetMin: 250_000, budgetMax: 500_000, budgetUnknown: false,
    timeline: "one_to_three_months", visibility: "marketplace", status: "published", lastCompletedStep: 6,
    createdAt: 1, updatedAt: 1, submittedAt: 1, publishedAt: 1,
  }));
}

async function seedQuote(t: Backend, projectId: Id<"projects">, company: { companyId: Id<"companies">; userId: Id<"users"> }) {
  return await t.run((ctx) => ctx.db.insert("projectQuotes", {
    projectId, companyId: company.companyId, submittedByUserId: company.userId,
    message: "We can complete the work with a qualified team.", estimatedPrice: 320_000, currency: "MAD",
    estimatedDuration: 75, availableStartDate: "2099-01-01", scope: "Survey, build, finish and clean.",
    quoteType: "initial", status: "submitted", createdAt: 1, updatedAt: 1, submittedAt: 1,
  }));
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function setup() {
  const t = convexTest(schema, modules);
  const clientId = await seedUser(t, "client");
  const otherClientId = await seedUser(t, "client");
  const company = await seedCompany(t, "Atlas Build");
  const otherCompany = await seedCompany(t, "Rif Build");
  const projectId = await seedProject(t, clientId);
  const quoteId = await seedQuote(t, projectId, company);
  const opened = await asUser(t, clientId).mutation(api.quotes.index.reviewInitialQuote, { quoteId, action: "open_discussion" });
  return { t, clientId, otherClientId, company, otherCompany, projectId, quoteId, conversationId: opened.conversationId! };
}

describe("controlled site assessment selection", () => {
  test("only the project owner can invite from a discussion and the request is idempotent", async () => {
    const state = await setup();
    const adminId = await seedUser(state.t, "admin");
    await expect(state.t.mutation(api.siteVisits.index.invite, { conversationId: state.conversationId })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId })).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    await expect(asUser(state.t, adminId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId })).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    await expect(asUser(state.t, state.otherClientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId })).rejects.toThrow("PROJECT_NOT_FOUND");
    const first = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId, clientNote: "  Please inspect the roof.  " });
    const second = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId });
    expect(first.duplicate).toBe(false);
    expect(second).toEqual({ assessmentId: first.assessmentId, status: "invited", duplicate: true });
    const rows = await state.t.run((ctx) => ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", (q) => q.eq("projectId", state.projectId).eq("active", true)).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].clientNote).toBe("Please inspect the roof.");
  });

  test.each(["submitted", "viewed", "shortlisted", "declined", "withdrawn"] as const)("rejects an invitation when the quote is %s", async (status) => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.patch(state.quoteId, { status }));
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId })).rejects.toThrow("SITE_ASSESSMENT_REQUIRES_DISCUSSION");
  });

  test("only the selected company responds, acceptance is idempotent, and invalid transitions fail", async () => {
    const state = await setup();
    const invited = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId });
    await expect(asUser(state.t, state.otherCompany.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" })).rejects.toThrow("SITE_ASSESSMENT_NOT_FOUND");
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" })).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    expect(await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" })).toEqual({ status: "accepted", duplicate: false });
    expect(await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" })).toEqual({ status: "accepted", duplicate: true });
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "decline" })).rejects.toThrow("INVALID_SITE_ASSESSMENT_TRANSITION");
    const stored = await state.t.run((ctx) => ctx.db.get(invited.assessmentId));
    expect(stored?.acceptedMarketplaceTermsAt).toEqual(expect.any(Number));
  });

  test("revokes assessment access when the selected company membership becomes inactive", async () => {
    const state = await setup();
    const invited = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId });
    await state.t.run(async (ctx) => {
      const membership = await ctx.db.query("companyMembers").withIndex("by_companyId_and_userId", (q) => q.eq("companyId", state.company.companyId).eq("userId", state.company.userId)).unique();
      if (!membership) throw new Error("Missing test membership");
      await ctx.db.patch(membership._id, { status: "inactive" });
    });
    await expect(asUser(state.t, state.company.userId).query(api.siteVisits.index.getForConversation, { conversationId: state.conversationId })).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" })).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
  });

  test("enforces one active company and allows another only after decline", async () => {
    const state = await setup();
    const otherQuoteId = await seedQuote(state.t, state.projectId, state.otherCompany);
    const otherConversation = await asUser(state.t, state.clientId).mutation(api.quotes.index.reviewInitialQuote, { quoteId: otherQuoteId, action: "open_discussion" });
    const first = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId });
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: otherConversation.conversationId! })).rejects.toThrow("ACTIVE_SITE_ASSESSMENT_ALREADY_EXISTS");
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: first.assessmentId, decision: "decline" });
    const declineActivity = await state.t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", state.projectId)).collect());
    expect(declineActivity.some((row) => row.eventType === "site_assessment_declined" && row.siteAssessmentId === first.assessmentId)).toBe(true);
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: otherConversation.conversationId! })).resolves.toMatchObject({ status: "invited", duplicate: false });
  });

  test("keeps the exact address private until acceptance and scopes all reads", async () => {
    const state = await setup();
    const invited = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId });
    const rawBefore = await state.t.run(async (ctx) => { await ctx.db.patch(invited.assessmentId, { siteAddress: "12 Secret Avenue, Rabat" }); return await ctx.db.get(invited.assessmentId); });
    expect(rawBefore?.siteAddress).toBeTruthy();
    await expect(state.t.query(api.siteVisits.index.getForConversation, { conversationId: state.conversationId })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(state.t.query(api.siteVisits.index.getForProject, { projectId: state.projectId })).rejects.toThrow("NOT_AUTHENTICATED");
    expect((await asUser(state.t, state.company.userId).query(api.siteVisits.index.getForConversation, { conversationId: state.conversationId })).assessment?.siteAddress).toBeNull();
    await expect(asUser(state.t, state.otherCompany.userId).query(api.siteVisits.index.getForConversation, { conversationId: state.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(asUser(state.t, state.otherClientId).query(api.siteVisits.index.getForProject, { projectId: state.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" });
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.schedule, { assessmentId: invited.assessmentId, scheduledAt: Date.now() + 86_400_000, siteAddress: "18 Avenue Mohammed V, Rabat", clientNote: "Ring at reception" });
    const companyView = await asUser(state.t, state.company.userId).query(api.siteVisits.index.getForProject, { projectId: state.projectId });
    expect(companyView.assessment?.siteAddress).toBe("18 Avenue Mohammed V, Rabat");
    expect(companyView.assessment).not.toHaveProperty("clientId");
    expect(companyView.assessment).not.toHaveProperty("email");
    expect(companyView.assessment).not.toHaveProperty("phone");
  });

  test("records the lifecycle in the shared marketplace activity stream and releases the project on completion", async () => {
    const state = await setup();
    const adminId = await seedUser(state.t, "admin");
    const invited = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId });
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" });
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.schedule, { assessmentId: invited.assessmentId, scheduledAt: Date.now() + 86_400_000, siteAddress: "18 Avenue Mohammed V, Rabat" });
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.complete, { assessmentId: invited.assessmentId });
    const stored = await state.t.run(async (ctx) => ({
      assessment: await ctx.db.get(invited.assessmentId),
      activity: await ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", state.projectId)).collect(),
      active: await ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", (q) => q.eq("projectId", state.projectId).eq("active", true)).collect(),
    }));
    expect(stored.assessment).toMatchObject({ status: "completed", active: false });
    expect(stored.active).toEqual([]);
    expect(stored.activity.map((row) => row.eventType)).toEqual(expect.arrayContaining(["discussion_opened", "site_assessment_invited", "site_assessment_accepted", "site_visit_scheduled", "site_visit_completed"]));
    expect(stored.activity.filter((row) => row.siteAssessmentId === invited.assessmentId)).toHaveLength(4);
    const adminTimeline = await asUser(state.t, adminId).query(api.admin.projects.listProjectActivity, { projectId: state.projectId });
    expect(adminTimeline.filter((row) => row.siteAssessmentId === invited.assessmentId).map((row) => row.eventType)).toEqual([
      "site_assessment_invited", "site_assessment_accepted", "site_visit_scheduled", "site_visit_completed",
    ]);
    expect((await asUser(state.t, adminId).query(api.siteVisits.index.getForProject, { projectId: state.projectId })).assessment?.siteAddress).toBe("18 Avenue Mohammed V, Rabat");
  });

  test("allows either participant to cancel accepted or scheduled assessments but rejects invited cancellation", async () => {
    const state = await setup();
    const invited = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.invite, { conversationId: state.conversationId });
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.cancel, { assessmentId: invited.assessmentId })).rejects.toThrow("INVALID_SITE_ASSESSMENT_TRANSITION");
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "accept" });
    await expect(asUser(state.t, state.otherCompany.userId).mutation(api.siteVisits.index.cancel, { assessmentId: invited.assessmentId })).rejects.toThrow("SITE_ASSESSMENT_NOT_FOUND");
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.cancel, { assessmentId: invited.assessmentId })).resolves.toEqual({ status: "cancelled" });
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.cancel, { assessmentId: invited.assessmentId })).rejects.toThrow("INVALID_SITE_ASSESSMENT_TRANSITION");
    const cancelActivity = await state.t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", state.projectId)).collect());
    expect(cancelActivity.some((row) => row.eventType === "site_assessment_cancelled" && row.siteAssessmentId === invited.assessmentId)).toBe(true);
  });
});
