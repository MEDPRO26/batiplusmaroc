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
    email: `${crypto.randomUUID()}@visit.test`, firstName: accountType, lastName: "Tester", accountType,
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
  const membershipId = await t.run((ctx) => ctx.db.insert("companyMembers", { companyId, userId, role: "owner", status: "active", createdAt: 1 }));
  return { userId, companyId, membershipId };
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

function futureSchedule(days = 2, hour = 10) {
  const instant = Date.now() + days * 24 * 60 * 60_000;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  return { proposedDate: `${parts.year}-${parts.month}-${parts.day}`, proposedTime: `${String(hour).padStart(2, "0")}:00`, timezone: "Africa/Casablanca" as const, siteAddress: "18 Avenue Mohammed V, Rabat" };
}

async function makeVisitDue(t: Backend, visitId: Id<"siteVisits">) {
  const past = Date.now() - 2 * 24 * 60 * 60_000;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(past).map((part) => [part.type, part.value]));
  const proposedDate = `${parts.year}-${parts.month}-${parts.day}`;
  await t.run(async (ctx) => {
    const visit = await ctx.db.get(visitId);
    if (!visit?.currentProposalId) throw new Error("Missing visit proposal");
    await ctx.db.patch(visitId, { proposedDate });
    await ctx.db.patch(visit.currentProposalId, { proposedDate });
  });
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
  const invited = await asUser(t, clientId).mutation(api.siteVisits.index.invite, { conversationId: opened.conversationId! });
  return { t, clientId, otherClientId, company, otherCompany, projectId, quoteId, conversationId: opened.conversationId!, assessmentId: invited.assessmentId };
}

async function acceptedSetup() {
  const state = await setup();
  await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: state.assessmentId, decision: "accept" });
  return state;
}

describe("site visit scheduling", () => {
  test("requires an accepted assessment and rejects invited or declined assessments", async () => {
    const invited = await setup();
    await expect(asUser(invited.t, invited.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: invited.assessmentId, ...futureSchedule() })).rejects.toThrow("SITE_VISIT_REQUIRES_ACCEPTED_ASSESSMENT");
    await asUser(invited.t, invited.company.userId).mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "decline" });
    await expect(asUser(invited.t, invited.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: invited.assessmentId, ...futureSchedule() })).rejects.toThrow("SITE_VISIT_REQUIRES_ACCEPTED_ASSESSMENT");
  });

  test("blocks unauthenticated, wrong client, wrong company, and inactive company membership", async () => {
    const state = await acceptedSetup();
    const args = { assessmentId: state.assessmentId, ...futureSchedule() };
    await expect(state.t.mutation(api.siteVisits.index.proposeVisit, args)).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.otherClientId).mutation(api.siteVisits.index.proposeVisit, args)).rejects.toThrow("SITE_ASSESSMENT_NOT_FOUND");
    await expect(asUser(state.t, state.otherCompany.userId).mutation(api.siteVisits.index.proposeVisit, args)).rejects.toThrow("SITE_ASSESSMENT_NOT_FOUND");
    await state.t.run((ctx) => ctx.db.patch(state.company.membershipId, { status: "inactive" }));
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, args)).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.proposeVisit, args)).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");
  });

  test("client and company can each create a proposal for an accepted assessment", async () => {
    const clientState = await acceptedSetup();
    const clientVisit = await asUser(clientState.t, clientState.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: clientState.assessmentId, ...futureSchedule() });
    expect(clientVisit).toMatchObject({ status: "proposed", duplicate: false, rescheduled: false });

    const companyState = await acceptedSetup();
    const companyVisit = await asUser(companyState.t, companyState.company.userId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: companyState.assessmentId, ...futureSchedule() });
    expect(companyVisit).toMatchObject({ status: "proposed", duplicate: false, rescheduled: false });
  });

  test("validates future Morocco date/time and reasonable range on the backend", async () => {
    const state = await acceptedSetup();
    const base = { assessmentId: state.assessmentId, timezone: "Africa/Casablanca" as const, siteAddress: "18 Avenue Mohammed V, Rabat" };
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { ...base, proposedDate: "2020-01-01", proposedTime: "10:00" })).rejects.toThrow("INVALID_SITE_VISIT_DATE");
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { ...base, proposedDate: "2027-99-99", proposedTime: "25:61" })).rejects.toThrow("INVALID_SITE_VISIT_DATE");
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { ...base, proposedDate: "2099-01-01", proposedTime: "10:00" })).rejects.toThrow("INVALID_SITE_VISIT_DATE");
  });

  test("duplicate proposal is idempotent and only one active visit is created", async () => {
    const state = await acceptedSetup();
    const args = { assessmentId: state.assessmentId, ...futureSchedule() };
    const first = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, args);
    const duplicate = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, args);
    expect(duplicate).toEqual({ visitId: first.visitId, status: "proposed", duplicate: true, rescheduled: false });
    const active = await state.t.run((ctx) => ctx.db.query("siteVisits").withIndex("by_assessmentId_and_active", (q) => q.eq("assessmentId", state.assessmentId).eq("active", true)).collect());
    expect(active).toHaveLength(1);
  });

  test("only the other side can confirm or decline a proposal", async () => {
    const confirmed = await acceptedSetup();
    const first = await asUser(confirmed.t, confirmed.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: confirmed.assessmentId, ...futureSchedule() });
    await expect(asUser(confirmed.t, confirmed.clientId).mutation(api.siteVisits.index.respondToVisit, { visitId: first.visitId, decision: "confirm" })).rejects.toThrow("SITE_VISIT_RESPONSE_REQUIRED_FROM_OTHER_PARTICIPANT");
    await expect(asUser(confirmed.t, confirmed.company.userId).mutation(api.siteVisits.index.respondToVisit, { visitId: first.visitId, decision: "confirm" })).resolves.toMatchObject({ status: "confirmed" });

    const declined = await acceptedSetup();
    const second = await asUser(declined.t, declined.company.userId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: declined.assessmentId, ...futureSchedule() });
    await expect(asUser(declined.t, declined.clientId).mutation(api.siteVisits.index.respondToVisit, { visitId: second.visitId, decision: "decline" })).resolves.toMatchObject({ status: "declined" });
    const declineActivity = await declined.t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", declined.projectId)).collect());
    expect(declineActivity.some((item) => item.eventType === "site_visit_declined" && item.siteVisitId === second.visitId)).toBe(true);
  });

  test("members of the proposing company cannot approve or reschedule each other's proposal", async () => {
    const state = await acceptedSetup();
    const secondMemberId = await seedUser(state.t, "company");
    await state.t.run((ctx) => ctx.db.insert("companyMembers", {
      companyId: state.company.companyId,
      userId: secondMemberId,
      role: "staff",
      status: "active",
      createdAt: 1,
    }));
    const proposal = await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.proposeVisit, {
      assessmentId: state.assessmentId,
      ...futureSchedule(2, 10),
    });
    const samePartyProjection = await asUser(state.t, secondMemberId).query(api.siteVisits.index.getForProject, {
      projectId: state.projectId,
    });
    expect(samePartyProjection.assessment?.visit).toMatchObject({ canPropose: false, canConfirm: false, canDecline: false });

    await expect(asUser(state.t, secondMemberId).mutation(api.siteVisits.index.respondToVisit, {
      visitId: proposal.visitId,
      decision: "confirm",
    })).rejects.toThrow("SITE_VISIT_RESPONSE_REQUIRED_FROM_OTHER_PARTICIPANT");
    await expect(asUser(state.t, secondMemberId).mutation(api.siteVisits.index.respondToVisit, {
      visitId: proposal.visitId,
      decision: "decline",
    })).rejects.toThrow("SITE_VISIT_RESPONSE_REQUIRED_FROM_OTHER_PARTICIPANT");
    await expect(asUser(state.t, secondMemberId).mutation(api.siteVisits.index.proposeVisit, {
      assessmentId: state.assessmentId,
      ...futureSchedule(3, 14),
    })).rejects.toThrow("SITE_VISIT_RESPONSE_REQUIRED_FROM_OTHER_PARTICIPANT");

    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.respondToVisit, {
      visitId: proposal.visitId,
      decision: "confirm",
    })).resolves.toMatchObject({ status: "confirmed" });
  });

  test("rescheduling keeps one active visit and preserves every proposal", async () => {
    const state = await acceptedSetup();
    const first = await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule(2, 10), note: "Morning preferred" });
    const rescheduled = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule(3, 14), note: "Afternoon works" });
    expect(rescheduled).toEqual({ visitId: first.visitId, status: "proposed", duplicate: false, rescheduled: true });
    const stored = await state.t.run(async (ctx) => ({
      visits: await ctx.db.query("siteVisits").withIndex("by_assessmentId_and_active", (q) => q.eq("assessmentId", state.assessmentId).eq("active", true)).collect(),
      proposals: await ctx.db.query("siteVisitProposals").withIndex("by_visitId_and_sequence", (q) => q.eq("visitId", first.visitId)).collect(),
    }));
    expect(stored.visits).toHaveLength(1);
    expect(stored.proposals.map((item) => [item.sequence, item.proposedTime, item.note])).toEqual([[1, "10:00", "Morning preferred"], [2, "14:00", "Afternoon works"]]);
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respondToVisit, { visitId: first.visitId, decision: "confirm" })).resolves.toMatchObject({ status: "confirmed" });
  });

  test("prevents a second active visit while the first is confirmed", async () => {
    const state = await acceptedSetup();
    const first = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule() });
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respondToVisit, { visitId: first.visitId, decision: "confirm" });
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule(4, 15) })).rejects.toThrow("ACTIVE_SITE_VISIT_ALREADY_EXISTS");
  });

  test("does not allow another visit after the assessment's visit is completed", async () => {
    const state = await acceptedSetup();
    const first = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule() });
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respondToVisit, { visitId: first.visitId, decision: "confirm" });
    await makeVisitDue(state.t, first.visitId);
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.completeVisit, { visitId: first.visitId });

    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.proposeVisit, {
      assessmentId: state.assessmentId,
      ...futureSchedule(4, 15),
    })).rejects.toThrow("INVALID_SITE_VISIT_TRANSITION");
  });

  test("keeps exact address private from public, other clients, and other companies", async () => {
    const state = await acceptedSetup();
    const proposed = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule() });
    await expect(state.t.query(api.siteVisits.index.getForProject, { projectId: state.projectId })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(state.t, state.otherClientId).query(api.siteVisits.index.getForProject, { projectId: state.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    const outsider = await asUser(state.t, state.otherCompany.userId).query(api.siteVisits.index.getForProject, { projectId: state.projectId });
    expect(outsider.assessment).toBeNull();
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respondToVisit, { visitId: proposed.visitId, decision: "confirm" });
    const participant = await asUser(state.t, state.company.userId).query(api.siteVisits.index.getForProject, { projectId: state.projectId });
    expect(participant.assessment?.visit?.siteAddress).toBe("18 Avenue Mohammed V, Rabat");
    expect(participant.assessment?.visit).not.toHaveProperty("email");
    expect(participant.assessment?.visit).not.toHaveProperty("phone");
  });

  test("either participant can cancel a confirmed visit with a reason", async () => {
    const state = await acceptedSetup();
    const proposed = await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule() });
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respondToVisit, { visitId: proposed.visitId, decision: "confirm" });
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.cancelVisit, { visitId: proposed.visitId, reason: "Client requested a new scope" })).resolves.toMatchObject({ status: "cancelled" });
    const visit = await state.t.run((ctx) => ctx.db.get(proposed.visitId));
    expect(visit).toMatchObject({ active: false, cancellationReason: "Client requested a new scope", cancelledByUserId: state.company.userId });
    const activity = await state.t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", state.projectId)).collect());
    expect(activity.some((item) => item.eventType === "site_visit_cancelled" && item.siteVisitId === proposed.visitId && item.reason === "Client requested a new scope")).toBe(true);
  });

  test("either participant can complete a confirmed visit and completed visits cannot be cancelled", async () => {
    const state = await acceptedSetup();
    const proposed = await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule() });
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.respondToVisit, { visitId: proposed.visitId, decision: "confirm" });
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.completeVisit, { visitId: proposed.visitId })).rejects.toThrow("SITE_VISIT_NOT_YET_DUE");
    await makeVisitDue(state.t, proposed.visitId);
    await expect(asUser(state.t, state.company.userId).mutation(api.siteVisits.index.completeVisit, { visitId: proposed.visitId })).resolves.toMatchObject({ status: "completed" });
    await expect(asUser(state.t, state.clientId).mutation(api.siteVisits.index.cancelVisit, { visitId: proposed.visitId })).rejects.toThrow("INVALID_SITE_VISIT_TRANSITION");
  });

  test("writes complete marketplace activity and exposes read-only admin tracking", async () => {
    const state = await acceptedSetup();
    const adminId = await seedUser(state.t, "admin");
    const proposed = await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule(2, 10) });
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule(3, 14) });
    await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.respondToVisit, { visitId: proposed.visitId, decision: "confirm" });
    await makeVisitDue(state.t, proposed.visitId);
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.completeVisit, { visitId: proposed.visitId });
    const activity = await asUser(state.t, adminId).query(api.admin.projects.listProjectActivity, { projectId: state.projectId });
    expect(activity.filter((item) => item.siteVisitId === proposed.visitId).map((item) => item.eventType)).toEqual(["site_visit_proposed", "site_visit_rescheduled", "site_visit_confirmed", "site_visit_completed"]);
    expect(activity.find((item) => item.eventType === "site_visit_rescheduled")?.metadata).toMatchObject({ proposedDate: expect.any(String), proposedTime: "14:00", timezone: "Africa/Casablanca" });
    expect(activity.find((item) => item.eventType === "site_visit_confirmed")?.metadata).toMatchObject({ proposedDate: expect.any(String), proposedTime: "14:00", timezone: "Africa/Casablanca", scheduledEpoch: expect.any(Number) });
    const admin = await asUser(state.t, adminId).query(api.siteVisits.index.getForProject, { projectId: state.projectId });
    expect(admin).toMatchObject({ viewerType: "admin", assessment: { id: state.assessmentId, visit: { id: proposed.visitId, status: "completed", siteAddress: "18 Avenue Mohammed V, Rabat", proposedByUserId: state.clientId, confirmedByUserId: state.company.userId, completedByUserId: state.clientId, canPropose: false, canConfirm: false, canCancel: false } } });
    expect(admin.assessment?.visit?.proposals).toHaveLength(2);
    const listArgs = { status: "all" as const, now: Date.now() };
    await expect(state.t.query(api.admin.siteVisits.listSiteVisits, listArgs)).rejects.toThrow("NOT_AUTHENTICATED");
    const tracking = await asUser(state.t, adminId).query(api.admin.siteVisits.listSiteVisits, listArgs);
    expect(tracking[0]).toMatchObject({ assessmentId: state.assessmentId, projectId: state.projectId, projectTitle: "Riad renovation", companyName: "Atlas Build", clientName: "client Tester", visitDate: expect.any(String), visitTime: "14:00", status: "completed", proposedBy: "client" });
    expect(JSON.stringify(tracking)).not.toContain("18 Avenue Mohammed V, Rabat");
    expect(JSON.stringify(tracking)).not.toContain("@visit.test");
    const detail = await asUser(state.t, adminId).query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: state.assessmentId, now: Date.now() });
    expect(detail?.visit).toMatchObject({ siteAddress: "18 Avenue Mohammed V, Rabat", status: "completed", proposedBy: { type: "client" }, confirmedBy: { type: "company" }, completedBy: { type: "client" } });
    expect(detail?.activity.map((item) => item.eventType)).toEqual(["site_assessment_invited", "site_assessment_accepted", "site_visit_proposed", "site_visit_rescheduled", "site_visit_confirmed", "site_visit_completed"]);
    expect(JSON.stringify(detail)).not.toContain("@visit.test");
  });

  test("participant queries expose each mutation immediately for Convex realtime subscribers", async () => {
    const state = await acceptedSetup();
    expect((await asUser(state.t, state.clientId).query(api.siteVisits.index.getForConversation, { conversationId: state.conversationId })).assessment?.visit).toBeNull();
    const proposed = await asUser(state.t, state.company.userId).mutation(api.siteVisits.index.proposeVisit, { assessmentId: state.assessmentId, ...futureSchedule() });
    const clientProjection = await asUser(state.t, state.clientId).query(api.siteVisits.index.getForConversation, { conversationId: state.conversationId });
    expect(clientProjection.assessment?.visit).toMatchObject({ id: proposed.visitId, status: "proposed", canConfirm: true });
    await asUser(state.t, state.clientId).mutation(api.siteVisits.index.respondToVisit, { visitId: proposed.visitId, decision: "confirm" });
    const companyProjection = await asUser(state.t, state.company.userId).query(api.siteVisits.index.getForConversation, { conversationId: state.conversationId });
    expect(companyProjection.assessment?.visit).toMatchObject({ id: proposed.visitId, status: "confirmed", canCancel: true, canComplete: true });
  });

  test("rejects site assessment invite after the final quote path starts", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client");
    const company = await seedCompany(t, "Atlas Build");
    const projectId = await seedProject(t, clientId);
    const quoteId = await seedQuote(t, projectId, company);
    const opened = await asUser(t, clientId).mutation(api.quotes.index.reviewInitialQuote, { quoteId, action: "open_discussion" });
    const conversationId = opened.conversationId!;
    await asUser(t, clientId).mutation(api.finalQuotes.index.request, { conversationId });
    const projection = await asUser(t, clientId).query(api.siteVisits.index.getForConversation, { conversationId });
    expect(projection.canInvite).toBe(false);
    await expect(asUser(t, clientId).mutation(api.siteVisits.index.invite, { conversationId })).rejects.toThrow("SITE_ASSESSMENT_FINAL_QUOTE_PATH_LOCKED");
  });
});
