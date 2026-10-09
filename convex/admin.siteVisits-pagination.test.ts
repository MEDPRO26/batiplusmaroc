/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { getProvincesByRegion, getRegions } from "../lib/geography/morocco";
import {
  MAX_PROJECT_ASSESSMENT_SYNC,
  adminVisitEpoch,
  selectedVisitForAssessment,
  syncAssessmentAdminProjection,
} from "./siteVisits/adminProjection";

const modules = import.meta.glob("./**/*.ts");
const policy = "ADMIN_SITE_VISIT_GEOGRAPHY_POLICY_VERSION";
type Args = FunctionArgs<typeof api.admin.siteVisits.listSiteVisitsPage>;
type Filters = Omit<Args, "paginationOpts">;
type Page = FunctionReturnType<typeof api.admin.siteVisits.listSiteVisitsPage>;
const filters: Filters = { status: "all", now: Date.UTC(2026, 9, 9, 12) };
const options = { numItems: 25, cursor: null };
beforeEach(() => vi.stubEnv(policy, "indexed_v1"));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function setup() {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => Promise.all([
    ctx.db.insert("users", { accountType: "admin", firstName: "Ada" }),
    ctx.db.insert("users", { accountType: "client", onboardingStatus: "completed", firstName: "Client", email: "PRIVATE_EMAIL", phone: "PRIVATE_PHONE" }),
    ctx.db.insert("users", { accountType: "company", onboardingStatus: "completed" }),
  ]));
  const [adminId, clientId, companyUserId] = users;
  const companyId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("companies", { name: "Atlas Build", slug: "atlas", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("companyMembers", { companyId: id, userId: companyUserId, role: "owner", status: "active", createdAt: 1 });
    return id;
  });
  const asUser = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session`, tokenIdentifier: `test|${id}` });
  return { t, adminId, clientId, companyUserId, companyId, asUser, admin: asUser(adminId), client: asUser(clientId), company: asUser(companyUserId) };
}
type State = Awaited<ReturnType<typeof setup>>;

// Reader fixtures explicitly model already projected records. Missing-history tests
// insert untouched pre-feature documents; neither reader can populate them.
async function record(state: State, input: {
  title?: string; invitedAt?: number; createdAt?: number; status?: Doc<"siteAssessments">["status"];
  regionCode?: string | null; provinceCode?: string | null; visibility?: "marketplace" | "invite_only";
  projected?: boolean; projectStatus?: Doc<"projects">["status"];
} = {}) {
  return state.t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      clientId: state.clientId, title: input.title ?? "Rural roof project", countryCode: "MA", city: "rabat",
      regionCode: input.regionCode === null ? undefined : input.regionCode ?? "05",
      provinceCode: input.provinceCode === null ? undefined : input.provinceCode ?? "05.081",
      localityName: "Douar ⵜⴰⵎⵍⵉⵍ", locationMode: "structured", visibility: input.visibility ?? "marketplace",
      status: input.projectStatus ?? "in_discussion", surfaceUnknown: true, lastCompletedStep: 6, createdAt: 1, updatedAt: 1,
    });
    const quoteId = await ctx.db.insert("projectQuotes", {
      projectId, companyId: state.companyId, submittedByUserId: state.companyUserId, message: "Initial quote", currency: "MAD",
      estimatedPrice: 100_000, estimatedDuration: 10, availableStartDate: "2026-10-20", scope: "Survey and renovation",
      quoteType: "initial", status: "discussion_open", createdAt: 1, updatedAt: 1, submittedAt: 1,
    });
    const conversationId = await ctx.db.insert("conversations", {
      projectId, quoteId, clientId: state.clientId, companyId: state.companyId, status: "active", createdBy: state.clientId, createdAt: 1, updatedAt: 1,
    });
    const assessmentId = await ctx.db.insert("siteAssessments", {
      projectId, clientId: state.clientId, companyId: state.companyId, initialQuoteId: quoteId, conversationId,
      invitedByUserId: state.clientId, invitedAt: input.invitedAt ?? 100, status: input.status ?? "invited", active: true,
      siteAddress: "PRIVATE_ASSESSMENT_ADDRESS", createdAt: input.createdAt ?? 1, updatedAt: 1,
    });
    if (input.projected !== false) await syncAssessmentAdminProjection(ctx, assessmentId);
    return { projectId, quoteId, conversationId, assessmentId };
  });
}
type RecordIds = Awaited<ReturnType<typeof record>>;
async function visit(state: State, ids: RecordIds, input: Partial<Doc<"siteVisits">> = {}) {
  return state.t.run(async (ctx) => {
    const id = await ctx.db.insert("siteVisits", {
      assessmentId: ids.assessmentId, projectId: ids.projectId, clientId: state.clientId, companyId: state.companyId,
      conversationId: ids.conversationId, initialQuoteId: ids.quoteId, proposedByUserId: state.companyUserId,
      proposedDate: "2026-10-15", proposedTime: "10:00", timezone: "Africa/Casablanca", proposedAt: 200,
      siteAddress: "PRIVATE_VISIT_ADDRESS", status: "proposed", active: true, createdAt: 200, updatedAt: 200,
      ...input,
    });
    await syncAssessmentAdminProjection(ctx, ids.assessmentId);
    return id;
  });
}
async function pages(state: State, args: Filters = filters, numItems = 25, maximumRowsRead?: number) {
  const results: Page[] = [];
  const rows: Page["page"] = [];
  let cursor: string | null = null;
  for (let count = 0; count < 300; count++) {
    const page: Page = await state.admin.query(api.admin.siteVisits.listSiteVisitsPage, {
      ...args, paginationOpts: { numItems, cursor, ...(maximumRowsRead === undefined ? {} : { maximumRowsRead }) },
    });
    results.push(page); rows.push(...page.page);
    if (page.isDone) return { rows, results };
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }
  throw new Error("Reader failed to exhaust the fixture");
}
const idsOf = (rows: Page["page"]) => rows.map((row) => row.assessmentId);

describe("GEO9.1C indexed Admin reader", () => {
  test("202 assessments have no total cap, duplicates or missing rows; a late private match remains reachable", async () => {
    const s = await setup();
    const target = await record(s, { invitedAt: 1, title: "The RURAL ROOF target", visibility: "invite_only" });
    for (let index = 0; index < 201; index++) await record(s, { invitedAt: index + 2, title: "Other project" });
    const all = await pages(s);
    expect(all.rows).toHaveLength(202);
    expect(new Set(idsOf(all.rows)).size).toBe(202);
    expect(all.rows.map((row) => row.sortAt)).toEqual(Array.from({ length: 202 }, (_, i) => 202 - i));
    expect(all.rows.at(-1)?.assessmentId).toBe(target.assessmentId);
    const found = await pages(s, { ...filters, projectSearch: "  RURAL   ROOF  ", companySearch: "ATLAS", city: "rabat", regionCode: "05", provinceCode: "05.081" }, 20, 11);
    expect(idsOf(found.rows)).toEqual([target.assessmentId]);
    expect(found.results.filter((page) => !page.isDone && !page.page.length).length).toBeGreaterThan(10);
    expect(found.results.at(-1)?.isDone).toBe(true);
    expect(await s.admin.query(api.admin.siteVisits.listSiteVisits, { ...filters, projectSearch: "rural roof" })).toEqual([]);
  });

  test("global visit/invitation ordering, malformed fallback and no-visit rows reproduce the array reader", async () => {
    const s = await setup();
    await record(s, { invitedAt: Date.UTC(2026, 9, 15, 8, 30), createdAt: 9e12 });
    const first = await record(s, { invitedAt: 1 });
    await visit(s, first, { proposedDate: "2026-10-15", proposedTime: "10:00", proposedAt: 1 });
    const invalid = await record(s, { invitedAt: 999 });
    await visit(s, invalid, { proposedDate: "invalid", proposedAt: 2 });
    const last = await record(s, { invitedAt: 1, createdAt: 9e12 });
    const legacy = await s.admin.query(api.admin.siteVisits.listSiteVisits, filters);
    expect(idsOf((await pages(s, filters, 1)).rows)).toEqual(idsOf(legacy));
    expect(legacy[0].assessmentId).toBe(first.assessmentId);
    expect(legacy[0].sortAt).toBe(Date.UTC(2026, 9, 15, 9));
    expect(legacy.at(-1)).toMatchObject({ assessmentId: last.assessmentId, visitDate: null });
    expect(legacy.find((row) => row.assessmentId === invalid.assessmentId)?.sortAt).toBe(2);
  });

  test("tied timestamps retain the original assessment-creation tie order across every index", async () => {
    const s = await setup();
    for (let n = 0; n < 9; n++) await record(s, { invitedAt: 10, createdAt: 99_000 - n });
    const expected = idsOf(await s.admin.query(api.admin.siteVisits.listSiteVisits, filters));
    for (const geo of [{}, { regionCode: "05" }, { regionCode: "05", provinceCode: "05.081" }]) {
      expect(idsOf((await pages(s, { ...filters, ...geo }, 1)).rows)).toEqual(expected);
    }
  });

  test("date bounds include Morocco-local invitation days and selected visit days, not creation dates", async () => {
    const s = await setup();
    const invitation = await record(s, { invitedAt: Date.UTC(2026, 9, 9, 23, 30) });
    const planned = await record(s); await visit(s, planned, { proposedDate: "2026-10-12" });
    expect(idsOf((await pages(s, { ...filters, dateFrom: "2026-10-10", dateTo: "2026-10-10" })).rows)).toEqual([invitation.assessmentId]);
    expect(idsOf((await pages(s, { ...filters, dateFrom: "2026-10-12", dateTo: "2026-10-12", status: "proposed" })).rows)).toEqual([planned.assessmentId]);
  });

  test("status, title, company, city, dates and geography intersect without changing private visibility", async () => {
    const s = await setup(); const item = await record(s, { title: "RURAL roof target", visibility: "invite_only" });
    await visit(s, item, { status: "confirmed" });
    const matching: Filters = { ...filters, status: "confirmed", projectSearch: " rural   roof ", companySearch: " atlas ", city: "rabat", dateFrom: "2026-10-15", dateTo: "2026-10-15", regionCode: "05", provinceCode: "05.081" };
    expect(idsOf((await pages(s, matching)).rows)).toEqual([item.assessmentId]);
    for (const changed of [{ status: "accepted" as const }, { projectSearch: "absent" }, { companySearch: "other" }, { city: "agadir" as const }, { dateFrom: "2026-10-16", dateTo: undefined }, { regionCode: "09", provinceCode: "09.541" }]) {
      expect((await pages(s, { ...matching, ...changed })).rows).toEqual([]);
    }
  });

  test("short intermediate pages and native split/end-cursor metadata pass through unchanged", async () => {
    const s = await setup();
    for (let n = 0; n < 12; n++) await record(s, { invitedAt: n, title: n === 11 ? "Match" : "Other" });
    const first = await s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, projectSearch: "match", paginationOpts: { numItems: 6, cursor: null } });
    expect(first.page).toHaveLength(1); expect(first.isDone).toBe(false);
    const raw = await s.t.query((ctx) => ctx.db.query("siteAssessments").withIndex("by_adminSortAt").order("desc").paginate({ numItems: 9, cursor: null }));
    const opts = { numItems: 1, cursor: null, endCursor: raw.continueCursor, id: 7, maximumRowsRead: 12, maximumBytesRead: 100_000 };
    const native = await s.t.query((ctx) => ctx.db.query("siteAssessments").withIndex("by_adminSortAt").order("desc").paginate(opts));
    const actual = await s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: opts });
    expect(idsOf(actual.page)).toEqual(native.page.map((row) => row._id));
    expect(actual).toMatchObject({ isDone: native.isDone, continueCursor: native.continueCursor });
    const limited = { numItems: 10, cursor: null, maximumRowsRead: 2, maximumBytesRead: 100_000 };
    const split = await s.t.query((ctx) => ctx.db.query("siteAssessments").withIndex("by_adminSortAt").order("desc").paginate(limited));
    const limitedPage = await s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: limited });
    expect(limitedPage).toEqual({ ...split, page: expect.any(Array) });
    expect(limitedPage.isDone).toBe(false);
    expect(["SplitRecommended", "SplitRequired"]).toContain(limitedPage.pageStatus);
    expect(limitedPage.splitCursor).toBeTruthy();
  });

  test.each(getRegions().map((region) => [region.code] as const))("supports catalogue region %s and its dependent province", async (regionCode) => {
    const s = await setup(); const provinceCode = getProvincesByRegion(regionCode)[0].code;
    const item = await record(s, { regionCode, provinceCode });
    await record(s, { regionCode: regionCode === "05" ? "09" : "05", provinceCode: regionCode === "05" ? "09.541" : "05.081" });
    expect(idsOf((await pages(s, { ...filters, regionCode })).rows)).toEqual([item.assessmentId]);
    expect(idsOf((await pages(s, { ...filters, regionCode, provinceCode })).rows)).toEqual([item.assessmentId]);
  });

  test.each([
    [{ regionCode: "5" }, "INVALID_PROJECT_REGION"],
    [{ regionCode: "99" }, "INVALID_PROJECT_REGION"],
    [{ provinceCode: "05.081" }, "PROJECT_REGION_REQUIRED"],
    [{ regionCode: "09", provinceCode: "05.081" }, "PROJECT_PROVINCE_REGION_MISMATCH"],
    [{ regionCode: "05", provinceCode: "05.999" }, "INVALID_PROJECT_PROVINCE"],
    [{ regionCode: "05", provinceCode: " 05.081" }, "INVALID_PROJECT_PROVINCE"],
    [{ dateFrom: "2026-02-30" }, "INVALID_ADMIN_SITE_VISIT_FILTER"],
    [{ dateFrom: "2026-10-10", dateTo: "2026-10-09" }, "INVALID_ADMIN_SITE_VISIT_FILTER"],
  ] as const)("rejects invalid filters %j", async (input, error) => {
    const s = await setup();
    await expect(s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, ...input, paginationOpts: options })).rejects.toThrow(error);
  });
  test.each([0, -1, 101, 1.5])("rejects page-size target %s", async (numItems) => {
    const s = await setup();
    await expect(s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: { numItems, cursor: null } })).rejects.toThrow("INVALID_ADMIN_SITE_VISIT_PAGE_SIZE");
  });

  test("legacy, cleared and invalid administrative pairs never acquire inferred province membership", async () => {
    const s = await setup();
    const legacy = await record(s, { regionCode: null, provinceCode: null });
    const incompatible = await record(s, { regionCode: "09", provinceCode: "05.081" });
    const noParent = await record(s, { regionCode: null, provinceCode: "05.081" });
    expect((await pages(s)).rows).toHaveLength(3);
    expect((await pages(s, { ...filters, regionCode: "05", provinceCode: "05.081" })).rows).toEqual([]);
    const stored = await s.t.run(async (ctx) => Promise.all([legacy, incompatible, noParent].map((r) => ctx.db.get(r.assessmentId))));
    expect(stored.map((row) => row?.adminProvinceCode)).toEqual([undefined, undefined, undefined]);
    expect(idsOf((await pages(s, { ...filters, regionCode: "09" })).rows)).toEqual([incompatible.assessmentId]);
  });

  test("current status/title/company changes are read on every page; relationships fail closed", async () => {
    const s = await setup(); const item = await record(s); const visitId = await visit(s, item);
    await s.t.run(async (ctx) => { await ctx.db.patch(visitId, { status: "declined", active: false }); await syncAssessmentAdminProjection(ctx, item.assessmentId); await ctx.db.patch(item.projectId, { title: "New title" }); await ctx.db.patch(s.companyId, { name: "New company" }); });
    expect((await pages(s, { ...filters, status: "cancelled_declined", projectSearch: "new title", companySearch: "new company" })).rows).toHaveLength(1);
    const otherClient = await s.t.run((ctx) => ctx.db.insert("users", { accountType: "client" }));
    await s.t.run((ctx) => ctx.db.patch(item.projectId, { clientId: otherClient }));
    expect((await pages(s)).rows).toEqual([]);
    await s.t.run(async (ctx) => { await ctx.db.patch(item.projectId, { clientId: s.clientId }); const differentConversationId = await ctx.db.insert("conversations", { projectId: item.projectId, quoteId: item.quoteId, clientId: s.clientId, companyId: s.companyId, status: "active", createdBy: s.clientId, createdAt: 2, updatedAt: 2 }); await ctx.db.patch(visitId, { conversationId: differentConversationId }); });
    expect((await pages(s)).rows).toEqual([]);
    await expect(s.admin.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: item.assessmentId, now: filters.now })).rejects.toThrow("SITE_VISIT_INTEGRITY_ERROR");
  });

  test("gate is default-disabled, remains read-only and rejects incomplete history even if enabled", async () => {
    const s = await setup(); const history = await record(s, { projected: false });
    const before = await s.t.run((ctx) => ctx.db.get(history.assessmentId));
    vi.stubEnv(policy, undefined);
    expect(await s.admin.query(api.admin.siteVisits.getSiteVisitPaginationRollout, {})).toEqual({ enabled: false, reason: "disabled" });
    await expect(s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: options })).rejects.toThrow("ADMIN_SITE_VISIT_PAGINATION_DISABLED");
    expect(await s.admin.query(api.admin.siteVisits.listSiteVisits, filters)).toHaveLength(1);
    vi.stubEnv(policy, "indexed_v1");
    expect(await s.admin.query(api.admin.siteVisits.getSiteVisitPaginationRollout, {})).toEqual({ enabled: false, reason: "historical_projection_missing" });
    await expect(s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, regionCode: "09", provinceCode: "09.541", paginationOpts: options })).rejects.toThrow("ADMIN_SITE_VISIT_PROJECTION_NOT_READY");
    expect(await s.t.run((ctx) => ctx.db.get(history.assessmentId))).toEqual(before);
  });

  test("stale geography/sort is detected in hydrated pages instead of silently repaired or omitted", async () => {
    const s = await setup(); const item = await record(s);
    await s.t.run((ctx) => ctx.db.patch(item.projectId, { provinceCode: "05.091" }));
    await expect(s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, regionCode: "05", provinceCode: "05.081", paginationOpts: options })).rejects.toThrow("ADMIN_SITE_VISIT_PROJECTION_STALE");
    const before = await s.t.run((ctx) => ctx.db.get(item.assessmentId));
    expect(before?.adminProvinceCode).toBe("05.081");
    await s.t.run(async (ctx) => { await ctx.db.patch(item.projectId, { provinceCode: "05.081" }); await ctx.db.patch(item.assessmentId, { invitedAt: 999 }); });
    await expect(s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: options })).rejects.toThrow("ADMIN_SITE_VISIT_PROJECTION_STALE");
  });

  test("admin authorization is rechecked on every page/retry and private addresses stay in authorized detail", async () => {
    const s = await setup(); const item = await record(s); await visit(s, item, { status: "confirmed" });
    const seo = await s.t.run((ctx) => ctx.db.insert("users", { accountType: "seo_team" }));
    for (const caller of [s.t, s.client, s.company, s.asUser(seo)]) {
      await expect(caller.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: options })).rejects.toThrow();
      await expect(caller.query(api.admin.siteVisits.getSiteVisitPaginationRollout, {})).rejects.toThrow();
      await expect(caller.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: item.assessmentId, now: filters.now })).rejects.toThrow();
    }
    const page = await s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: options });
    expect(Object.keys(page.page[0]).sort()).toEqual(["assessmentId", "assessmentStatus", "city", "clientName", "companyName", "finalQuoteStatus", "location", "projectId", "projectTitle", "proposedBy", "riskSignal", "sortAt", "status", "visitDate", "visitTime"].sort());
    expect(JSON.stringify(page)).not.toMatch(/PRIVATE_|adminRegionCode|adminProvinceCode|adminSortAt/);
    expect((await s.admin.query(api.admin.siteVisits.getSiteVisitDetail, { assessmentId: item.assessmentId, now: filters.now }))?.visit?.siteAddress).toBe("PRIVATE_VISIT_ADDRESS");
    await s.t.run((ctx) => ctx.db.patch(s.adminId, { accountType: "client" }));
    await expect(s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: { ...options, cursor: page.continueCursor } })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(s.admin.query(api.admin.siteVisits.getSiteVisitPaginationRollout, {})).rejects.toThrow("ADMIN_REQUIRED");
    await s.t.run((ctx) => ctx.db.delete(s.adminId));
    await expect(s.admin.query(api.admin.siteVisits.listSiteVisitsPage, { ...filters, paginationOpts: options })).rejects.toThrow("ADMIN_REQUIRED");
  });
});

describe("GEO9.1C transactional source maintenance", () => {
  test("new invitation/respond/decline sources maintain keys; exact retries keep history and projections unchanged", async () => {
    const s = await setup(); const r = await record(s);
    await s.t.run((ctx) => ctx.db.delete(r.assessmentId));
    const invited = await s.client.mutation(api.siteVisits.index.invite, { conversationId: r.conversationId });
    const stored = await s.t.run((ctx) => ctx.db.get(invited.assessmentId));
    expect(stored).toMatchObject({ adminRegionCode: "05", adminProvinceCode: "05.081" });
    expect(stored?.adminSortAt).toBe(stored?.invitedAt);
    expect((await s.client.mutation(api.siteVisits.index.invite, { conversationId: r.conversationId })).duplicate).toBe(true);
    expect(await s.t.run((ctx) => ctx.db.get(invited.assessmentId))).toEqual(stored);
    await s.company.mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "decline" });
    const declined = await s.t.run((ctx) => ctx.db.get(invited.assessmentId));
    expect(declined?.adminSortAt).toBe(stored?.invitedAt);
    expect((await s.company.mutation(api.siteVisits.index.respond, { assessmentId: invited.assessmentId, decision: "decline" })).duplicate).toBe(true);
    expect(await s.t.run((ctx) => ctx.db.get(invited.assessmentId))).toEqual(declined);
    expect(await s.t.run((ctx) => ctx.db.query("marketplaceActivity").collect())).toHaveLength(2);
  });

  function schedule(days: number) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(Date.now() + days * 86_400_000).map((part) => [part.type, part.value]));
    return { proposedDate: `${parts.year}-${parts.month}-${parts.day}`, proposedTime: "10:00", timezone: "Africa/Casablanca" as const, siteAddress: "PRIVATE_SCHEDULE_ADDRESS" };
  }
  test("proposal/counterproposal/decline/new selection/confirm/cancel refresh the exact selected timestamp atomically", async () => {
    const s = await setup(); const r = await record(s);
    await s.company.mutation(api.siteVisits.index.respond, { assessmentId: r.assessmentId, decision: "accept" });
    const firstSchedule = schedule(2);
    const first = await s.client.mutation(api.siteVisits.index.proposeVisit, { assessmentId: r.assessmentId, ...firstSchedule });
    expect((await s.t.run((ctx) => ctx.db.get(r.assessmentId)))?.adminSortAt).toBe(adminVisitEpoch(firstSchedule));
    const before = await s.t.run((ctx) => ctx.db.get(r.assessmentId));
    expect((await s.client.mutation(api.siteVisits.index.proposeVisit, { assessmentId: r.assessmentId, ...firstSchedule })).duplicate).toBe(true);
    expect(await s.t.run((ctx) => ctx.db.get(r.assessmentId))).toEqual(before);
    const rescheduled = schedule(4);
    await s.company.mutation(api.siteVisits.index.proposeVisit, { assessmentId: r.assessmentId, ...rescheduled });
    expect((await s.t.run((ctx) => ctx.db.get(r.assessmentId)))?.adminSortAt).toBe(adminVisitEpoch(rescheduled));
    await s.client.mutation(api.siteVisits.index.respondToVisit, { visitId: first.visitId, decision: "decline" });
    const secondSchedule = schedule(3);
    const second = await s.client.mutation(api.siteVisits.index.proposeVisit, { assessmentId: r.assessmentId, ...secondSchedule });
    expect((await s.t.run((ctx) => ctx.db.get(r.assessmentId)))?.adminSortAt).toBe(adminVisitEpoch(secondSchedule));
    await s.company.mutation(api.siteVisits.index.respondToVisit, { visitId: second.visitId, decision: "confirm" });
    await s.company.mutation(api.siteVisits.index.cancelVisit, { visitId: second.visitId });
    const expected = await s.t.run((ctx) => selectedVisitForAssessment(ctx, r.assessmentId));
    expect(expected?._id).toBe(second.visitId);
    expect((await s.t.run((ctx) => ctx.db.get(r.assessmentId)))?.adminSortAt).toBe(adminVisitEpoch(secondSchedule));
    expect((await pages(s, { ...filters, status: "cancelled_declined" })).rows).toHaveLength(1);
  });

  test("completion and native active/newest selection remain consistent; repeated helper calls do not patch", async () => {
    const s = await setup(); const r = await record(s, { status: "accepted" });
    const visitId = await visit(s, r, { status: "confirmed", proposedDate: "2020-01-01", proposedByUserId: s.clientId });
    const other = await visit(s, r, { active: false, status: "cancelled", proposedDate: "2027-01-01" });
    expect((await s.t.run((ctx) => selectedVisitForAssessment(ctx, r.assessmentId)))?._id).toBe(visitId);
    await s.company.mutation(api.siteVisits.index.completeVisit, { visitId });
    // Both visits are now inactive: selection uses newest creation, exactly as before.
    expect((await s.t.run((ctx) => selectedVisitForAssessment(ctx, r.assessmentId)))?._id).toBe(other);
    expect((await s.t.run((ctx) => ctx.db.get(r.assessmentId)))?.adminSortAt).toBe(adminVisitEpoch({ proposedDate: "2027-01-01", proposedTime: "10:00" }));
    await s.t.run(async (ctx) => {
      const spy = vi.spyOn(ctx.db, "patch");
      await syncAssessmentAdminProjection(ctx, r.assessmentId);
      await syncAssessmentAdminProjection(ctx, r.assessmentId);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  test("structured Project geography changes/clears update active and historical assessments in the same transaction", async () => {
    const s = await setup(); const r = await record(s, { projectStatus: "needs_changes" });
    const second = await s.t.run(async (ctx) => {
      const assessment = (await ctx.db.get(r.assessmentId))!;
      const { _id, _creationTime, ...input } = assessment;
      void _id; void _creationTime;
      const id = await ctx.db.insert("siteAssessments", { ...input, active: false, status: "declined" });
      return id;
    });
    await s.client.mutation(api.projects.index.saveStructuredLocation, { projectId: r.projectId, regionCode: "09", provinceCode: "09.541", communeName: "Tiznit", localityName: "Rural locality" });
    for (const id of [r.assessmentId, second]) expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({ adminRegionCode: "09", adminProvinceCode: "09.541", adminSortAt: 100 });
    expect(idsOf((await pages(s, { ...filters, regionCode: "09", provinceCode: "09.541" })).rows)).toHaveLength(2);
    await s.client.mutation(api.projects.index.saveStructuredLocation, { projectId: r.projectId, regionCode: null, provinceCode: null, communeName: null, localityName: null });
    for (const id of [r.assessmentId, second]) {
      const row = await s.t.run((ctx) => ctx.db.get(id));
      expect(row?.adminRegionCode).toBeUndefined(); expect(row?.adminProvinceCode).toBeUndefined();
    }
    expect((await pages(s, { ...filters, regionCode: "09" })).rows).toEqual([]);
    expect((await pages(s)).rows).toHaveLength(2);
  });

  test("legacy city-only saves and unchanged administrative saves do not populate unrelated history", async () => {
    const s = await setup(); const r = await record(s, { regionCode: null, provinceCode: null, projectStatus: "draft", projected: false });
    await s.t.run((ctx) => ctx.db.patch(r.projectId, { locationMode: undefined, localityName: undefined }));
    await s.client.mutation(api.projects.index.saveLocation, { projectId: r.projectId, city: "agadir" });
    expect((await s.t.run((ctx) => ctx.db.get(r.assessmentId)))?.adminSortAt).toBeUndefined();
    await s.client.mutation(api.projects.index.saveStructuredLocation, { projectId: r.projectId, regionCode: null, provinceCode: null, communeName: "Text", localityName: "Douar" });
    expect((await s.t.run((ctx) => ctx.db.get(r.assessmentId)))?.adminSortAt).toBeUndefined();
  });

  test("exceptional excessive per-Project histories abort location changes instead of committing a partial projection", async () => {
    const s = await setup(); const r = await record(s, { projectStatus: "draft" });
    await s.t.run(async (ctx) => {
      const original = (await ctx.db.get(r.assessmentId))!;
      const { _id, _creationTime, ...input } = original;
      void _id; void _creationTime;
      for (let n = 0; n < MAX_PROJECT_ASSESSMENT_SYNC; n++) await ctx.db.insert("siteAssessments", { ...input, active: false, status: "declined" });
    });
    await expect(s.client.mutation(api.projects.index.saveStructuredLocation, { projectId: r.projectId, regionCode: "09", provinceCode: "09.541", communeName: null, localityName: "Douar" })).rejects.toThrow("SITE_ASSESSMENT_PROJECTION_UPDATE_LIMIT");
    expect((await s.t.run((ctx) => ctx.db.get(r.projectId)))?.regionCode).toBe("05");
    expect((await s.t.run((ctx) => ctx.db.get(r.assessmentId)))?.adminRegionCode).toBe("05");
  });
});
