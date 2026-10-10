/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionReturnType, TableNamesInDataModel } from "convex/server";
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";
import {
  backfillSiteAssessmentAdminProjections,
  verifySiteAssessmentAdminProjections,
} from "./migrations";
import schema from "./schema";
import { SITE_ASSESSMENT_BACKFILL_BATCH_SIZE } from "./siteVisits/adminMigration";

const modules = import.meta.glob("./**/*.ts");
const backfill = internal.migrations.backfillSiteAssessmentAdminProjections;
const verify = internal.migrations.verifySiteAssessmentAdminProjections;
const policy = "ADMIN_SITE_VISIT_GEOGRAPHY_POLICY_VERSION";
type Verification = FunctionReturnType<typeof verify>;
type BackfillResult = FunctionReturnType<typeof backfill>;
type DatabaseSnapshot = { [Table in TableNamesInDataModel<DataModel>]: Doc<Table>[] };
beforeEach(() => vi.stubEnv(policy, ""));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function setup() {
  const t = convexTest(schema, modules);
  const [clientId, companyUserId] = await t.run(async (ctx) => Promise.all([
    ctx.db.insert("users", { accountType: "client", onboardingStatus: "completed", firstName: "PRIVATE_CLIENT", email: "PRIVATE_EMAIL", phone: "PRIVATE_PHONE" }),
    ctx.db.insert("users", { accountType: "company", onboardingStatus: "completed" }),
  ]));
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name: "PRIVATE_COMPANY", slug: "migration-company", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
  }));
  return { t, clientId, companyUserId, companyId };
}
type State = Awaited<ReturnType<typeof setup>>;

async function record(s: State, options: {
  structured?: boolean;
  invitedAt?: number;
  assessment?: Partial<Doc<"siteAssessments">>;
  project?: Partial<Doc<"projects">>;
} = {}) {
  return s.t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      clientId: s.clientId, title: "PRIVATE_PROJECT", countryCode: "MA", city: "rabat", neighborhood: "PRIVATE_NEIGHBORHOOD",
      ...(options.structured ? { regionCode: "05", provinceCode: "05.081", localityName: "PRIVATE_LOCALITY", locationMode: "structured" as const } : {}),
      visibility: "invite_only", status: "in_discussion", surfaceUnknown: true, lastCompletedStep: 6, createdAt: 1, updatedAt: 1,
      ...options.project,
    });
    const quoteId = await ctx.db.insert("projectQuotes", {
      projectId, companyId: s.companyId, submittedByUserId: s.companyUserId, message: "PRIVATE_QUOTE", currency: "MAD",
      estimatedPrice: 100_000, estimatedDuration: 10, availableStartDate: "2026-10-20", scope: "PRIVATE_SCOPE",
      quoteType: "initial", status: "discussion_open", createdAt: 1, updatedAt: 1, submittedAt: 1,
    });
    const conversationId = await ctx.db.insert("conversations", {
      projectId, quoteId, clientId: s.clientId, companyId: s.companyId, status: "active", createdBy: s.clientId, createdAt: 1, updatedAt: 1,
    });
    const assessmentId = await ctx.db.insert("siteAssessments", {
      projectId, clientId: s.clientId, companyId: s.companyId, initialQuoteId: quoteId, conversationId,
      invitedByUserId: s.clientId, invitedAt: options.invitedAt ?? 100, status: "invited", active: true,
      siteAddress: "PRIVATE_ASSESSMENT_ADDRESS", clientNote: "PRIVATE_CLIENT_NOTE", companyNote: "PRIVATE_COMPANY_NOTE",
      createdAt: 1, updatedAt: 1, ...options.assessment,
    });
    return { projectId, quoteId, conversationId, assessmentId };
  });
}
type RecordIds = Awaited<ReturnType<typeof record>>;

async function visit(s: State, ids: RecordIds, input: Partial<Doc<"siteVisits">> = {}) {
  return s.t.run((ctx) => ctx.db.insert("siteVisits", {
    assessmentId: ids.assessmentId, projectId: ids.projectId, clientId: s.clientId, companyId: s.companyId,
    conversationId: ids.conversationId, initialQuoteId: ids.quoteId, proposedByUserId: s.companyUserId,
    proposedDate: "2026-10-15", proposedTime: "10:00", timezone: "Africa/Casablanca", proposedAt: 200,
    siteAddress: "PRIVATE_VISIT_ADDRESS", note: "PRIVATE_VISIT_NOTE", status: "proposed", active: true,
    createdAt: 200, updatedAt: 200, ...input,
  }));
}

async function snapshot(s: State) {
  return s.t.run(async (ctx) => {
    const tables = Object.keys(schema.tables) as TableNamesInDataModel<DataModel>[];
    return Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await ctx.db.query(table).take(100)]))) as DatabaseSnapshot;
  });
}

async function verifyAll(s: State) {
  let cursor: string | null = null;
  const pages: Verification[] = [];
  const counts: Verification["counts"] = {
    examined: 0, missingProjections: 0, missingOrNonfiniteAdminSortAt: 0, staleProjections: 0,
    invalidProjectAdministrativePairs: 0, sourceIntegrityFailures: 0, nonfiniteSourceSortAt: 0, readyForIndexedDiscovery: 0,
  };
  for (let batch = 0; batch < 100; batch++) {
    const page: Verification = await s.t.query(verify, { cursor });
    pages.push(page);
    for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] += page.counts[key];
    if (page.isDone) return { pages, counts };
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }
  throw new Error("Verifier did not exhaust the fixture");
}

async function applyAll(s: State, cursor: string | null = null) {
  const pages: BackfillResult[] = [];
  for (let batch = 0; batch < 100; batch++) {
    const page: BackfillResult = await s.t.mutation(backfill, { cursor, dryRun: false });
    pages.push(page);
    if (page.isDone) return pages;
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }
  throw new Error("Backfill did not exhaust the fixture");
}

describe("GEO10.1B internal assessment projection backfill", () => {
  test("default preview and verifier are write-free, aggregate-only and internal", async () => {
    const s = await setup(); await record(s);
    const before = await snapshot(s);
    const debug = vi.spyOn(console, "debug");
    const log = vi.spyOn(console, "log");
    const preview = await s.t.mutation(backfill, {});
    const checked = await s.t.query(verify, {});
    expect(preview).toMatchObject({ dryRun: true, updated: 0, wouldUpdate: 1, scope: "page", isDone: true,
      counts: { examined: 1, missingProjections: 1, missingOrNonfiniteAdminSortAt: 1, readyForIndexedDiscovery: 0 } });
    expect(checked).toEqual({ scope: preview.scope, counts: preview.counts, wouldUpdate: 1, continueCursor: preview.continueCursor, isDone: true });
    expect(await snapshot(s)).toEqual(before);
    expect(JSON.stringify([preview, checked])).not.toContain("PRIVATE_");
    expect(Object.keys(checked).sort()).toEqual(["continueCursor", "counts", "isDone", "scope", "wouldUpdate"]);
    expect(debug).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
    expect(backfillSiteAssessmentAdminProjections.isInternal).toBe(true);
    expect(verifySiteAssessmentAdminProjections.isInternal).toBe(true);
    type PublicMigrations = typeof api extends { migrations: infer Functions } ? Functions : never;
    expectTypeOf<PublicMigrations>().toEqualTypeOf<never>();
  });

  test("backfills invitation time only, clearing stale geography without converting a legacy Project", async () => {
    const s = await setup();
    const ids = await record(s, { invitedAt: 900, assessment: { adminRegionCode: "05", adminProvinceCode: "05.081" } });
    const source = await s.t.run((ctx) => ctx.db.get(ids.projectId));
    expect((await s.t.mutation(backfill, { dryRun: false })).updated).toBe(1);
    const stored = await s.t.run((ctx) => ctx.db.get(ids.assessmentId));
    expect(stored?.adminSortAt).toBe(900);
    expect(stored).not.toHaveProperty("adminRegionCode"); expect(stored).not.toHaveProperty("adminProvinceCode");
    expect(await s.t.run((ctx) => ctx.db.get(ids.projectId))).toEqual(source);
    expect(source).not.toHaveProperty("regionCode"); expect(source).not.toHaveProperty("locationMode");
    expect((await verifyAll(s)).counts.readyForIndexedDiscovery).toBe(1);
  });

  test("derives structured codes and selected visit wall-clock time, never creation/proposal time", async () => {
    const s = await setup(); const ids = await record(s, { structured: true, invitedAt: 111 });
    await visit(s, ids, { proposedAt: 222, createdAt: 333 });
    await s.t.mutation(backfill, { dryRun: false });
    expect(await s.t.run((ctx) => ctx.db.get(ids.assessmentId))).toMatchObject({
      adminRegionCode: "05", adminProvinceCode: "05.081", adminSortAt: Date.UTC(2026, 9, 15, 9),
      invitedAt: 111, createdAt: 1, updatedAt: 1,
    });
  });

  test("preserves active-first/newest-creation selection across active and inactive visits", async () => {
    const s = await setup(); const ids = await record(s, { structured: true });
    const active = await visit(s, ids, { proposedDate: "2026-10-20", proposedAt: 5000 });
    const inactive = await visit(s, ids, { active: false, status: "cancelled", proposedDate: "2026-10-25", proposedAt: 1 });
    await s.t.mutation(backfill, { dryRun: false });
    expect((await s.t.run((ctx) => ctx.db.get(ids.assessmentId)))?.adminSortAt).toBe(Date.UTC(2026, 9, 20, 9));
    await s.t.run((ctx) => ctx.db.patch(active, { active: false }));
    await s.t.mutation(backfill, { dryRun: false });
    expect((await s.t.run((ctx) => ctx.db.get(ids.assessmentId)))?.adminSortAt).toBe(Date.UTC(2026, 9, 25, 9));
    // All inactive: newest native creation wins, even with an older proposal time.
    expect((await s.t.run((ctx) => ctx.db.get(inactive)))?.active).toBe(false);
    await visit(s, ids, { active: false, status: "declined", proposedDate: "bad", proposedTime: "bad", proposedAt: 765 });
    await s.t.mutation(backfill, { dryRun: false });
    expect((await s.t.run((ctx) => ctx.db.get(ids.assessmentId)))?.adminSortAt).toBe(765);
    await visit(s, ids, { proposedDate: "2026-10-18" });
    await visit(s, ids, { proposedDate: "2026-10-19", proposedAt: 1 });
    await s.t.mutation(backfill, { dryRun: false });
    expect((await s.t.run((ctx) => ctx.db.get(ids.assessmentId)))?.adminSortAt).toBe(Date.UTC(2026, 9, 19, 9));
  });

  test("preserves inactive/completed histories and closed conversations", async () => {
    const s = await setup(); const ids = await record(s, { structured: true, assessment: { active: false, status: "completed", completedAt: 321 } });
    await s.t.run(async (ctx) => {
      await ctx.db.patch(ids.conversationId, { status: "closed" });
      await ctx.db.patch(ids.quoteId, { status: "withdrawn" });
    });
    await visit(s, ids, { active: false, status: "completed", completedAt: 321 });
    await s.t.mutation(backfill, { dryRun: false });
    expect((await s.t.query(verify, {})).counts).toMatchObject({ sourceIntegrityFailures: 0, readyForIndexedDiscovery: 1 });
    expect(await s.t.run((ctx) => ctx.db.get(ids.assessmentId))).toMatchObject({ active: false, status: "completed", completedAt: 321 });
  });

  test("preserves native descending time/creation order on all three approved indexes", async () => {
    const s = await setup();
    const early = await record(s, { structured: true, invitedAt: 100 });
    const tie1 = await record(s, { structured: true, invitedAt: 200 });
    const tie2 = await record(s, { structured: true, invitedAt: 200 });
    const planned = await record(s, { structured: true, invitedAt: 1 }); await visit(s, planned);
    await applyAll(s);
    const actual = await s.t.run(async (ctx) => Promise.all([
      ctx.db.query("siteAssessments").withIndex("by_adminSortAt").order("desc").take(10),
      ctx.db.query("siteAssessments").withIndex("by_adminRegionCode_and_adminSortAt", (q) => q.eq("adminRegionCode", "05")).order("desc").take(10),
      ctx.db.query("siteAssessments").withIndex("by_adminProvinceCode_and_adminSortAt", (q) => q.eq("adminProvinceCode", "05.081")).order("desc").take(10),
    ]));
    for (const rows of actual) expect(rows.map((row) => row._id)).toEqual([planned.assessmentId, tie2.assessmentId, tie1.assessmentId, early.assessmentId]);
  });

  test("bounded pages exhaust more than two batches, resume after interruption and rerun idempotently", async () => {
    const s = await setup(); const total = SITE_ASSESSMENT_BACKFILL_BATCH_SIZE * 2 + 3;
    for (let n = 0; n < total; n++) await record(s, { structured: n % 2 === 0, invitedAt: n, assessment: { active: n % 3 !== 0 } });
    const first = await s.t.mutation(backfill, { dryRun: false, cursor: null });
    expect(first.counts.examined).toBe(SITE_ASSESSMENT_BACKFILL_BATCH_SIZE); expect(first.isDone).toBe(false);
    // Lost response/checkpoint recovery: repeating the last input is a no-op.
    const retry = await s.t.mutation(backfill, { dryRun: false, cursor: null });
    expect(retry.updated).toBe(0); expect(retry.continueCursor).toBe(first.continueCursor);
    const headOnly = await s.t.query(verify, {});
    expect(headOnly.counts.missingProjections).toBe(0); expect(headOnly.isDone).toBe(false);
    expect((await verifyAll(s)).counts).toMatchObject({ examined: total, readyForIndexedDiscovery: first.updated, missingProjections: total - first.updated });
    const remaining = await applyAll(s, first.continueCursor);
    expect(remaining.reduce((sum, page) => sum + page.updated, first.updated)).toBe(total);
    for (const page of remaining) expect(page.counts.examined).toBeLessThanOrEqual(SITE_ASSESSMENT_BACKFILL_BATCH_SIZE);
    const before = await snapshot(s);
    expect((await applyAll(s)).every((page) => page.updated === 0)).toBe(true);
    expect(await snapshot(s)).toEqual(before);
    const checked = await verifyAll(s);
    expect(checked.pages.length).toBeGreaterThan(2);
    expect(checked.counts).toMatchObject({ examined: total, readyForIndexedDiscovery: total, missingProjections: 0, staleProjections: 0 });
    expect(checked.pages[checked.pages.length - 1].counts.examined).toBeLessThan(total);
  });

  test("re-reads changed Project/visit/assessment sources after preview and between batches", async () => {
    const s = await setup();
    const firstIds = await record(s, { structured: true });
    const later = await record(s, { structured: true });
    await s.t.mutation(backfill, { batchSize: 1 });
    await s.t.run((ctx) => ctx.db.patch(firstIds.projectId, { regionCode: "09", provinceCode: "09.541" }));
    const first = await s.t.mutation(backfill, { batchSize: 1, dryRun: false });
    await s.t.run(async (ctx) => {
      await ctx.db.patch(later.projectId, { regionCode: "09", provinceCode: "09.541" });
      await ctx.db.patch(later.assessmentId, { invitedAt: 999, active: false });
    });
    await visit(s, later, { active: false, proposedDate: "bad", proposedTime: "bad", proposedAt: 1234 });
    await s.t.mutation(backfill, { cursor: first.continueCursor, batchSize: 1, dryRun: false });
    expect(await s.t.run((ctx) => ctx.db.get(firstIds.assessmentId))).toMatchObject({ adminRegionCode: "09", adminProvinceCode: "09.541" });
    expect(await s.t.run((ctx) => ctx.db.get(later.assessmentId))).toMatchObject({ adminRegionCode: "09", adminProvinceCode: "09.541", adminSortAt: 1234, invitedAt: 999, active: false });
    // An out-of-band change to an already scanned source requires a fresh sweep.
    await s.t.run((ctx) => ctx.db.patch(firstIds.assessmentId, { invitedAt: 4321 }));
    expect((await verifyAll(s)).counts.staleProjections).toBe(1);
    expect((await applyAll(s)).reduce((sum, page) => sum + page.updated, 0)).toBe(1);
  });

  test.each(["project", "client", "company", "quote", "conversation"] as const)("missing %s source fails safely with aggregate diagnostics", async (source) => {
    const s = await setup(); const ids = await record(s, { structured: true });
    await s.t.run(async (ctx) => {
      const id = { project: ids.projectId, client: s.clientId, company: s.companyId, quote: ids.quoteId, conversation: ids.conversationId }[source];
      await ctx.db.delete(id);
    });
    expect((await s.t.query(verify, {})).counts.sourceIntegrityFailures).toBe(1);
    const before = await snapshot(s);
    await expect(s.t.mutation(backfill, { dryRun: false })).rejects.toThrow("SITE_ASSESSMENT_BACKFILL_INTEGRITY_ERROR");
    expect(await snapshot(s)).toEqual(before);
  });

  test.each(["ownership", "quote", "conversation", "visit"] as const)("inconsistent %s links fail without repairing history", async (kind) => {
    const s = await setup(); const ids = await record(s); const other = await record(s);
    await s.t.run(async (ctx) => {
      if (kind === "ownership") await ctx.db.patch(ids.projectId, { clientId: s.companyUserId });
      if (kind === "quote") await ctx.db.patch(ids.quoteId, { projectId: other.projectId });
      if (kind === "conversation") await ctx.db.patch(ids.conversationId, { quoteId: other.quoteId });
    });
    if (kind === "visit") await visit(s, ids, { initialQuoteId: other.quoteId, active: false });
    expect((await s.t.query(verify, {})).counts.sourceIntegrityFailures).toBe(1);
    const before = await snapshot(s);
    await expect(s.t.mutation(backfill, { dryRun: false })).rejects.toThrow("SITE_ASSESSMENT_BACKFILL_INTEGRITY_ERROR");
    expect(await snapshot(s)).toEqual(before);
  });

  test("failed later batch keeps previous commits, rolls back the whole failing page and resumes at its input cursor", async () => {
    const s = await setup();
    for (let n = 0; n < SITE_ASSESSMENT_BACKFILL_BATCH_SIZE; n++) await record(s);
    const good = await record(s); const broken = await record(s); const wrong = await record(s);
    await visit(s, broken, { projectId: wrong.projectId });
    const first = await s.t.mutation(backfill, { dryRun: false });
    const before = await snapshot(s);
    let failure: unknown;
    try { await s.t.mutation(backfill, { cursor: first.continueCursor, dryRun: false }); } catch (error) { failure = error; }
    expect(String(failure)).toContain("SITE_ASSESSMENT_BACKFILL_INTEGRITY_ERROR");
    expect(String(failure)).not.toContain("PRIVATE_"); expect(String(failure)).not.toContain(broken.assessmentId);
    expect(await snapshot(s)).toEqual(before);
    expect((await s.t.run((ctx) => ctx.db.get(good.assessmentId)))?.adminSortAt).toBeUndefined();
    // Fixture-only repair; the migration never changes these source links.
    await s.t.run(async (ctx) => {
      const selected = await ctx.db.query("siteVisits").withIndex("by_assessmentId_and_active", (q) => q.eq("assessmentId", broken.assessmentId)).first();
      await ctx.db.patch(selected!._id, { projectId: broken.projectId });
    });
    const resumed = await s.t.mutation(backfill, { cursor: first.continueCursor, dryRun: false });
    expect(resumed.updated).toBe(3); expect(resumed.isDone).toBe(true);
  });

  test("only differing derived fields change; every other application table and source value stays identical", async () => {
    const s = await setup(); const ids = await record(s, { structured: true, assessment: { adminRegionCode: "05", adminProvinceCode: "09.541", adminSortAt: 100 } });
    await visit(s, ids);
    const before = await snapshot(s);
    await s.t.mutation(backfill, { dryRun: false });
    const after = await snapshot(s);
    for (const table of Object.keys(before) as (keyof DatabaseSnapshot)[]) {
      if (table !== "siteAssessments") expect(after[table], table).toEqual(before[table]);
    }
    const strip = (rows: typeof after["siteAssessments"]) => rows.map((row) => {
      const { adminRegionCode, adminProvinceCode, adminSortAt, ...source } = row as Doc<"siteAssessments">;
      void adminRegionCode; void adminProvinceCode; void adminSortAt;
      return source;
    });
    expect(strip(after.siteAssessments)).toEqual(strip(before.siteAssessments));
    expect(after.notifications).toEqual([]); expect(after.finalQuotes).toEqual([]);
    expect(after.deals).toEqual([]); expect(after.commissionStatusHistory).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10))).toEqual([]);
  });

  test("full verifier counts missing, stale, nonfinite, invalid-pair and broken-source rows accurately", async () => {
    const s = await setup();
    const ready = await record(s); await s.t.mutation(backfill, { dryRun: false });
    await record(s);
    await record(s, { structured: true, assessment: { adminSortAt: 100 } }); // Missing geography, not a stale complete projection.
    await record(s, { structured: true, assessment: { adminRegionCode: "09", adminProvinceCode: "09.541", adminSortAt: 999 } });
    await record(s, { assessment: { adminSortAt: Number.POSITIVE_INFINITY } });
    await record(s, { project: { regionCode: "05", provinceCode: "09.541" }, assessment: { adminRegionCode: "05", adminSortAt: 100 } });
    const broken = await record(s); await s.t.run((ctx) => ctx.db.delete(broken.projectId));
    await record(s, { invitedAt: Number.NaN, assessment: { adminSortAt: Number.NaN } });
    const result = await verifyAll(s);
    expect(result.counts).toEqual({ examined: 8, missingProjections: 3, missingOrNonfiniteAdminSortAt: 4, staleProjections: 3,
      invalidProjectAdministrativePairs: 1, sourceIntegrityFailures: 1, nonfiniteSourceSortAt: 1, readyForIndexedDiscovery: 2 });
    expect((await s.t.run((ctx) => ctx.db.get(ready.assessmentId)))?.adminSortAt).toBe(100);
    expect((await s.t.mutation(backfill, {})).updated).toBe(0);
  });

  test.each([
    { regionCode: "05", provinceCode: "09.541", expectedRegion: "05" },
    { regionCode: "invalid", provinceCode: "05.081", expectedRegion: undefined },
    { regionCode: undefined, provinceCode: "05.081", expectedRegion: undefined },
    { regionCode: "05", provinceCode: undefined, expectedRegion: "05" },
  ])("invalid/partial recorded codes preserve GEO9.1C omission semantics: $regionCode/$provinceCode", async ({ regionCode, provinceCode, expectedRegion }) => {
    const s = await setup(); const ids = await record(s, { project: { regionCode, provinceCode } });
    const project = await s.t.run((ctx) => ctx.db.get(ids.projectId));
    await s.t.mutation(backfill, { dryRun: false });
    const assessment = await s.t.run((ctx) => ctx.db.get(ids.assessmentId));
    expect(assessment?.adminRegionCode).toBe(expectedRegion); expect(assessment?.adminProvinceCode).toBeUndefined();
    expect(await s.t.run((ctx) => ctx.db.get(ids.projectId))).toEqual(project);
    expect((await s.t.query(verify, {})).counts).toMatchObject({ invalidProjectAdministrativePairs: 1, readyForIndexedDiscovery: 1 });
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("nonfinite authoritative sort %s rejects the entire write batch", async (invitedAt) => {
    const s = await setup(); await record(s); await record(s, { invitedAt });
    expect((await s.t.query(verify, {})).counts.nonfiniteSourceSortAt).toBe(1);
    const before = await snapshot(s);
    await expect(s.t.mutation(backfill, { dryRun: false })).rejects.toThrow("SITE_ASSESSMENT_BACKFILL_INTEGRITY_ERROR");
    expect(await snapshot(s)).toEqual(before);
  });

  test.each([0, -1, 1.5, 11, Number.NaN, Number.POSITIVE_INFINITY])("rejects unsafe batch size %s for both entry points", async (batchSize) => {
    const s = await setup(); await record(s);
    await expect(s.t.query(verify, { batchSize })).rejects.toThrow("INVALID_SITE_ASSESSMENT_BACKFILL_BATCH_SIZE");
    await expect(s.t.mutation(backfill, { batchSize, dryRun: false })).rejects.toThrow("INVALID_SITE_ASSESSMENT_BACKFILL_BATCH_SIZE");
  });

  test("an enabled reader blocks writes while read-only diagnostics and previews remain available", async () => {
    const s = await setup(); await record(s);
    vi.stubEnv(policy, "indexed_v1");
    await expect(s.t.mutation(backfill, { dryRun: false })).rejects.toThrow("SITE_ASSESSMENT_BACKFILL_REQUIRES_DISABLED_READER");
    expect((await s.t.mutation(backfill, {})).updated).toBe(0);
    expect((await s.t.query(verify, {})).counts.missingProjections).toBe(1);
  });

  test("empty data exhausts with zero counts without treating a supplied tail cursor as global proof", async () => {
    const s = await setup(); const result = await s.t.query(verify, {});
    expect(result).toMatchObject({ scope: "page", isDone: true, wouldUpdate: 0 });
    expect(Object.values(result.counts).every((count) => count === 0)).toBe(true);
  });
});
