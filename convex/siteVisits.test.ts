/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
const notificationPage = { paginationOpts: { numItems: 50, cursor: null } };

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

async function addCompanyMember(
  state: Awaited<ReturnType<typeof acceptedSetup>>,
  status: "active" | "inactive",
) {
  const userId = await seedUser(state.t, "company");
  await state.t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId: state.company.companyId,
    userId,
    role: "staff",
    status,
    createdAt: 1,
  }));
  return userId;
}

async function siteVisitNotifications(t: Backend, userId: Id<"users">) {
  const notifications = await asUser(t, userId).query(
    api.notifications.index.listMyNotifications,
    notificationPage,
  );
  return notifications.page.filter((notification) => notification.type.startsWith("site_visit_"));
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

describe("site visit notification integration", () => {
  test("proposals notify only the opposite marketplace side and deduplicate retries", async () => {
    const clientState = await acceptedSetup();
    await asUser(clientState.t, clientState.company.userId).mutation(
      api.notifications.index.markAllNotificationsRead,
      {},
    );
    const activeMemberId = await addCompanyMember(clientState, "active");
    const inactiveMemberId = await addCompanyMember(clientState, "inactive");
    const schedule = futureSchedule(2, 10);
    const proposed = await asUser(clientState.t, clientState.clientId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: clientState.assessmentId, ...schedule },
    );
    const duplicate = await asUser(clientState.t, clientState.clientId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: clientState.assessmentId, ...schedule },
    );
    expect(duplicate).toEqual({
      visitId: proposed.visitId,
      status: "proposed",
      duplicate: true,
      rescheduled: false,
    });

    for (const recipientId of [clientState.company.userId, activeMemberId]) {
      expect(await siteVisitNotifications(clientState.t, recipientId)).toEqual([
        expect.objectContaining({
          type: "site_visit_proposed",
          entity: { type: "site_visit", id: proposed.visitId },
          actorUserId: clientState.clientId,
          payload: {
            projectTitle: "Riad renovation",
            companyName: "Atlas Build",
            actorDisplayName: "client T.",
            scheduledAt: expect.any(Number),
          },
          readAt: null,
        }),
      ]);
      await expect(asUser(clientState.t, recipientId).query(
        api.notifications.index.getMyUnreadCount,
        {},
      )).resolves.toBe(1);
    }
    expect(await siteVisitNotifications(clientState.t, clientState.clientId)).toEqual([]);
    expect(await siteVisitNotifications(clientState.t, inactiveMemberId)).toEqual([]);
    expect(await siteVisitNotifications(clientState.t, clientState.otherCompany.userId)).toEqual([]);
    const serialized = JSON.stringify(await siteVisitNotifications(
      clientState.t,
      clientState.company.userId,
    ));
    expect(serialized).not.toContain(schedule.siteAddress);

    const companyState = await acceptedSetup();
    const teammateId = await addCompanyMember(companyState, "active");
    const companyProposal = await asUser(companyState.t, companyState.company.userId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: companyState.assessmentId, ...futureSchedule(2, 11) },
    );
    expect(await siteVisitNotifications(companyState.t, companyState.clientId)).toEqual([
      expect.objectContaining({
        type: "site_visit_proposed",
        entity: { type: "site_visit", id: companyProposal.visitId },
        actorUserId: companyState.company.userId,
        payload: expect.objectContaining({
          actorDisplayName: "Atlas Build",
          scheduledAt: expect.any(Number),
        }),
      }),
    ]);
    expect(await siteVisitNotifications(companyState.t, companyState.company.userId)).toEqual([]);
    expect(await siteVisitNotifications(companyState.t, teammateId)).toEqual([]);
  });

  test("confirmation notifies the opposite side in both directions without duplicate delivery", async () => {
    const clientProposalState = await acceptedSetup();
    const clientProposal = await asUser(clientProposalState.t, clientProposalState.clientId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: clientProposalState.assessmentId, ...futureSchedule(2, 10) },
    );
    const companyConfirmation = await asUser(
      clientProposalState.t,
      clientProposalState.company.userId,
    ).mutation(api.siteVisits.index.respondToVisit, {
      visitId: clientProposal.visitId,
      decision: "confirm",
    });
    expect(companyConfirmation).toEqual({ status: "confirmed", duplicate: false });
    await expect(asUser(clientProposalState.t, clientProposalState.company.userId).mutation(
      api.siteVisits.index.respondToVisit,
      { visitId: clientProposal.visitId, decision: "confirm" },
    )).resolves.toEqual({ status: "confirmed", duplicate: true });
    expect(await siteVisitNotifications(clientProposalState.t, clientProposalState.clientId)).toEqual([
      expect.objectContaining({
        type: "site_visit_confirmed",
        entity: { type: "site_visit", id: clientProposal.visitId },
        actorUserId: clientProposalState.company.userId,
      }),
    ]);

    const companyProposalState = await acceptedSetup();
    await asUser(companyProposalState.t, companyProposalState.company.userId).mutation(
      api.notifications.index.markAllNotificationsRead,
      {},
    );
    const teammateId = await addCompanyMember(companyProposalState, "active");
    const companyProposal = await asUser(
      companyProposalState.t,
      companyProposalState.company.userId,
    ).mutation(api.siteVisits.index.proposeVisit, {
      assessmentId: companyProposalState.assessmentId,
      ...futureSchedule(2, 11),
    });
    await asUser(companyProposalState.t, companyProposalState.clientId).mutation(
      api.siteVisits.index.respondToVisit,
      { visitId: companyProposal.visitId, decision: "confirm" },
    );
    for (const recipientId of [companyProposalState.company.userId, teammateId]) {
      expect(await siteVisitNotifications(companyProposalState.t, recipientId)).toEqual([
        expect.objectContaining({
          type: "site_visit_confirmed",
          actorUserId: companyProposalState.clientId,
        }),
      ]);
    }
    expect((await siteVisitNotifications(
      companyProposalState.t,
      companyProposalState.clientId,
    )).filter((notification) => notification.type === "site_visit_confirmed")).toEqual([]);
  });

  test("each real reschedule has a proposal-derived key while retries stay idempotent", async () => {
    const state = await acceptedSetup();
    await asUser(state.t, state.company.userId).mutation(
      api.notifications.index.markAllNotificationsRead,
      {},
    );
    const teammateId = await addCompanyMember(state, "active");
    const initial = await asUser(state.t, state.company.userId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: state.assessmentId, ...futureSchedule(2, 10) },
    );
    await asUser(state.t, state.clientId).mutation(
      api.notifications.index.markAllNotificationsRead,
      {},
    );

    const clientSchedule = { ...futureSchedule(3, 14), note: "Afternoon works" };
    const firstReschedule = await asUser(state.t, state.clientId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: state.assessmentId, ...clientSchedule },
    );
    expect(firstReschedule).toMatchObject({
      visitId: initial.visitId,
      duplicate: false,
      rescheduled: true,
    });
    await expect(asUser(state.t, state.clientId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: state.assessmentId, ...clientSchedule },
    )).resolves.toMatchObject({ visitId: initial.visitId, duplicate: true });

    const secondReschedule = await asUser(state.t, state.company.userId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: state.assessmentId, ...futureSchedule(4, 9), note: "Morning alternative" },
    );
    expect(secondReschedule).toMatchObject({
      visitId: initial.visitId,
      duplicate: false,
      rescheduled: true,
    });

    for (const recipientId of [state.company.userId, teammateId]) {
      const reschedules = (await siteVisitNotifications(state.t, recipientId))
        .filter((notification) => notification.type === "site_visit_rescheduled");
      expect(reschedules).toHaveLength(1);
      expect(reschedules[0]).toMatchObject({ actorUserId: state.clientId });
    }
    const clientReschedules = (await siteVisitNotifications(state.t, state.clientId))
      .filter((notification) => notification.type === "site_visit_rescheduled");
    expect(clientReschedules).toHaveLength(1);
    expect(clientReschedules[0]).toMatchObject({ actorUserId: state.company.userId });

    const proposals = await state.t.run((ctx) => ctx.db
      .query("siteVisitProposals")
      .withIndex("by_visitId_and_sequence", (q) => q.eq("visitId", initial.visitId))
      .collect());
    expect(proposals.map((proposal) => proposal.sequence)).toEqual([1, 2, 3]);
    const stored = await state.t.run((ctx) => ctx.db.query("notifications").collect());
    expect(stored.some((notification) => notification.dedupeKey ===
      `site_visit:${initial.visitId}:rescheduled:${proposals[1]._id}`)).toBe(true);
    expect(stored.some((notification) => notification.dedupeKey ===
      `site_visit:${initial.visitId}:rescheduled:${proposals[2]._id}`)).toBe(true);
  });

  test("cancellation notifies only the opposite side in both directions", async () => {
    const clientCancelState = await acceptedSetup();
    const teammateId = await addCompanyMember(clientCancelState, "active");
    const proposed = await asUser(clientCancelState.t, clientCancelState.company.userId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: clientCancelState.assessmentId, ...futureSchedule() },
    );
    await asUser(clientCancelState.t, clientCancelState.clientId).mutation(
      api.siteVisits.index.respondToVisit,
      { visitId: proposed.visitId, decision: "confirm" },
    );
    for (const recipientId of [clientCancelState.company.userId, teammateId]) {
      await asUser(clientCancelState.t, recipientId).mutation(
        api.notifications.index.markAllNotificationsRead,
        {},
      );
    }
    await asUser(clientCancelState.t, clientCancelState.clientId).mutation(
      api.siteVisits.index.cancelVisit,
      { visitId: proposed.visitId, reason: "Schedule changed" },
    );
    for (const recipientId of [clientCancelState.company.userId, teammateId]) {
      expect((await siteVisitNotifications(clientCancelState.t, recipientId))
        .filter((notification) => notification.type === "site_visit_cancelled")).toEqual([
        expect.objectContaining({ actorUserId: clientCancelState.clientId }),
      ]);
      await expect(asUser(clientCancelState.t, recipientId).query(
        api.notifications.index.getMyUnreadCount,
        {},
      )).resolves.toBe(1);
    }

    const companyCancelState = await acceptedSetup();
    const companyTeammateId = await addCompanyMember(companyCancelState, "active");
    const second = await asUser(companyCancelState.t, companyCancelState.clientId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: companyCancelState.assessmentId, ...futureSchedule() },
    );
    await asUser(companyCancelState.t, companyCancelState.company.userId).mutation(
      api.siteVisits.index.respondToVisit,
      { visitId: second.visitId, decision: "confirm" },
    );
    await asUser(companyCancelState.t, companyCancelState.clientId).mutation(
      api.notifications.index.markAllNotificationsRead,
      {},
    );
    await asUser(companyCancelState.t, companyCancelState.company.userId).mutation(
      api.siteVisits.index.cancelVisit,
      { visitId: second.visitId },
    );
    await expect(asUser(companyCancelState.t, companyCancelState.company.userId).mutation(
      api.siteVisits.index.cancelVisit,
      { visitId: second.visitId },
    )).resolves.toEqual({ status: "cancelled", duplicate: true });
    expect((await siteVisitNotifications(companyCancelState.t, companyCancelState.clientId))
      .filter((notification) => notification.type === "site_visit_cancelled")).toEqual([
      expect.objectContaining({ actorUserId: companyCancelState.company.userId }),
    ]);
    expect((await siteVisitNotifications(companyCancelState.t, companyTeammateId))
      .filter((notification) => notification.type === "site_visit_cancelled")).toEqual([]);
  });

  test("decline and completion remain outside this notification step", async () => {
    const declined = await acceptedSetup();
    const proposed = await asUser(declined.t, declined.company.userId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: declined.assessmentId, ...futureSchedule() },
    );
    await asUser(declined.t, declined.clientId).mutation(
      api.notifications.index.markAllNotificationsRead,
      {},
    );
    await asUser(declined.t, declined.clientId).mutation(
      api.siteVisits.index.respondToVisit,
      { visitId: proposed.visitId, decision: "decline" },
    );
    await expect(asUser(declined.t, declined.clientId).query(
      api.notifications.index.getMyUnreadCount,
      {},
    )).resolves.toBe(0);

    const completed = await acceptedSetup();
    const second = await asUser(completed.t, completed.clientId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: completed.assessmentId, ...futureSchedule() },
    );
    await asUser(completed.t, completed.company.userId).mutation(
      api.siteVisits.index.respondToVisit,
      { visitId: second.visitId, decision: "confirm" },
    );
    await makeVisitDue(completed.t, second.visitId);
    await asUser(completed.t, completed.company.userId).mutation(
      api.notifications.index.markAllNotificationsRead,
      {},
    );
    await asUser(completed.t, completed.company.userId).mutation(
      api.siteVisits.index.completeVisit,
      { visitId: second.visitId },
    );
    await expect(asUser(completed.t, completed.company.userId).query(
      api.notifications.index.getMyUnreadCount,
      {},
    )).resolves.toBe(0);
  });

  test("forged recipients are rejected and notification failures roll back the transition", async () => {
    const forged = await acceptedSetup();
    const forgedArgs = {
      assessmentId: forged.assessmentId,
      ...futureSchedule(),
      recipientUserId: forged.otherClientId,
    } as unknown as FunctionArgs<typeof api.siteVisits.index.proposeVisit>;
    await expect(asUser(forged.t, forged.clientId).mutation(
      api.siteVisits.index.proposeVisit,
      forgedArgs,
    )).rejects.toThrow();
    expect(await siteVisitNotifications(forged.t, forged.otherClientId)).toEqual([]);

    const rollback = await acceptedSetup();
    await rollback.t.run((ctx) => ctx.db.delete(rollback.clientId));
    await expect(asUser(rollback.t, rollback.company.userId).mutation(
      api.siteVisits.index.proposeVisit,
      { assessmentId: rollback.assessmentId, ...futureSchedule() },
    )).rejects.toThrow("NOTIFICATION_RECIPIENT_NOT_FOUND");
    const stored = await rollback.t.run(async (ctx) => ({
      visits: await ctx.db.query("siteVisits").collect(),
      proposals: await ctx.db.query("siteVisitProposals").collect(),
      notifications: (await ctx.db.query("notifications").collect())
        .filter((notification) => notification.type.startsWith("site_visit_")),
      activity: (await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", rollback.projectId))
        .collect())
        .filter((entry) => entry.eventType === "site_visit_proposed"),
    }));
    expect(stored).toEqual({ visits: [], proposals: [], notifications: [], activity: [] });
  });
});
