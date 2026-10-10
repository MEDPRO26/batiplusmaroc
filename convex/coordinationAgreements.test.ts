/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { projectStatuses } from "./projects/constants";
import { TERM_LIMITS, type Terms } from "./coordinationAgreements/validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const agreements = api.coordinationAgreements.index;
type Backend = TestConvex<typeof schema>;
type Caller = ReturnType<Backend["withIdentity"]>;
const NOW = Date.parse("2026-10-07T12:00:00.000Z");
const TODAY = "2026-10-07";
const page = (numItems = 25, cursor: string | null = null) => ({ paginationOpts: { numItems, cursor } });
const TERMS: Terms = {
  tasks: "Organize the agreed visits and record their outcomes.", exclusions: "No technical guarantee or work supervision.",
  visits: "Two visits, with dates agreed individually.", availability: "Subject to the confirmed visit schedule.",
  startDate: TODAY, currency: "MAD", fee: { kind: "fixed", amountMad: 1200.29 },
  payer: "The named project sponsor; their separate consent is required.",
  paymentTerms: "600.14 MAD on 2026-10-09 and 600.15 MAD after the second visit.",
};

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); });

function asUser(t: Backend, id: Id<"users">) {
  return t.withIdentity({ subject: `${id}|test-session`, tokenIdentifier: `test|${id}` });
}

async function user(t: Backend, accountType: "client" | "admin" | "company" | "seo_team", name: string) {
  return t.run(ctx => ctx.db.insert("users", {
    accountType, onboardingStatus: "completed", firstName: name, lastName: "Test",
    email: `${name}@PRIVATE_CONTACT_SENTINEL.test`, phone: "PRIVATE_PHONE_SENTINEL", createdAt: 1, updatedAt: 1,
  }));
}

async function project(t: Backend, clientId: Id<"users">) {
  return t.run(ctx => ctx.db.insert("projects", {
    clientId, countryCode: "MA", title: "PRIVATE_PROJECT_TITLE_SENTINEL", city: "rabat", surfaceUnknown: true,
    visibility: "marketplace", status: "published", lastCompletedStep: 5, createdAt: 1, updatedAt: 1,
  }));
}

async function setup(withSupport = true) {
  const t = convexTest(schema, modules);
  const client = await user(t, "client", "Client");
  const otherClient = await user(t, "client", "OtherClient");
  const adminA = await user(t, "admin", "AdminA");
  const adminB = await user(t, "admin", "AdminB");
  const company = await user(t, "company", "Company");
  const staff = await user(t, "company", "Staff");
  const seo = await user(t, "seo_team", "SEO");
  const companyId = await t.run(ctx => ctx.db.insert("companies", {
    name: "PRIVATE_COMPANY_NAME_SENTINEL", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
  }));
  const anotherCompanyId = await t.run(ctx => ctx.db.insert("companies", {
    name: "PRIVATE_OTHER_COMPANY_SENTINEL", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
  }));
  await t.run(async ctx => {
    await ctx.db.insert("companyMembers", { companyId, userId: company, role: "owner", status: "active", createdAt: 1 });
    await ctx.db.insert("companyMembers", { companyId, userId: staff, role: "staff", status: "active", createdAt: 1 });
    await ctx.db.insert("marketplaceSettings", { key: "global", commissionTiers: [
      { minAmountMad: 0, maxAmountMad: 300000, commissionRateBps: 300 },
      { minAmountMad: 300001, maxAmountMad: 500000, commissionRateBps: 500 },
      { minAmountMad: 500001, maxAmountMad: null, commissionRateBps: 1000 },
    ], commissionConfigVersion: 1, updatedAt: 1, updatedByUserId: adminA });
  });
  const projectId = await project(t, client);
  const state = { t, client, otherClient, adminA, adminB, company, staff, seo, companyId, anotherCompanyId, projectId };
  if (withSupport) await asUser(t, client).mutation(api.clientSupport.index.requestSupport, { projectId, requestKind: "free_help" });
  const source = await seedSource(state);
  return { ...state, ...source };
}
type BaseState = {
  t: Backend; client: Id<"users">; company: Id<"users">; companyId: Id<"companies">; projectId: Id<"projects">;
};
async function seedSource(s: BaseState, projectId = s.projectId, clientId = s.client, companyId = s.companyId) {
  return s.t.run(async ctx => {
    const initialQuoteId = await ctx.db.insert("projectQuotes", {
      projectId, companyId, submittedByUserId: s.company, message: "PRIVATE_PROPOSAL_SENTINEL", estimatedPrice: 918273.45,
      currency: "MAD", estimatedDuration: 90, availableStartDate: "2026-12-01", scope: "PRIVATE_INITIAL_SCOPE_SENTINEL",
      quoteType: "initial", status: "discussion_open", createdAt: 2, updatedAt: 2, submittedAt: 2,
    });
    const marketplaceConversationId = await ctx.db.insert("conversations", {
      projectId, quoteId: initialQuoteId, clientId, companyId, status: "active", createdBy: clientId, createdAt: 3, updatedAt: 3,
    });
    const finalQuoteId = await ctx.db.insert("finalQuotes", {
      projectId, clientId, companyId, initialQuoteId, conversationId: marketplaceConversationId,
      status: "submitted", requestedAt: 4, requestedByUserId: clientId, requestTrigger: "client_request", createdAt: 4, updatedAt: 4,
    });
    const revisionId = await ctx.db.insert("finalQuoteRevisions", {
      finalQuoteId, revisionNumber: 1, price: 918273.45, currency: "MAD", duration: 90,
      plannedStartDate: "2026-12-01", validUntil: "2026-12-31", scope: "PRIVATE_FINAL_SCOPE_SENTINEL",
      inclusions: "PRIVATE_INCLUSIONS_SENTINEL", exclusions: "PRIVATE_EXCLUSIONS_SENTINEL", paymentTerms: "PRIVATE_QUOTE_PAYMENT_SENTINEL",
      companyNote: "https://PRIVATE_QUOTE_URL_SENTINEL.test", pdfFileName: "PRIVATE_PDF_NAME_SENTINEL.pdf",
      submittedByUserId: s.company, submittedAt: 5, createdAt: 5,
    });
    await ctx.db.patch(finalQuoteId, { currentRevisionId: revisionId });
    return { initialQuoteId, marketplaceConversationId, finalQuoteId, revisionId };
  });
}
type State = Awaited<ReturnType<typeof setup>>;
type PublishArgs = FunctionArgs<typeof agreements.publishAdminDraft>;

async function ready(s: State, revisionId = s.revisionId, expectedReadinessRevision = 0) {
  return asUser(s.t, s.client).mutation(agreements.setMyReadiness, { projectId: s.projectId, revisionId, expectedReadinessRevision });
}
async function save(s: State, terms = TERMS, adminId = s.adminA) {
  const caller = asUser(s.t, adminId);
  const current = await caller.query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW });
  return caller.mutation(agreements.saveAdminDraft, { projectId: s.projectId, terms, expectedDraftRevision: current?.draftRevision ?? 0 });
}
async function publishArgs(s: State, key = "publish-1"): Promise<PublishArgs> {
  const current = await asUser(s.t, s.adminA).query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW });
  if (!current) throw Error("Missing fixture agreement");
  return { projectId: s.projectId, expectedDraftRevision: current.draftRevision, expectedReadinessRevision: current.readiness.revision,
    expectedPendingVersionId: current.pendingVersion?.id ?? null, expectedConfirmedVersionId: current.currentConfirmedVersion?.id ?? null,
    idempotencyKey: key, attestNotStarted: true };
}
async function prepare(s: State, terms = TERMS) {
  await ready(s);
  await save(s, terms);
  const args = await publishArgs(s);
  const result = await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, args);
  return { ...result, args };
}
async function confirm(s: State, versionId: Id<"coordinationAgreementVersions">, expectedConfirmedVersionId: Id<"coordinationAgreementVersions"> | null = null) {
  return asUser(s.t, s.client).mutation(agreements.confirmMyVersion, {
    projectId: s.projectId, versionId, expectedConfirmedVersionId, attestNotStarted: true,
  });
}
async function stored(s: State) {
  return s.t.run(async ctx => ({ agreements: await ctx.db.query("coordinationAgreements").collect(),
    versions: await ctx.db.query("coordinationAgreementVersions").collect() }));
}

function endpoints(caller: Caller, s: State, versionId: Id<"coordinationAgreementVersions">, args: PublishArgs) {
  const projectId = s.projectId;
  return {
    setMyReadiness: () => caller.mutation(agreements.setMyReadiness, { projectId, revisionId: s.revisionId, expectedReadinessRevision: 1 }),
    saveAdminDraft: () => caller.mutation(agreements.saveAdminDraft, { projectId, terms: TERMS, expectedDraftRevision: 2 }),
    publishAdminDraft: () => caller.mutation(agreements.publishAdminDraft, args),
    confirmMyVersion: () => caller.mutation(agreements.confirmMyVersion, { projectId, versionId, expectedConfirmedVersionId: null, attestNotStarted: true }),
    getMyAgreement: () => caller.query(agreements.getMyAgreement, { projectId, asOf: NOW }),
    getAdminAgreement: () => caller.query(agreements.getAdminAgreement, { projectId, asOf: NOW }),
    listMyVersions: () => caller.query(agreements.listMyVersions, { projectId, ...page() }),
    listAdminVersions: () => caller.query(agreements.listAdminVersions, { projectId, ...page() }),
  };
}
const clientEndpoints = ["setMyReadiness", "confirmMyVersion", "getMyAgreement", "listMyVersions"] as const;
const adminEndpoints = ["saveAdminDraft", "publishAdminDraft", "getAdminAgreement", "listAdminVersions"] as const;

describe("coordination agreement access", () => {
  test.each(["otherClient", "company", "staff", "seo", "anonymous"] as const)("every endpoint denies %s", async role => {
    const s = await setup(); const published = await prepare(s);
    await confirm(s, published.versionId);
    const before = await stored(s);
    const caller = role === "anonymous" ? s.t : asUser(s.t, s[role]);
    for (const call of Object.values(endpoints(caller, s, published.versionId, published.args))) await expect(call()).rejects.toThrow();
    expect(await stored(s)).toEqual(before);
  });

  test("admins cannot declare or confirm, and the owner cannot use admin endpoints", async () => {
    const s = await setup(); const published = await prepare(s);
    const adminCalls = endpoints(asUser(s.t, s.adminA), s, published.versionId, published.args);
    const clientCalls = endpoints(asUser(s.t, s.client), s, published.versionId, published.args);
    for (const name of clientEndpoints) await expect(adminCalls[name]()).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    for (const name of adminEndpoints) await expect(clientCalls[name]()).rejects.toThrow("ADMIN_REQUIRED");
  });

  test("current admin role is rechecked before publication retries and all admin reads/writes", async () => {
    const s = await setup(); const published = await prepare(s);
    await s.t.run(ctx => ctx.db.patch(s.adminA, { accountType: "company" }));
    const calls = endpoints(asUser(s.t, s.adminA), s, published.versionId, published.args);
    for (const name of adminEndpoints) await expect(calls[name]()).rejects.toThrow("ADMIN_REQUIRED");
    expect(await asUser(s.t, s.adminB).query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW })).not.toBeNull();
  });

  test.each(["owner", "supportClient", "capturedClient", "supportProject", "parentSupport", "deletedProject", "deletedSupport", "deletedClient", "clientRole", "clientOnboarding"] as const)(
    "%s relationship changes fail closed for all endpoints, including historical retries", async change => {
      const s = await setup(); const published = await prepare(s); await confirm(s, published.versionId);
      const parent = (await stored(s)).agreements[0];
      const otherProject = change === "supportProject" ? await project(s.t, s.otherClient) : null;
      await s.t.run(async ctx => {
        if (change === "owner") await ctx.db.patch(s.projectId, { clientId: s.otherClient });
        if (change === "supportClient") await ctx.db.patch(parent.supportConversationId, { clientId: s.otherClient });
        if (change === "capturedClient") await ctx.db.patch(parent._id, { clientId: s.otherClient });
        if (change === "supportProject") {
          await ctx.db.patch(parent.supportConversationId, { projectId: otherProject! });
        }
        if (change === "parentSupport") {
          const other = await ctx.db.insert("clientSupportConversations", { projectId: s.projectId, clientId: s.otherClient, entryCount: 0, createdAt: 1, updatedAt: 1 });
          await ctx.db.patch(parent._id, { supportConversationId: other });
        }
        if (change === "deletedProject") await ctx.db.delete(s.projectId);
        if (change === "deletedSupport") await ctx.db.delete(parent.supportConversationId);
        if (change === "deletedClient") await ctx.db.delete(s.client);
        if (change === "clientRole") await ctx.db.patch(s.client, { accountType: "company" });
        if (change === "clientOnboarding") await ctx.db.patch(s.client, { onboardingStatus: "pending" });
      });
      for (const role of ["client", "adminA"] as const) {
        const calls = endpoints(asUser(s.t, s[role]), s, published.versionId, published.args);
        for (const name of role === "client" ? clientEndpoints : adminEndpoints) await expect(calls[name]()).rejects.toThrow();
      }
      await expect(asUser(s.t, s.otherClient).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW })).rejects.toThrow();
    },
  );

  test("missing support never creates a request, parent, message or notification", async () => {
    const s = await setup(false);
    await expect(ready(s)).rejects.toThrow("COORDINATION_AGREEMENT_NOT_FOUND");
    await expect(asUser(s.t, s.adminA).mutation(agreements.saveAdminDraft, { projectId: s.projectId, terms: TERMS, expectedDraftRevision: 0 })).rejects.toThrow("COORDINATION_AGREEMENT_NOT_FOUND");
    expect(await stored(s)).toEqual({ agreements: [], versions: [] });
    for (const table of ["clientSupportConversations", "clientSupportMessages", "notifications"] as const) {
      expect(await s.t.run(ctx => ctx.db.query(table).collect())).toEqual([]);
    }
  });

  test("empty reads do not create records; drafts and editor metadata are hidden from Clients", async () => {
    const s = await setup(); const client = asUser(s.t, s.client); const admin = asUser(s.t, s.adminA);
    expect(await client.query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW })).toBeNull();
    expect((await admin.query(agreements.listAdminVersions, { projectId: s.projectId, ...page() })).page).toEqual([]);
    expect((await stored(s)).agreements).toEqual([]);
    await save(s, { ...TERMS, tasks: "PRIVATE_ADMIN_DRAFT_SENTINEL" });
    const read = await client.query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW });
    expect(read).not.toHaveProperty("draft"); expect(read).not.toHaveProperty("draftRevision");
    expect(JSON.stringify(read)).not.toContain("PRIVATE_ADMIN_DRAFT_SENTINEL");
    expect((await client.query(agreements.listMyVersions, { projectId: s.projectId, ...page() })).page).toEqual([]);
    expect(await admin.query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW })).toMatchObject({
      draftRevision: 1, draft: { terms: { tasks: "PRIVATE_ADMIN_DRAFT_SENTINEL" }, savedByDisplayName: "AdminA Test" },
    });
  });
});

describe("source readiness and lifecycle", () => {
  test.each(["draft", "changes_requested", "declined", "withdrawn"] as const)("quote %s is ineligible", async status => {
    const s = await setup(); await s.t.run(ctx => ctx.db.patch(s.finalQuoteId, { status }));
    await expect(ready(s)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
    expect((await stored(s)).agreements).toEqual([]);
  });

  test.each(["expired", "invalidDate", "closedConversation", "lockedQuote", "foreignQuoteClient", "foreignQuoteProject", "wrongConversationCompany", "wrongInitialCompany", "wrongConversationQuote", "wrongSelectedCompany", "wrongSelectedQuote", "deletedQuote", "deletedRevision", "deletedCompany", "deletedConversation", "deletedInitial", "foreignInvitation"] as const)(
    "%s blocks readiness, publication and pending confirmation", async change => {
      const s = await setup(); const published = await prepare(s);
      await save(s);
      const nextArgs = await publishArgs(s, "next");
      const otherProject = change === "foreignQuoteProject" ? await project(s.t, s.otherClient) : null;
      const anotherSource = change === "wrongSelectedQuote" ? await seedSource(s, s.projectId, s.client, s.anotherCompanyId) : null;
      await s.t.run(async ctx => {
        if (change === "expired") await ctx.db.patch(s.revisionId, { validUntil: "2026-10-06" });
        if (change === "invalidDate") await ctx.db.patch(s.revisionId, { validUntil: "2026-02-30" });
        if (change === "closedConversation") await ctx.db.patch(s.marketplaceConversationId, { status: "closed" });
        if (change === "lockedQuote") await ctx.db.patch(s.initialQuoteId, { status: "submitted" });
        if (change === "foreignQuoteClient") await ctx.db.patch(s.finalQuoteId, { clientId: s.otherClient });
        if (change === "foreignQuoteProject") await ctx.db.patch(s.finalQuoteId, { projectId: otherProject! });
        if (change === "wrongConversationCompany") await ctx.db.patch(s.marketplaceConversationId, { companyId: s.anotherCompanyId });
        if (change === "wrongInitialCompany") await ctx.db.patch(s.initialQuoteId, { companyId: s.anotherCompanyId });
        if (change === "wrongConversationQuote") await ctx.db.patch(s.marketplaceConversationId, { quoteId: undefined });
        if (change === "wrongSelectedCompany") await ctx.db.patch(s.projectId, { selectedCompanyId: s.anotherCompanyId });
        if (change === "wrongSelectedQuote") {
          await ctx.db.patch(s.projectId, { selectedFinalQuoteId: anotherSource!.finalQuoteId });
        }
        if (change === "deletedQuote") await ctx.db.delete(s.finalQuoteId);
        if (change === "deletedRevision") await ctx.db.delete(s.revisionId);
        if (change === "deletedCompany") await ctx.db.delete(s.companyId);
        if (change === "deletedConversation") await ctx.db.delete(s.marketplaceConversationId);
        if (change === "deletedInitial") await ctx.db.delete(s.initialQuoteId);
        if (change === "foreignInvitation") {
          const id = await ctx.db.insert("invitations", { projectId: s.projectId, companyId: s.companyId, clientUserId: s.otherClient,
            status: "accepted", createdAt: 1, updatedAt: 1 });
          await ctx.db.patch(s.marketplaceConversationId, { invitationId: id });
        }
      });
      await expect(ready(s, s.revisionId, 1)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
      await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, nextArgs)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
      await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
      const adminRead = await asUser(s.t, s.adminA).query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW });
      expect(adminRead?.readiness).toEqual({ eligible: false, declaredAt: NOW, revision: 1 });
      expect(adminRead?.pendingConfirmationStatus).toBe("source_unavailable");
      expect((await asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW }))?.pendingConfirmationStatus)
        .toBe("source_unavailable");
    },
  );

  test("another Client's otherwise valid quote cannot be declared", async () => {
    const s = await setup(); const otherProject = await project(s.t, s.otherClient);
    const foreign = await seedSource(s, otherProject, s.otherClient);
    await expect(ready(s, foreign.revisionId)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
  });

  test("source revision changes require new readiness and publication; preference ABA also invalidates pending", async () => {
    const s = await setup(); const published = await prepare(s);
    const nextRevisionId = await s.t.run(async ctx => {
      const previous = (await ctx.db.get(s.revisionId))!;
      const id = await ctx.db.insert("finalQuoteRevisions", {
        finalQuoteId: previous.finalQuoteId, revisionNumber: 2, price: previous.price, currency: previous.currency,
        duration: previous.duration, plannedStartDate: previous.plannedStartDate, validUntil: previous.validUntil,
        scope: previous.scope, inclusions: previous.inclusions, exclusions: previous.exclusions,
        paymentTerms: previous.paymentTerms, submittedByUserId: previous.submittedByUserId, submittedAt: NOW, createdAt: NOW,
      });
      await ctx.db.patch(s.finalQuoteId, { currentRevisionId: id }); return id;
    });
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
    await ready(s, nextRevisionId, 1);
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_READINESS_CONFLICT");
    const other = await seedSource(s, s.projectId, s.client, s.anotherCompanyId);
    await ready(s, other.revisionId, 2);
    await ready(s, nextRevisionId, 3);
    expect((await stored(s)).agreements[0].readinessRevision).toBe(4);
    await save(s); const next = await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, await publishArgs(s, "new-source"));
    await confirm(s, next.versionId);
  });

  test("changing preference away and back, or clearing it, blocks the old pending version", async () => {
    const s = await setup(); const published = await prepare(s);
    const another = await seedSource(s, s.projectId, s.client, s.anotherCompanyId);
    await ready(s, another.revisionId, 1); await ready(s, s.revisionId, 2);
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_READINESS_CONFLICT");
    await asUser(s.t, s.client).mutation(agreements.setMyReadiness, { projectId: s.projectId, revisionId: null, expectedReadinessRevision: 3 });
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_READINESS_CONFLICT");
  });

  test("unchanged readiness is a no-op with its current CAS token; stale declarations conflict", async () => {
    const s = await setup(); const first = await ready(s); const before = await stored(s);
    expect(await ready(s, s.revisionId, 1)).toEqual({ ...first, duplicate: true });
    expect(await stored(s)).toEqual(before);
    await expect(ready(s)).rejects.toThrow("COORDINATION_READINESS_CONFLICT");
  });

  test("expiry uses server time at publication and confirmation, even if query time is old", async () => {
    const s = await setup(); await s.t.run(ctx => ctx.db.patch(s.revisionId, { validUntil: TODAY }));
    const published = await prepare(s, { ...TERMS, startDate: "2026-10-09" });
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-08T00:00:00Z"));
    expect((await asUser(s.t, s.adminA).query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW }))?.readiness.eligible).toBe(true);
    expect((await asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW }))?.pendingConfirmationStatus).toBe("ready");
    expect((await asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: Date.now() }))?.pendingConfirmationStatus).toBe("source_unavailable");
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
    await save(s, { ...TERMS, startDate: "2026-10-09" });
    await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, await publishArgs(s, "expired"))).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
  });

  test.each(["legacy", "structured", "incomplete"] as const)("GEO9.2C %s: accepting the same eligible revision preserves pending confirmation and accepted readiness", async geography => {
    const s = await setup();
    if (geography !== "legacy") await s.t.run(ctx => ctx.db.patch(s.projectId, {
      city: undefined, locationMode: "structured", regionCode: "08",
      provinceCode: geography === "structured" ? "08.401" : undefined,
      localityName: geography === "structured" ? "Douar Aït Atlas" : undefined,
    }));
    const published = await prepare(s, { ...TERMS, startDate: "2027-02-01" });
    const beforeReads = await stored(s);
    const marketBeforeReads = await unrelatedSnapshot(s);
    await asUser(s.t, s.client).query(api.clientSupport.index.getMyConversation, { projectId: s.projectId });
    await asUser(s.t, s.adminA).query(api.clientSupport.index.getAdminConversation, { projectId: s.projectId });
    await asUser(s.t, s.adminA).query(api.clientSupport.index.listAdminConversations, page());
    expect(await stored(s)).toEqual(beforeReads);
    expect(await unrelatedSnapshot(s)).toEqual(marketBeforeReads);
    await asUser(s.t, s.client).mutation(api.finalQuotes.index.review, { finalQuoteId: s.finalQuoteId, revisionId: s.revisionId, action: "accept" });
    const marketBefore = await unrelatedSnapshot(s);
    vi.mocked(Date.now).mockReturnValue(Date.parse("2027-01-01T12:00:00Z"));
    expect((await asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: Date.now() }))?.pendingConfirmationStatus).toBe("ready");
    await confirm(s, published.versionId);
    expect(await unrelatedSnapshot(s)).toEqual(marketBefore);
    expect((await s.t.run(ctx => ctx.db.query("deals").collect()))).toHaveLength(1);
  });

  test.each(["acceptedRevision", "acceptedClient", "selectedCompany", "selectedFinalQuote"] as const)("accepted quote requires matching %s", async field => {
    const s = await setup();
    await asUser(s.t, s.client).mutation(api.finalQuotes.index.review, { finalQuoteId: s.finalQuoteId, revisionId: s.revisionId, action: "accept" });
    await s.t.run(async ctx => {
      if (field === "acceptedRevision") await ctx.db.patch(s.finalQuoteId, { acceptedRevisionId: undefined });
      if (field === "acceptedClient") await ctx.db.patch(s.finalQuoteId, { acceptedByUserId: s.otherClient });
      if (field === "selectedCompany") await ctx.db.patch(s.projectId, { selectedCompanyId: undefined });
      if (field === "selectedFinalQuote") await ctx.db.patch(s.projectId, { selectedFinalQuoteId: undefined });
    });
    await expect(ready(s)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
  });

  test.each(projectStatuses)("maps the actual %s project status; history and support remain accessible", async status => {
    const s = await setup(); const published = await prepare(s);
    await s.t.run(ctx => ctx.db.patch(s.projectId, { status }));
    await save(s); const args = await publishArgs(s, "status-next");
    const blocked = ["draft", "completed", "cancelled", "archived"].includes(status);
    const admin = asUser(s.t, s.adminA); const client = asUser(s.t, s.client);
    expect((await client.query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW }))?.projectAllowsNewActions).toBe(!blocked);
    expect((await client.query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW }))?.pendingConfirmationStatus)
      .toBe(blocked ? "project_blocked" : "ready");
    expect((await client.query(agreements.listMyVersions, { projectId: s.projectId, ...page() })).page).toHaveLength(1);
    expect(await client.query(api.clientSupport.index.getMyConversation, { projectId: s.projectId })).not.toBeNull();
    if (blocked) {
      await expect(admin.mutation(agreements.publishAdminDraft, args)).rejects.toThrow("COORDINATION_PROJECT_NOT_ELIGIBLE");
      await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_PROJECT_NOT_ELIGIBLE");
    } else {
      await confirm(s, published.versionId);
      const nextArgs = await publishArgs(s, "status-next"); delete nextArgs.attestNotStarted;
      const next = await admin.mutation(agreements.publishAdminDraft, nextArgs); await confirm(s, next.versionId, published.versionId);
    }
  });
});

describe("advisory pending confirmation status", () => {
  test("pending source relationships are checked even when the current readiness remains eligible", async () => {
    const s = await setup(); const published = await prepare(s);
    await s.t.run(async ctx => {
      const version = (await ctx.db.get(published.versionId))!;
      await ctx.db.patch(version._id, { readiness: { ...version.readiness, companyId: s.anotherCompanyId } });
    });
    const response = await asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW });
    expect(response?.readiness.eligible).toBe(true);
    expect(response?.pendingConfirmationStatus).toBe("source_unavailable");
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
  });

  test.each(["change", "clear", "awayAndBack"] as const)("fresh reads bind the pending version after readiness %s without exposing its source", async change => {
    const s = await setup(); const published = await prepare(s);
    const client = asUser(s.t, s.client); const admin = asUser(s.t, s.adminA);
    const read = () => Promise.all([
      client.query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW }),
      admin.query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW }),
    ]);
    const initial = await read();
    for (const response of initial) expect(response?.pendingConfirmationStatus).toBe("ready");
    const another = await seedSource(s, s.projectId, s.client, s.anotherCompanyId);
    if (change === "clear") await client.mutation(agreements.setMyReadiness, { projectId: s.projectId, revisionId: null, expectedReadinessRevision: 1 });
    else {
      await ready(s, another.revisionId, 1);
      if (change === "awayAndBack") await ready(s, s.revisionId, 2);
    }
    const beforeRead = await stored(s);
    const reloaded = await read();
    for (const [index, response] of reloaded.entries()) {
      expect(response?.pendingConfirmationStatus).toBe("readiness_changed");
      expect(response?.readiness.eligible).toBe(change !== "clear");
      expect(response?.pendingVersion).toEqual(initial[index]?.pendingVersion);
    }
    const encoded = JSON.stringify(reloaded);
    expect(encoded).not.toContain("PRIVATE_"); expect(encoded).not.toContain("918273.45");
    for (const id of [s.revisionId, s.finalQuoteId, s.companyId, s.marketplaceConversationId, s.initialQuoteId,
      another.revisionId, another.finalQuoteId, s.anotherCompanyId]) expect(encoded).not.toContain(id);
    expect(await stored(s)).toEqual(beforeRead);
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_READINESS_CONFLICT");
  });

  test("invalid pending replacement leaves confirmed terms, history and historical retries unchanged", async () => {
    const s = await setup(); const first = await prepare(s); await confirm(s, first.versionId);
    const client = asUser(s.t, s.client);
    const confirmed = await client.query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW });
    expect(confirmed?.pendingConfirmationStatus).toBeNull();
    await save(s, { ...TERMS, tasks: "Future replacement" });
    await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, await publishArgs(s, "replacement"));
    const historyBefore = await client.query(agreements.listMyVersions, { projectId: s.projectId, ...page() });
    const another = await seedSource(s, s.projectId, s.client, s.anotherCompanyId);
    await ready(s, another.revisionId, 1);
    const reloaded = await client.query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW });
    expect(reloaded?.pendingConfirmationStatus).toBe("readiness_changed");
    expect(reloaded?.currentConfirmedVersion).toEqual(confirmed?.currentConfirmedVersion);
    expect(await client.query(agreements.listMyVersions, { projectId: s.projectId, ...page() })).toEqual(historyBefore);
    const beforeRetry = await stored(s);
    expect((await confirm(s, first.versionId)).duplicate).toBe(true);
    expect(await stored(s)).toEqual(beforeRetry);
  });

  test.each(["start_date_passed", "declaration_missing"] as const)("reports %s using the confirmation gates", async status => {
    const s = await setup(); const published = await prepare(s);
    if (status === "start_date_passed") vi.mocked(Date.now).mockReturnValue(NOW + 86_400_000);
    else await s.t.run(ctx => ctx.db.patch(published.versionId, { adminNotStartedDeclaration: undefined }));
    expect((await asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: Date.now() }))?.pendingConfirmationStatus).toBe(status);
    await expect(confirm(s, published.versionId)).rejects.toThrow(status === "start_date_passed"
      ? "COORDINATION_START_DATE_PASSED" : "COORDINATION_NOT_STARTED_DECLARATION_REQUIRED");
  });

  test.each(["otherClient", "company", "staff", "seo", "anonymous"] as const)("pending advisory responses deny %s", async role => {
    const s = await setup(); await prepare(s);
    const caller = role === "anonymous" ? s.t : asUser(s.t, s[role]);
    await expect(caller.query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW })).rejects.toThrow();
    await expect(caller.query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW })).rejects.toThrow();
  });
});

describe("terms and declarations", () => {
  test("first publication and confirmation require independent server-recorded declarations", async () => {
    const s = await setup(); await ready(s); await save(s);
    const args = await publishArgs(s);
    for (const attestNotStarted of [undefined, false]) {
      await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, { ...args, attestNotStarted }))
        .rejects.toThrow("COORDINATION_NOT_STARTED_DECLARATION_REQUIRED");
    }
    const published = await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, args);
    for (const attestNotStarted of [undefined, false]) {
      await expect(asUser(s.t, s.client).mutation(agreements.confirmMyVersion, {
        projectId: s.projectId, versionId: published.versionId, expectedConfirmedVersionId: null, attestNotStarted,
      })).rejects.toThrow("COORDINATION_NOT_STARTED_DECLARATION_REQUIRED");
    }
    vi.mocked(Date.now).mockReturnValue(NOW + 5000);
    await confirm(s, published.versionId);
    const version = (await stored(s)).versions[0];
    expect(version.adminNotStartedDeclaration).toEqual({ declared: true, actorUserId: s.adminA, declaredAt: NOW });
    expect(version.confirmation).toEqual({ confirmedByUserId: s.client, confirmedByDisplayName: "Client Test",
      confirmedAt: NOW + 5000, effectiveFrom: NOW + 5000,
      notStartedDeclaration: { declared: true, actorUserId: s.client, declaredAt: NOW + 5000 } });
    expect(version.terms.payer).toBe(TERMS.payer);
    expect(version).not.toHaveProperty("payerConsent"); expect(version).not.toHaveProperty("paid");
  });

  test.each([0, -1, NaN, Infinity, 1.001, 0.291, Number.MAX_SAFE_INTEGER])("rejects non-positive/non-centime fixed amount %s without rounding", async amountMad => {
    const s = await setup();
    await expect(save(s, { ...TERMS, fee: { kind: "fixed", amountMad } })).rejects.toThrow("INVALID_COORDINATION_AMOUNT");
    expect((await stored(s)).agreements).toEqual([]);
  });
  test.each([0.01, 0.29, 1200.01])("preserves valid MAD centimes %s", async amountMad => {
    const s = await setup(); const published = await prepare(s, { ...TERMS, fee: { kind: "fixed", amountMad } });
    await confirm(s, published.versionId);
    expect((await stored(s)).versions[0].terms.fee).toEqual({ kind: "fixed", amountMad });
  });
  test.each(["0", "-1", "NaN", "Infinity", "1e2", "1,5", "01.5", ".1", "1.", "0.00", "9".repeat(65)])("rejects invalid percentage %s", async rate => {
    const s = await setup();
    await expect(save(s, { ...TERMS, fee: { kind: "percentage", rate, basis: "Explicitly negotiated basis" } }))
      .rejects.toThrow("INVALID_COORDINATION_PERCENTAGE");
  });
  test.each(["0.00000000000000000000000000000001", "2.123456789012345678901234567890", "150.0000"])(
    "preserves exact percentage %s without applying commission-rate limits or computing a fee", async rate => {
      const s = await setup(); const fee = { kind: "percentage" as const, rate, basis: "Explicitly agreed coordination scope base", basisAmountMad: 1000.29 };
      const published = await prepare(s, { ...TERMS, fee }); await confirm(s, published.versionId);
      const result = (await stored(s)).versions[0]; expect(result.terms.fee).toEqual(fee);
      expect(result.terms).not.toHaveProperty("computedFee"); expect(JSON.stringify(result.terms)).not.toContain("918273.45");
    },
  );
  test("percentage basis is mandatory and any explicitly supplied amount must have centime precision", async () => {
    const s = await setup();
    await expect(save(s, { ...TERMS, fee: { kind: "percentage", rate: "2", basis: " " } })).rejects.toThrow("INVALID_COORDINATION_TERMS");
    for (const basisAmountMad of [0, NaN, Infinity, 1.001]) {
      await expect(save(s, { ...TERMS, fee: { kind: "percentage", rate: "2", basis: "Agreed base", basisAmountMad } })).rejects.toThrow("INVALID_COORDINATION_AMOUNT");
    }
    await save(s, { ...TERMS, fee: { kind: "percentage", rate: "2", basis: "Explicit base without a numeric amount" } });
    expect((await stored(s)).agreements[0].draft?.fee).not.toHaveProperty("basisAmountMad");
  });
  test.each(["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-01", "0000-01-01", "2026-1-07", "2026-10-07T10:00Z"])("rejects invalid date %s", async startDate => {
    const s = await setup(); await expect(save(s, { ...TERMS, startDate })).rejects.toThrow("INVALID_COORDINATION_DATE");
  });
  test("real leap dates are accepted, past dates are never published, and delayed confirmation cannot backdate terms", async () => {
    const s = await setup(); await save(s, { ...TERMS, startDate: "2028-02-29" });
    await ready(s); await save(s, { ...TERMS, startDate: "2026-10-06" });
    await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, await publishArgs(s))).rejects.toThrow("COORDINATION_START_DATE_PASSED");
    await save(s); const published = await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, await publishArgs(s));
    vi.mocked(Date.now).mockReturnValue(NOW + 86_400_000);
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_START_DATE_PASSED");
    expect((await stored(s)).versions[0].confirmation).toBeUndefined();
  });
  test.each(Object.entries(TERM_LIMITS).filter(([field]) => field !== "basis"))("requires bounded explicit %s", async (field, maximum) => {
    const s = await setup();
    await expect(save(s, { ...TERMS, [field]: " " })).rejects.toThrow("INVALID_COORDINATION_TERMS");
    await expect(save(s, { ...TERMS, [field]: "x".repeat(maximum + 1) })).rejects.toThrow("INVALID_COORDINATION_TERMS");
    await save(s, { ...TERMS, [field]: ` ${"x".repeat(maximum)} ` });
  });
  test("schema rejects other currencies, incomplete terms, actor overrides and mixed fee variants", async () => {
    const s = await setup(); const admin = asUser(s.t, s.adminA);
    for (const terms of [{ ...TERMS, currency: "EUR" }, { tasks: "Partial terms" },
      { ...TERMS, fee: { kind: "fixed", amountMad: 100, rate: "2", basis: "Mixed" } }]) {
      await expect(admin.mutation(agreements.saveAdminDraft, {
        projectId: s.projectId, expectedDraftRevision: 0, terms: terms as Terms,
      })).rejects.toThrow();
    }
    await expect(admin.mutation(agreements.saveAdminDraft, {
      projectId: s.projectId, expectedDraftRevision: 0, terms: TERMS, actorUserId: s.client,
    } as FunctionArgs<typeof agreements.saveAdminDraft>)).rejects.toThrow();
  });
});

describe("exact versions, retry safety and concurrency", () => {
  test("publication consumes the draft CAS token; stale saves/pointers/readiness conflict", async () => {
    const s = await setup(); await ready(s); await save(s); const oldArgs = await publishArgs(s);
    await save(s, { ...TERMS, tasks: "New complete draft" });
    await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, oldArgs)).rejects.toThrow("COORDINATION_DRAFT_CONFLICT");
    const args = await publishArgs(s); const published = await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, args);
    await expect(asUser(s.t, s.adminB).mutation(agreements.saveAdminDraft, { projectId: s.projectId, expectedDraftRevision: args.expectedDraftRevision, terms: TERMS }))
      .rejects.toThrow("COORDINATION_DRAFT_CONFLICT");
    await save(s); const next = await publishArgs(s, "next");
    await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, { ...next, expectedPendingVersionId: null })).rejects.toThrow("COORDINATION_VERSION_CONFLICT");
    await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, { ...next, expectedReadinessRevision: 0 })).rejects.toThrow("COORDINATION_READINESS_CONFLICT");
    expect((await stored(s)).versions).toHaveLength(1); await confirm(s, published.versionId);
  });
  test("publication keys are normalized, admin-scoped and bind all input pointers/attestation", async () => {
    const s = await setup(); const published = await prepare(s); const before = await stored(s);
    const admin = asUser(s.t, s.adminA);
    expect(await admin.mutation(agreements.publishAdminDraft, { ...published.args, idempotencyKey: " publish-1 " }))
      .toEqual({ versionId: published.versionId, versionNumber: 1, publishedAt: NOW, duplicate: true });
    for (const fields of [{ expectedDraftRevision: 5 }, { expectedReadinessRevision: 8 }, { expectedPendingVersionId: published.versionId },
      { expectedConfirmedVersionId: published.versionId }, { attestNotStarted: false }]) {
      await expect(admin.mutation(agreements.publishAdminDraft, { ...published.args, ...fields })).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
    }
    expect(await stored(s)).toEqual(before);
    await save(s); const nextArgs = await publishArgs(s, "publish-1");
    const next = await asUser(s.t, s.adminB).mutation(agreements.publishAdminDraft, nextArgs);
    expect(next.versionNumber).toBe(2); expect(next.duplicate).toBe(false);
    const anotherProject = await project(s.t, s.client);
    await asUser(s.t, s.client).mutation(api.clientSupport.index.requestSupport, { projectId: anotherProject, requestKind: "free_help" });
    await admin.mutation(agreements.saveAdminDraft, { projectId: anotherProject, terms: TERMS, expectedDraftRevision: 0 });
    await expect(admin.mutation(agreements.publishAdminDraft, { ...published.args, projectId: anotherProject })).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
  });
  test.each(["", " ", "x".repeat(101), "unsafe key", "clé", "key/1"])("rejects invalid publication key %s", async idempotencyKey => {
    const s = await setup(); await ready(s); await save(s);
    await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, { ...await publishArgs(s), idempotencyKey })).rejects.toThrow("INVALID_IDEMPOTENCY_KEY");
  });
  test("identical publication and confirmation retries are historical no-ops after deletion/closure", async () => {
    const s = await setup(); const published = await prepare(s); const confirmation = await confirm(s, published.versionId);
    await s.t.run(async ctx => { await ctx.db.delete(s.revisionId); await ctx.db.patch(s.projectId, { status: "archived" }); });
    const before = await stored(s); vi.mocked(Date.now).mockReturnValue(NOW + 100000);
    expect(await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, published.args)).toMatchObject({ versionId: published.versionId, publishedAt: NOW, duplicate: true });
    expect(await asUser(s.t, s.client).mutation(agreements.confirmMyVersion, {
      projectId: s.projectId, versionId: published.versionId, expectedConfirmedVersionId: null,
    })).toEqual({ ...confirmation, duplicate: true });
    expect(await stored(s)).toEqual(before);
    expect((await asUser(s.t, s.client).query(agreements.listMyVersions, { projectId: s.projectId, ...page() })).page[0].confirmation?.confirmedAt).toBe(NOW);
  });
  test("a superseded pending version cannot be confirmed, including a version from another project", async () => {
    const s = await setup(); const first = await prepare(s);
    await save(s); const second = await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, await publishArgs(s, "second"));
    await expect(confirm(s, first.versionId)).rejects.toThrow("COORDINATION_VERSION_CONFLICT");
    const otherProject = await project(s.t, s.client);
    await asUser(s.t, s.client).mutation(api.clientSupport.index.requestSupport, { projectId: otherProject, requestKind: "free_help" });
    await asUser(s.t, s.adminA).mutation(agreements.saveAdminDraft, { projectId: otherProject, terms: TERMS, expectedDraftRevision: 0 });
    await expect(asUser(s.t, s.client).mutation(agreements.confirmMyVersion, { projectId: otherProject, versionId: second.versionId, expectedConfirmedVersionId: null, attestNotStarted: true }))
      .rejects.toThrow("COORDINATION_VERSION_NOT_FOUND");
    await confirm(s, second.versionId);
  });
  test("replacement leaves the current confirmed version intact until fresh confirmation; no never-started declaration is required", async () => {
    const s = await setup(); const first = await prepare(s); const firstConfirmed = await confirm(s, first.versionId);
    const firstStored = (await stored(s)).versions[0];
    vi.mocked(Date.now).mockReturnValue(NOW + 10000);
    await save(s, { ...TERMS, tasks: "Future additional coordination", startDate: "2026-10-09" });
    const args = await publishArgs(s, "amendment"); delete args.attestNotStarted;
    const second = await asUser(s.t, s.adminB).mutation(agreements.publishAdminDraft, args);
    expect((await stored(s)).agreements[0].currentConfirmedVersionId).toBe(first.versionId);
    expect((await stored(s)).versions[0]).toEqual(firstStored);
    await expect(confirm(s, second.versionId)).rejects.toThrow("COORDINATION_VERSION_CONFLICT");
    const confirmation = await asUser(s.t, s.client).mutation(agreements.confirmMyVersion, {
      projectId: s.projectId, versionId: second.versionId, expectedConfirmedVersionId: first.versionId,
    });
    expect(confirmation.effectiveFrom).toBe(Date.parse("2026-10-09T00:00:00Z"));
    const final = await stored(s);
    expect(final.agreements[0].currentConfirmedVersionId).toBe(second.versionId);
    expect(final.versions[0]).toEqual(firstStored);
    expect(final.versions[1].adminNotStartedDeclaration).toBeUndefined();
    expect(final.versions[1].confirmation?.notStartedDeclaration).toBeUndefined();
    expect(final.versions[1].replacesVersionId).toBe(first.versionId);
    expect(await confirm(s, first.versionId)).toEqual({ ...firstConfirmed, duplicate: true });
    expect(await stored(s)).toEqual(final);
  });
  test("parallel creation and draft saves preserve a single parent and reject stale editors", async () => {
    const s = await setup();
    const results = await Promise.allSettled([
      ready(s),
      asUser(s.t, s.adminA).mutation(agreements.saveAdminDraft, { projectId: s.projectId, terms: TERMS, expectedDraftRevision: 0 }),
      asUser(s.t, s.adminB).mutation(agreements.saveAdminDraft, { projectId: s.projectId, terms: { ...TERMS, tasks: "Other editor" }, expectedDraftRevision: 0 }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const state = await stored(s); expect(state.agreements).toHaveLength(1);
    expect(state.agreements[0]).toMatchObject({ draftRevision: 1, readinessRevision: 1 });
  });
  test("parallel identical publication and confirmation each create one result", async () => {
    const s = await setup(); await ready(s); await save(s); const args = await publishArgs(s);
    const publications = await Promise.all([1, 2, 3].map(() => asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, args)));
    expect(new Set(publications.map(r => r.versionId)).size).toBe(1);
    expect(publications.filter(r => !r.duplicate)).toHaveLength(1);
    const confirmations = await Promise.all([1, 2, 3].map(() => confirm(s, publications[0].versionId)));
    expect(confirmations.filter(r => !r.duplicate)).toHaveLength(1);
    expect((await stored(s)).versions).toHaveLength(1);
  });
  test("different publication keys cannot consume the same draft twice", async () => {
    const s = await setup(); await ready(s); await save(s); const args = await publishArgs(s);
    const results = await Promise.allSettled(["one", "two"].map(idempotencyKey => asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, { ...args, idempotencyKey })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await stored(s)).versions).toHaveLength(1);
  });
  test("concurrent preference change and publication cannot publish against the changed readiness token", async () => {
    const s = await setup(); await ready(s); await save(s); const args = await publishArgs(s);
    const another = await seedSource(s, s.projectId, s.client, s.anotherCompanyId);
    const results = await Promise.allSettled([
      ready(s, another.revisionId, 1),
      asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, args),
    ]);
    expect(results[0].status).toBe("fulfilled");
    const after = await stored(s); expect(after.agreements[0].readinessRevision).toBe(2);
    if (results[1].status === "fulfilled") {
      await expect(confirm(s, results[1].value.versionId)).rejects.toThrow("COORDINATION_READINESS_CONFLICT");
    } else expect(String(results[1].reason)).toContain("COORDINATION_READINESS_CONFLICT");
    expect(after.versions.every(version => !version.confirmation)).toBe(true);
  });
  test("missing readiness blocks publication and corrupt version/client relationships fail closed", async () => {
    const s = await setup(); await save(s);
    await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, await publishArgs(s))).rejects.toThrow("COORDINATION_READINESS_NOT_ELIGIBLE");
    await ready(s); const args = await publishArgs(s);
    const published = await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, args);
    await s.t.run(async ctx => {
      const version = (await ctx.db.get(published.versionId))!;
      await ctx.db.patch(version._id, { readiness: { ...version.readiness, declaredByUserId: s.otherClient } });
    });
    await expect(confirm(s, published.versionId)).rejects.toThrow("COORDINATION_VERSION_NOT_FOUND");
    await expect(asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, args)).rejects.toThrow("COORDINATION_VERSION_NOT_FOUND");
    await expect(asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW })).rejects.toThrow("COORDINATION_VERSION_NOT_FOUND");
    await expect(asUser(s.t, s.adminA).query(agreements.listAdminVersions, { projectId: s.projectId, ...page() })).rejects.toThrow("COORDINATION_VERSION_NOT_FOUND");
  });
  test.each(["confirmationFirst", "publicationFirst"])("replacement/confirmation race is atomic (%s)", async order => {
    const s = await setup(); const first = await prepare(s); await save(s); const args = await publishArgs(s, "replacement");
    const confirmation = () => confirm(s, first.versionId);
    const publication = () => asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, args);
    const actions = order === "confirmationFirst" ? [confirmation, publication] : [publication, confirmation];
    const results = await Promise.allSettled(actions.map(action => action()));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find(r => r.status === "rejected");
    expect(failed?.status === "rejected" ? String(failed.reason) : "").toContain("COORDINATION_VERSION_CONFLICT");
    const snapshot = await stored(s);
    expect(snapshot.versions.filter(v => v.confirmation).length + (snapshot.agreements[0].pendingVersionId ? 1 : 0)).toBe(1);
  });
});

async function unrelatedSnapshot(s: State) {
  return s.t.run(async ctx => {
    const tables = ["projects", "projectStatusHistory", "projectQuotes", "quoteStatusHistory", "finalQuotes", "finalQuoteRevisions",
      "invitations", "invitationStatusHistory", "marketplaceActivity", "deals", "dealStatusHistory", "commissionStatusHistory", "companyCommissionSummaries",
      "companyVerificationHistory", "marketplaceSettings", "conversations", "messages", "messageAttachments", "projectAttachments",
      "adminCompanyConversations", "adminCompanyMessages", "adminCompanyConversationReads",
      "clientSupportConversations", "clientSupportMessages", "clientSupportConversationReads", "notifications", "pushSubscriptions"] as const;
    const rows = await Promise.all(tables.map(async table => [table, await ctx.db.query(table).collect()]));
    return { ...Object.fromEntries(rows), scheduled: await ctx.db.system.query("_scheduled_functions").collect() };
  });
}

describe("privacy, pagination and unrelated domains", () => {
  test("safe DTOs exclude private source data; agreement writes do not touch any marketplace/OC2/support/notification records", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      const messageId = await ctx.db.insert("messages", { conversationId: s.marketplaceConversationId, senderUserId: s.company,
        senderType: "company", body: "PRIVATE_MARKETPLACE_MESSAGE_SENTINEL", createdAt: 1 });
      const storageId = await ctx.storage.store(new Blob(["PRIVATE_PDF_CONTENT_SENTINEL"], { type: "application/pdf" }));
      await ctx.db.patch(s.revisionId, { pdfStorageId: storageId });
      await ctx.db.insert("messageAttachments", { conversationId: s.marketplaceConversationId, messageId, storageId,
        uploadedByUserId: s.company, kind: "pdf", originalFileName: "PRIVATE_ATTACHMENT_SENTINEL.pdf", mimeType: "application/pdf", sizeBytes: 25, createdAt: 1 });
      const oc2 = await ctx.db.insert("adminCompanyConversations", { companyId: s.companyId, messageCount: 1, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("adminCompanyMessages", { conversationId: oc2, companyId: s.companyId, senderUserId: s.adminA,
        senderType: "admin", body: "PRIVATE_OC2_MESSAGE_SENTINEL", idempotencyKey: "oc2-fixture", sequence: 1, createdAt: 1 });
      await ctx.db.insert("adminCompanyConversationReads", { conversationId: oc2, userId: s.adminA, readThroughSequence: 1, updatedAt: 1 });
    });
    const supportConversation = await asUser(s.t, s.client).query(api.clientSupport.index.getMyConversation, { projectId: s.projectId });
    await asUser(s.t, s.adminA).mutation(api.clientSupport.index.sendAdminMessage, {
      conversationId: supportConversation!.id, body: "PRIVATE_SUPPORT_MESSAGE_SENTINEL", idempotencyKey: "support-fixture",
    });
    const before = await unrelatedSnapshot(s);
    const published = await prepare(s); await confirm(s, published.versionId);
    const responses = [
      await asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW }),
      await asUser(s.t, s.adminA).query(agreements.getAdminAgreement, { projectId: s.projectId, asOf: NOW }),
      await asUser(s.t, s.client).query(agreements.listMyVersions, { projectId: s.projectId, ...page() }),
      await asUser(s.t, s.adminA).query(agreements.listAdminVersions, { projectId: s.projectId, ...page() }),
    ];
    const encoded = JSON.stringify(responses);
    expect(encoded).not.toContain("PRIVATE_"); expect(encoded).not.toContain("918273.45");
    for (const id of [s.revisionId, s.finalQuoteId, s.companyId, s.marketplaceConversationId, s.initialQuoteId]) expect(encoded).not.toContain(id);
    for (const key of ["publicationKey", "publicationInput", "declaredByUserId", "pdfStorageId", "actorUserId", "email", "phone"])
      expect(encoded).not.toContain(`"${key}"`);
    expect(responses[1]).toMatchObject({ readiness: { eligible: true, declaredAt: NOW, revision: 1 } });
    await save(s, { ...TERMS, tasks: "PRIVATE_UNPUBLISHED_DRAFT_SENTINEL" });
    expect(JSON.stringify(await asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf: NOW })))
      .not.toContain("PRIVATE_UNPUBLISHED_DRAFT_SENTINEL");
    expect(await unrelatedSnapshot(s)).toEqual(before);
    expect(before.scheduled).toEqual([]);
  });

  test("both roles page ordered published history; drafts stay absent and independent of message reads", async () => {
    const s = await setup(); await ready(s);
    for (let number = 1; number <= 6; number++) {
      await save(s, { ...TERMS, tasks: `Version ${number}` });
      await asUser(s.t, s.adminA).mutation(agreements.publishAdminDraft, await publishArgs(s, `version-${number}`));
    }
    const pending = (await stored(s)).agreements[0].pendingVersionId!; await confirm(s, pending);
    await save(s, { ...TERMS, tasks: "Hidden next draft" });
    const before = await unrelatedSnapshot(s);
    for (const [caller, endpoint] of [[asUser(s.t, s.client), agreements.listMyVersions], [asUser(s.t, s.adminA), agreements.listAdminVersions]] as const) {
      const first = await caller.query(endpoint, { projectId: s.projectId, ...page(2) });
      const second = await caller.query(endpoint, { projectId: s.projectId, ...page(2, first.continueCursor) });
      const third = await caller.query(endpoint, { projectId: s.projectId, ...page(2, second.continueCursor) });
      expect([...first.page, ...second.page, ...third.page].map(v => v.versionNumber)).toEqual([6, 5, 4, 3, 2, 1]);
      expect(first.page[0]).toMatchObject({ status: "confirmed", isCurrentConfirmed: true });
      expect(first.page[1]).toMatchObject({ status: "superseded", isCurrentConfirmed: false });
      expect(third.isDone).toBe(true);
      for (const size of [0, -1, 1.5, 26, Infinity]) await expect(caller.query(endpoint, { projectId: s.projectId, ...page(size) })).rejects.toThrow();
    }
    expect(await unrelatedSnapshot(s)).toEqual(before);
  });

  test("foreign history cursors cannot bypass project access", async () => {
    const s = await setup(); await prepare(s);
    const first = await asUser(s.t, s.client).query(agreements.listMyVersions, { projectId: s.projectId, ...page(1) });
    await expect(asUser(s.t, s.otherClient).query(agreements.listMyVersions, { projectId: s.projectId, ...page(1, first.continueCursor) }))
      .rejects.toThrow("PROJECT_NOT_FOUND");
  });

  test("invalid CAS tokens and query clocks are rejected", async () => {
    const s = await setup();
    for (const value of [-1, 0.1, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
      await expect(ready(s, s.revisionId, value)).rejects.toThrow("INVALID_COORDINATION_REVISION");
      await expect(asUser(s.t, s.adminA).mutation(agreements.saveAdminDraft, { projectId: s.projectId, terms: TERMS, expectedDraftRevision: value }))
        .rejects.toThrow("INVALID_COORDINATION_REVISION");
    }
    for (const asOf of [-1, NaN, Infinity, 0.1]) {
      await expect(asUser(s.t, s.client).query(agreements.getMyAgreement, { projectId: s.projectId, asOf })).rejects.toThrow("INVALID_COORDINATION_TIME");
      await expect(asUser(s.t, s.adminA).query(agreements.getAdminAgreement, { projectId: s.projectId, asOf })).rejects.toThrow("INVALID_COORDINATION_TIME");
    }
  });
});
