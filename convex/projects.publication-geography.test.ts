/// <reference types="vite/client" />

import type { FunctionArgs, WithoutSystemFields } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertProjectLocationReady,
  type StructuredProjectLocationInput,
} from "./projects/locationValidation";
import { buildProjectMarketplaceSearchText } from "./projects/marketplaceSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
type Role = NonNullable<Doc<"users">["accountType"]>;
type ProjectPatch = Partial<WithoutSystemFields<Doc<"projects">>>;
const empty: StructuredProjectLocationInput = {
  regionCode: null,
  provinceCode: null,
  communeName: null,
  localityName: null,
};
const rural: StructuredProjectLocationInput = {
  regionCode: "05",
  provinceCode: "05.081",
  communeName: "Aït Tamlil — آيت تامليل",
  localityName: "PRIVATE_RURAL_LOCALITY_ⵜⴰⵎⵍⵉⵍ",
};
const neighborhood = "PRIVATE_HISTORICAL_NEIGHBORHOOD";
const exactAddress = "PRIVATE_SITE_VISIT_ADDRESS";
const quoteInput = {
  message: "We can deliver the renovation with a dedicated construction team.",
  estimatedPrice: 185_000.25,
  estimatedDuration: 75,
  availableStartDate: "2099-01-15",
  scope: "Plumbing, electrical work, finishes and cleanup of the construction site.",
} satisfies Omit<FunctionArgs<typeof api.quotes.index.submitInitialQuote>, "projectId">;

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}
async function user(t: Backend, accountType: Role) {
  return await t.run((ctx) => ctx.db.insert("users", {
    accountType,
    onboardingStatus: "completed",
    countryCode: "MA",
    createdAt: 1,
    updatedAt: 1,
  }));
}
async function company(t: Backend, role: "owner" | "staff" = "owner") {
  const userId = await user(t, "company");
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name: "Rural construction company",
    onboardingStatus: "completed",
    verificationStatus: "verified",
    createdAt: 1,
    updatedAt: 1,
  }));
  const membershipId = await t.run((ctx) => ctx.db.insert("companyMembers", {
    userId, companyId, role, status: "active", createdAt: 1,
  }));
  return { userId, companyId, membershipId };
}
async function setup() {
  const t = convexTest(schema, modules);
  const clientId = await user(t, "client");
  const adminId = await user(t, "admin");
  const owner = asUser(t, clientId);
  const admin = asUser(t, adminId);
  const { projectId } = await owner.mutation(api.projects.index.initializeDraft, {});
  await owner.mutation(api.projects.index.saveCategory, {
    projectId, primaryCategory: "renovation",
  });
  await owner.mutation(api.projects.index.saveDetails, {
    projectId,
    title: "Renovation of a rural house",
    propertyType: "house",
    surfaceUnknown: true,
    description: "Renovation of a house with plumbing and electrical work.",
  });
  await owner.mutation(api.projects.index.saveTimeline, { projectId, timeline: "flexible" });
  return { t, clientId, adminId, owner, admin, projectId };
}
type State = Awaited<ReturnType<typeof setup>>;
async function saveRural(state: State, overrides: Partial<StructuredProjectLocationInput> = {}) {
  await state.owner.mutation(api.projects.index.saveStructuredLocation, {
    projectId: state.projectId, ...rural, ...overrides,
  });
}
async function submit(state: State) {
  return await state.owner.mutation(api.projects.index.publishProject, {
    projectId: state.projectId,
  });
}
async function approve(state: State) {
  return await state.admin.mutation(api.admin.projects.approveProject, {
    projectId: state.projectId,
  });
}
async function publishedRural() {
  const state = await setup();
  await saveRural(state);
  await submit(state);
  await approve(state);
  return state;
}
async function storedProject(state: State) {
  const project = await state.t.run((ctx) => ctx.db.get(state.projectId));
  if (!project) throw new Error("Missing test Project");
  return project;
}
async function effects(state: State) {
  return await state.t.run(async (ctx) => ({
    project: await ctx.db.get(state.projectId),
    history: await ctx.db.query("projectStatusHistory")
      .withIndex("by_projectId", (q) => q.eq("projectId", state.projectId)).take(20),
    activity: await ctx.db.query("marketplaceActivity")
      .withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", state.projectId)).take(20),
    notifications: await ctx.db.query("notifications").take(100),
    quotes: await ctx.db.query("projectQuotes").take(20),
    quoteHistory: await ctx.db.query("quoteStatusHistory").take(20),
    conversations: await ctx.db.query("conversations").take(20),
  }));
}
async function rejectedWithoutEffects(state: State, operation: () => Promise<unknown>, error: string) {
  const before = await effects(state);
  await expect(operation()).rejects.toThrow(error);
  expect(await effects(state)).toEqual(before);
}
function generalLocation(communeName = rural.communeName) {
  return { regionCode: "05", provinceCode: "05.081", communeName, legacyCity: null };
}
function noRestrictedDetails(dto: unknown) {
  const serialized = JSON.stringify(dto);
  for (const value of [rural.localityName!, neighborhood, exactAddress,
    '"localityName"', '"neighborhood"', '"siteAddress"']) {
    expect(serialized).not.toContain(value);
  }
}

describe("GEO4.2 real submission and approval workflow", () => {
  test.each([
    ["draft", null], ["draft", rural.communeName],
    ["needs_changes", null], ["needs_changes", rural.communeName],
  ] as const)("submits and approves a rural %s Project with commune=%s and no legacy city", async (status, communeName) => {
    const state = await setup();
    await saveRural(state, { communeName });
    if (status === "needs_changes") {
      await submit(state);
      await state.admin.mutation(api.admin.projects.requestProjectChanges, {
        projectId: state.projectId, reason: "Confirm the recorded geographic information.",
      });
      await saveRural(state, { communeName });
    }
    const before = await storedProject(state);
    expect(before.status).toBe(status);
    expect(before).not.toHaveProperty("city");
    await expect(submit(state)).resolves.toEqual({ status: "pending_review", alreadySubmitted: false });
    const pending = await storedProject(state);
    expect(pending).toEqual({ ...before, status: "pending_review", submittedAt: expect.any(Number), updatedAt: expect.any(Number) });
    expect(await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId })).toBeNull();
    expect(await state.owner.query(api.projects.index.getMyProject, { projectId: state.projectId }))
      .toMatchObject({ location: { ...generalLocation(communeName), localityName: rural.localityName } });

    await expect(approve(state)).resolves.toEqual({ status: "published" });
    expect(await storedProject(state)).toEqual({
      ...pending, status: "published", publishedAt: expect.any(Number), updatedAt: expect.any(Number),
      marketplaceSearchText: buildProjectMarketplaceSearchText(pending),
    });
    const publicProject = await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId });
    expect(publicProject).toMatchObject({ city: null, location: generalLocation(communeName) });
    noRestrictedDetails(publicProject);
    const all = await effects(state);
    expect(all.history.slice(-2)).toEqual([
      expect.objectContaining({ oldStatus: status, newStatus: "pending_review", changedBy: state.clientId }),
      expect.objectContaining({ oldStatus: "pending_review", newStatus: "published", changedBy: state.adminId }),
    ]);
    expect(all.activity.slice(-2).map((event) => event.eventType)).toEqual(["project_submitted", "project_approved"]);
    expect(all.notifications).toEqual([]);
    expect(all.quotes).toEqual([]);
    expect(all.conversations).toEqual([]);
    await rejectedWithoutEffects(state, () => approve(state), "PROJECT_NOT_PENDING_REVIEW");
  });

  test("legacy city-only submission, approval and quote summaries preserve recorded history without inference", async () => {
    const state = await setup();
    await state.owner.mutation(api.projects.index.saveLocation, {
      projectId: state.projectId, city: "rabat", neighborhood,
    });
    await state.t.run((ctx) => ctx.db.patch(state.projectId, {
      budgetRange: "100000_250000", budgetMin: 100_000, budgetMax: 250_000,
      budgetUnknown: false, lastCompletedStep: 6,
    }));
    const before = await storedProject(state);
    await submit(state);
    await approve(state);
    expect(await storedProject(state)).toEqual({
      ...before, status: "published", submittedAt: expect.any(Number), publishedAt: expect.any(Number),
      updatedAt: expect.any(Number), marketplaceSearchText: buildProjectMarketplaceSearchText(before),
    });
    const member = await company(state.t);
    const caller = asUser(state.t, member.userId);
    const context = await caller.query(api.quotes.index.getSubmissionContext, { projectId: state.projectId });
    expect(context?.project).toMatchObject({ city: "rabat", location: {
      regionCode: null, provinceCode: null, communeName: null, legacyCity: "rabat",
    } });
    const quote = await caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput });
    const detail = await caller.query(api.quotes.index.getMyQuote, { quoteId: quote.quoteId });
    expect(detail?.project).toEqual(context?.project);
    noRestrictedDetails(context);
    noRestrictedDetails(detail);
  });

  test("complete mixed geography keeps the historical city and neighborhood unchanged", async () => {
    const state = await setup();
    await state.owner.mutation(api.projects.index.saveLocation, { projectId: state.projectId, city: "rabat", neighborhood });
    await saveRural(state);
    await submit(state);
    await approve(state);
    expect(await storedProject(state)).toMatchObject({ ...rural, city: "rabat", neighborhood });
    const member = await company(state.t);
    const caller = asUser(state.t, member.userId);
    const context = await caller.query(api.quotes.index.getSubmissionContext, { projectId: state.projectId });
    expect(context?.project).toMatchObject({ city: "rabat", location: generalLocation() });
    const result = await caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput });
    const quote = await caller.query(api.quotes.index.getMyQuote, { quoteId: result.quoteId });
    expect(quote?.project).toEqual(context?.project);
    noRestrictedDetails(context);
    noRestrictedDetails(quote);
  });

  test("GEO5.1 persists structured mode after clearing and blocks the old city from restoring publication readiness", async () => {
    const state = await setup();
    await state.owner.mutation(api.projects.index.saveLocation, { projectId: state.projectId, city: "rabat", neighborhood });
    await saveRural(state);
    await state.owner.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...empty });
    const before = await storedProject(state);
    for (const field of Object.keys(empty)) expect(before).not.toHaveProperty(field);
    expect(before).toMatchObject({ city: "rabat", neighborhood, locationMode: "structured" });
    await rejectedWithoutEffects(state, () => submit(state), "PROJECT_INCOMPLETE");
    expect((await storedProject(state)).status).toBe("draft");
  });

  test("duplicate pending-review submission preserves history/activity even if Admin must request geographic changes", async () => {
    const state = await setup();
    await saveRural(state);
    await submit(state);
    const submitted = await effects(state);
    await expect(submit(state)).resolves.toEqual({ status: "pending_review", alreadySubmitted: true });
    expect(await effects(state)).toEqual(submitted);
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { localityName: undefined }));
    const incomplete = await effects(state);
    await expect(submit(state)).resolves.toEqual({ status: "pending_review", alreadySubmitted: true });
    expect(await effects(state)).toEqual(incomplete);
    await rejectedWithoutEffects(state, () => approve(state), "PROJECT_INCOMPLETE");
    await state.admin.mutation(api.admin.projects.requestProjectChanges, {
      projectId: state.projectId, reason: "Complete the project locality before publication.",
    });
    await saveRural(state);
    await submit(state);
    await approve(state);
    const repaired = await effects(state);
    expect(repaired.project?.status).toBe("published");
    expect(repaired.history.map((row) => [row.oldStatus, row.newStatus])).toEqual([
      ["draft", "pending_review"], ["pending_review", "needs_changes"],
      ["needs_changes", "pending_review"], ["pending_review", "published"],
    ]);
  });

  test("readiness requires Morocco even for a complete structured or legacy snapshot", () => {
    for (const location of [
      { regionCode: "05", provinceCode: "05.081", localityName: "Douar", communeName: "Commune" },
      { city: "rabat" as const },
    ]) {
      expect(() => assertProjectLocationReady({
        ...location, countryCode: "FR" as "MA",
      })).toThrow("PROJECT_INCOMPLETE");
    }
  });

  test.each([
    { primaryCategory: undefined }, { title: undefined }, { description: undefined },
    { timeline: undefined }, { primaryCategory: "other", customCategoryText: undefined },
  ] satisfies ProjectPatch[])("keeps non-geographic submission requirements: %j", async (patch) => {
    const state = await setup();
    await saveRural(state);
    await state.t.run((ctx) => ctx.db.patch(state.projectId, patch));
    await rejectedWithoutEffects(state, () => submit(state), "PROJECT_INCOMPLETE");
  });
});

const invalidLocations: { label: string; patch: ProjectPatch; error: string }[] = [
  { label: "missing region", patch: { regionCode: undefined }, error: "PROJECT_REGION_REQUIRED" },
  { label: "missing province", patch: { provinceCode: undefined }, error: "PROJECT_INCOMPLETE" },
  { label: "missing locality", patch: { localityName: undefined }, error: "PROJECT_INCOMPLETE" },
  { label: "only commune", patch: { regionCode: undefined, provinceCode: undefined, localityName: undefined }, error: "PROJECT_INCOMPLETE" },
  { label: "only locality", patch: { regionCode: undefined, provinceCode: undefined, communeName: undefined }, error: "PROJECT_INCOMPLETE" },
  { label: "empty structured field", patch: { regionCode: undefined, provinceCode: undefined, localityName: undefined, communeName: "" }, error: "PROJECT_INCOMPLETE" },
  { label: "unknown region", patch: { regionCode: "UNKNOWN_REGION" }, error: "INVALID_PROJECT_REGION" },
  { label: "empty region code", patch: { regionCode: "" }, error: "INVALID_PROJECT_REGION" },
  { label: "unknown province", patch: { provinceCode: "UNKNOWN_PROVINCE" }, error: "INVALID_PROJECT_PROVINCE" },
  { label: "empty province code", patch: { provinceCode: "" }, error: "INVALID_PROJECT_PROVINCE" },
  { label: "wrong province parent", patch: { regionCode: "06" }, error: "PROJECT_PROVINCE_REGION_MISMATCH" },
  { label: "blank locality", patch: { localityName: " \t\n " }, error: "PROJECT_INCOMPLETE" },
  { label: "overlong locality", patch: { localityName: "x".repeat(101) }, error: "INVALID_PROJECT_LOCALITY" },
  { label: "control in locality", patch: { localityName: "Douar\u0000" }, error: "INVALID_PROJECT_LOCALITY" },
  { label: "overlong optional commune", patch: { communeName: "x".repeat(101) }, error: "INVALID_PROJECT_COMMUNE" },
  { label: "bidi control in optional commune", patch: { communeName: "Commune\u202e" }, error: "INVALID_PROJECT_COMMUNE" },
];

describe.each(["Client submission", "Admin approval"] as const)("GEO4.2 %s rejects unresolved geography atomically", (gate) => {
  test.each(invalidLocations)("$label cannot use a stale legacy city to bypass validation", async ({ patch, error }) => {
    for (const city of [undefined, "rabat"] as const) {
      const state = await setup();
      await saveRural(state);
      if (gate === "Admin approval") await submit(state);
      // Simulate an older stored draft or a location changed since submission.
      await state.t.run((ctx) => ctx.db.patch(state.projectId, { ...patch, city }));
      await rejectedWithoutEffects(state, () => gate === "Client submission" ? submit(state) : approve(state), error);
      expect(await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId })).toBeNull();
    }
  });
  test("no structured fields and no legacy city remains incomplete", async () => {
    const state = await setup();
    if (gate === "Admin approval") {
      await saveRural(state);
      await submit(state);
      await state.t.run((ctx) => ctx.db.patch(state.projectId, {
        regionCode: undefined, provinceCode: undefined, communeName: undefined, localityName: undefined,
      }));
    }
    await rejectedWithoutEffects(state, () => gate === "Client submission" ? submit(state) : approve(state), "PROJECT_INCOMPLETE");
  });
});

describe("GEO4.2 authorization", () => {
  test.each(["other Client", "Company owner", "Company staff", "SEO", "Admin", "anonymous", "pending Client"] as const)(
    "rejects submission by %s before location validation or any writes", async (audience) => {
      const state = await setup();
      await saveRural(state, { localityName: null });
      let caller: Pick<Backend, "mutation"> = state.t;
      let error = "NOT_AUTHENTICATED";
      if (audience !== "anonymous") {
        const userId = audience.startsWith("Company")
          ? (await company(state.t, audience === "Company staff" ? "staff" : "owner")).userId
          : audience === "Admin" ? state.adminId
            : audience === "pending Client" ? state.clientId
              : await user(state.t, audience === "SEO" ? "seo_team" : "client");
        if (audience === "pending Client") {
          await state.t.run((ctx) => ctx.db.patch(userId, { onboardingStatus: "pending" }));
          error = "CLIENT_ONBOARDING_REQUIRED";
        } else error = audience === "other Client" ? "PROJECT_NOT_FOUND" : "CLIENT_ACCOUNT_REQUIRED";
        caller = asUser(state.t, userId);
      }
      await rejectedWithoutEffects(state, () => caller.mutation(api.projects.index.publishProject, { projectId: state.projectId }), error);
    },
  );

  test.each(["Client", "Company", "SEO", "anonymous", "revoked Admin"] as const)(
    "rejects approval by %s before location validation or any writes", async (audience) => {
      const state = await setup();
      await saveRural(state);
      await submit(state);
      await state.t.run((ctx) => ctx.db.patch(state.projectId, { localityName: undefined }));
      let caller: Pick<Backend, "mutation"> = state.t;
      if (audience !== "anonymous") {
        const userId = audience === "Client" ? state.clientId
          : audience === "Company" ? (await company(state.t)).userId
            : audience === "revoked Admin" ? state.adminId : await user(state.t, "seo_team");
        if (audience === "revoked Admin") await state.t.run((ctx) => ctx.db.patch(userId, { accountType: "client" }));
        caller = asUser(state.t, userId);
      }
      await rejectedWithoutEffects(state, () => caller.mutation(api.admin.projects.approveProject, { projectId: state.projectId }),
        audience === "anonymous" ? "NOT_AUTHENTICATED" : "ADMIN_REQUIRED");
    },
  );
});

describe("GEO4.2 initial quotes for rural Projects", () => {
  test("saves, submits, approves and quotes without city; locality unlocks only on the existing project-detail gate", async () => {
    const state = await publishedRural();
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { neighborhood }));
    const member = await company(state.t);
    const otherCompany = await company(state.t);
    const caller = asUser(state.t, member.userId);
    const context = await caller.query(api.quotes.index.getSubmissionContext, { projectId: state.projectId });
    expect(context).toMatchObject({
      project: { id: state.projectId, city: null, location: generalLocation() },
      verificationStatus: "verified", marketplaceWriteAllowed: true, activeQuoteId: null, latestQuoteId: null,
    });
    noRestrictedDetails(context);
    const result = await caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput });
    expect(result).toMatchObject({ status: "submitted", conversationId: null });
    const quote = await caller.query(api.quotes.index.getMyQuote, { quoteId: result.quoteId });
    expect(quote).toMatchObject({ ...quoteInput, currency: "MAD", project: context?.project });
    noRestrictedDetails(quote);
    const beforeInterest = await caller.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: state.projectId });
    noRestrictedDetails(beforeInterest);
    expect(await caller.query(api.messages.index.listMyThreads, {})).toEqual([]);
    await rejectedWithoutEffects(state, () => caller.mutation(api.messages.index.recoverConversationForQuote, { quoteId: result.quoteId }), "CONVERSATION_LOCKED");
    await rejectedWithoutEffects(state, () => caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput }), "ACTIVE_QUOTE_ALREADY_EXISTS");
    await expect(asUser(state.t, otherCompany.userId).query(api.quotes.index.getMyQuote, { quoteId: result.quoteId })).rejects.toThrow("QUOTE_NOT_FOUND");

    const opened = await state.owner.mutation(api.quotes.index.reviewInitialQuote, { quoteId: result.quoteId, action: "open_discussion" });
    expect(opened.conversationId).not.toBeNull();
    const detailed = await caller.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: state.projectId });
    expect(detailed?.location).toMatchObject({ localityName: rural.localityName, neighborhood });
    noRestrictedDetails(await asUser(state.t, otherCompany.userId).query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: state.projectId }));
    // A private site-visit record must not get joined into the quote summary,
    // even for the Company whose discussion is already authorized.
    await state.t.run(async (ctx) => {
      const assessmentId = await ctx.db.insert("siteAssessments", {
        projectId: state.projectId, clientId: state.clientId, companyId: member.companyId,
        initialQuoteId: result.quoteId, conversationId: opened.conversationId!,
        status: "scheduled", active: true, invitedByUserId: state.clientId, invitedAt: 1,
        acceptedAt: 1, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("siteVisits", {
        assessmentId, projectId: state.projectId, clientId: state.clientId, companyId: member.companyId,
        conversationId: opened.conversationId!, initialQuoteId: result.quoteId,
        proposedByUserId: state.clientId, proposedDate: "2099-01-15", proposedTime: "10:00",
        timezone: "Africa/Casablanca", siteAddress: exactAddress, status: "confirmed", active: true,
        proposedAt: 1, createdAt: 1, updatedAt: 1,
      });
    });
    for (const response of [
      await caller.query(api.quotes.index.getMyQuote, { quoteId: result.quoteId }),
      await caller.query(api.quotes.index.getSubmissionContext, { projectId: state.projectId }),
      await asUser(state.t, otherCompany.userId).query(api.quotes.index.getSubmissionContext, { projectId: state.projectId }),
    ]) noRestrictedDetails(response);
    const all = await effects(state);
    expect(all.quotes).toHaveLength(1);
    expect(all.conversations).toHaveLength(1);
    expect(all.notifications.some((notification) => notification.recipientUserId === state.clientId)).toBe(true);
  });

  test.each(["draft", "pending", "rejected", "suspended", "pending user", "pending company", "inactive member"] as const)(
    "a rural Project does not bypass Company eligibility: %s", async (eligibility) => {
      const state = await publishedRural();
      const member = await company(state.t);
      if (eligibility === "draft" || eligibility === "pending" || eligibility === "rejected")
        await state.t.run((ctx) => ctx.db.patch(member.companyId, { verificationStatus: eligibility }));
      if (eligibility === "suspended") await state.t.run((ctx) => ctx.db.patch(member.companyId, { operationalStatus: "suspended" }));
      if (eligibility === "pending user") await state.t.run((ctx) => ctx.db.patch(member.userId, { onboardingStatus: "pending" }));
      if (eligibility === "pending company") await state.t.run((ctx) => ctx.db.patch(member.companyId, { onboardingStatus: "pending" }));
      if (eligibility === "inactive member") await state.t.run((ctx) => ctx.db.patch(member.membershipId, { status: "inactive" }));
      const error = eligibility === "suspended" ? "COMPANY_MARKETPLACE_SUSPENDED"
        : eligibility.startsWith("pending ") ? "COMPANY_ONBOARDING_REQUIRED"
          : eligibility === "inactive member" ? "COMPANY_MEMBERSHIP_REQUIRED" : "COMPANY_VERIFICATION_REQUIRED";
      const caller = asUser(state.t, member.userId);
      await rejectedWithoutEffects(state, () => caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput }), error);
    },
  );

  test.each(["Client", "Admin", "anonymous"] as const)("rejects a rural initial quote from %s", async (audience) => {
    const state = await publishedRural();
    const caller = audience === "anonymous" ? state.t : asUser(state.t, audience === "Client" ? state.clientId : state.adminId);
    await rejectedWithoutEffects(state, () => caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput }),
      audience === "anonymous" ? "NOT_AUTHENTICATED" : "COMPANY_ACCOUNT_REQUIRED");
  });

  test("a rural draft and pending-review Project cannot receive quotes before Admin publication", async () => {
    const state = await setup();
    await saveRural(state);
    const member = await company(state.t);
    const caller = asUser(state.t, member.userId);
    for (const status of ["draft", "pending_review"] as const) {
      if (status === "pending_review") await submit(state);
      expect(await caller.query(api.quotes.index.getSubmissionContext, { projectId: state.projectId })).toBeNull();
      await rejectedWithoutEffects(state, () => caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput }), "PROJECT_NOT_ACCEPTING_QUOTES");
    }
  });

  test("invite-only rural quoting follows the existing invitation acceptance and messaging gates", async () => {
    const state = await setup();
    await saveRural(state);
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { visibility: "invite_only" }));
    await submit(state);
    await approve(state);
    const member = await company(state.t);
    const other = await company(state.t);
    const caller = asUser(state.t, member.userId);
    for (const invited of [false, true]) {
      if (invited) await state.owner.mutation(api.invitations.index.inviteCompanyToProject, { projectId: state.projectId, companyId: member.companyId });
      expect(await caller.query(api.quotes.index.getSubmissionContext, { projectId: state.projectId })).toBeNull();
      await rejectedWithoutEffects(state, () => caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput }), "PROJECT_NOT_ACCEPTING_QUOTES");
    }
    const invitation = await state.t.run((ctx) => ctx.db.query("invitations")
      .withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", state.projectId).eq("companyId", member.companyId)).unique());
    await caller.mutation(api.invitations.index.acceptInvitation, { invitationId: invitation!._id });
    const context = await caller.query(api.quotes.index.getSubmissionContext, { projectId: state.projectId });
    expect(context?.project).toMatchObject({ city: null, location: generalLocation() });
    noRestrictedDetails(context);
    expect(await asUser(state.t, other.userId).query(api.quotes.index.getSubmissionContext, { projectId: state.projectId })).toBeNull();
    const result = await caller.mutation(api.quotes.index.submitInitialQuote, { projectId: state.projectId, ...quoteInput });
    expect(result).toMatchObject({ status: "discussion_open", conversationId: expect.any(String) });
    expect(await caller.query(api.messages.index.listMyThreads, {})).toHaveLength(1);
    noRestrictedDetails(await caller.query(api.quotes.index.getMyQuote, { quoteId: result.quoteId }));
  });
});
