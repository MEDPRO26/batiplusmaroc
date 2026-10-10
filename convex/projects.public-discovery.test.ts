/// <reference types="vite/client" />

import type { FunctionArgs, FunctionReturnType, OrderedQuery, WithoutSystemFields } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { buildProjectMarketplaceSearchText } from "./projects/marketplaceSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Input = WithoutSystemFields<Doc<"projects">>;
type Args = FunctionArgs<typeof api.projects.index.listPublicProjectsPaginated>;
type Filters = Omit<Args, "paginationOpts">;
type Page = FunctionReturnType<typeof api.projects.index.listPublicProjectsPaginated>;
const rural = { regionCode: "09", provinceCode: "09.541", communeName: "Commune d’Aoulouz — جماعة",
  localityName: "PRIVATE_DOUAR_آيت_ⵜⴰⵎⵍⵉⵍ", neighborhood: "PRIVATE_NEIGHBORHOOD" };

async function setup() {
  const t = convexTest(schema, modules);
  const clientId = await t.run((ctx) => ctx.db.insert("users", {
    accountType: "client", onboardingStatus: "completed", countryCode: "MA",
    firstName: "PRIVATE_CLIENT", lastName: "PRIVATE_LAST_NAME", email: "PRIVATE_EMAIL@example.test", phone: "PRIVATE_PHONE",
  }));
  return { t, clientId };
}
type State = Awaited<ReturnType<typeof setup>>;
async function project(state: State, overrides: Partial<Input> = {}) {
  const input: Input = { clientId: state.clientId, countryCode: "MA", ...rural, locationMode: "structured",
    title: "Atlas public renovation", description: "Safe general construction opportunity.",
    primaryCategory: "renovation", propertyType: "house", surfaceUnknown: true, timeline: "flexible",
    status: "published", visibility: "marketplace", lastCompletedStep: 5, publishedAt: 100, createdAt: 1, updatedAt: 1, ...overrides };
  return await state.t.run((ctx) => ctx.db.insert("projects", { ...input,
    marketplaceSearchText: Object.prototype.hasOwnProperty.call(overrides, "marketplaceSearchText")
      ? overrides.marketplaceSearchText : buildProjectMarketplaceSearchText(input) }));
}
async function allPages(state: State, filters: Filters = {}, numItems = 7, maximumRowsRead?: number) {
  const rows: Id<"projects">[] = [];
  const pages: Page[] = [];
  let cursor: string | null = null;
  for (let count = 0; count < 300; count++) {
    const page: Page = await state.t.query(api.projects.index.listPublicProjectsPaginated,
      { ...filters, paginationOpts: { numItems, cursor, maximumRowsRead } });
    pages.push(page);
    rows.push(...page.page.map((row) => row.id));
    if (page.isDone) {
      expect(new Set(rows).size).toBe(rows.length);
      return { rows, pages };
    }
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }
  throw new Error("Fixture pagination did not exhaust");
}

describe("GEO6.2B anonymous geographic query contract", () => {
  test.each(["", "9", "00", "99", " 09 ", "Souss-Massa", "__proto__"])("rejects region %j", async (regionCode) => {
    const state = await setup();
    await expect(state.t.query(api.projects.index.listPublicProjectsPaginated,
      { regionCode, paginationOpts: { numItems: 3, cursor: null } })).rejects.toThrow("INVALID_PROJECT_REGION");
  });
  test.each(["", "9.541", "09.000", "99.999", " 09.541 ", "Taroudannt"])("rejects province %j", async (provinceCode) => {
    const state = await setup();
    await expect(state.t.query(api.projects.index.listPublicProjectsPaginated,
      { regionCode: "09", provinceCode, paginationOpts: { numItems: 3, cursor: null } })).rejects.toThrow("INVALID_PROJECT_PROVINCE");
  });
  test.each<[Filters, string]>([
    [{ provinceCode: "09.541" }, "PROJECT_REGION_REQUIRED"],
    [{ regionCode: "05", provinceCode: "09.541" }, "PROJECT_PROVINCE_REGION_MISMATCH"],
  ])("rejects incomplete or mismatched parent %j", async (filters, code) => {
    const state = await setup();
    await expect(state.t.query(api.projects.index.listPublicProjectsPaginated,
      { ...filters, paginationOpts: { numItems: 3, cursor: null } })).rejects.toThrow(code);
  });

  test.each([undefined, "atlas"])("region and province filters include rural records and reject inconsistent stored parents with search=%s", async (search) => {
    const state = await setup();
    const taroudannt = await project(state, { publishedAt: 10 });
    const agadir = await project(state, { provinceCode: "09.001", publishedAt: 20 });
    await project(state, { regionCode: "05", provinceCode: "05.081" });
    await project(state, { regionCode: "05", provinceCode: "09.541" });
    expect(new Set((await allPages(state, { regionCode: "09", search })).rows)).toEqual(new Set([taroudannt, agadir]));
    expect((await allPages(state, { regionCode: "09", provinceCode: "09.541", search })).rows).toEqual([taroudannt]);
    expect((await allPages(state, { regionCode: "09", provinceCode: "09.001", search })).rows).toEqual([agadir]);
    expect((await allPages(state, { regionCode: "12", search })).rows).toEqual([]);
  });

  test("All Morocco preserves legacy, mixed, rural and cleared marked history, including missing search text", async () => {
    const state = await setup();
    const legacy = await project(state, { city: "agadir", locationMode: undefined, regionCode: undefined,
      provinceCode: undefined, communeName: undefined, localityName: undefined, publishedAt: 10 });
    const structured = await project(state, { publishedAt: 20 });
    const mixed = await project(state, { city: "rabat", locationMode: undefined, publishedAt: 30 });
    const converted = await project(state, { city: "agadir", regionCode: undefined, provinceCode: undefined,
      communeName: undefined, localityName: undefined, publishedAt: 40 });
    const noSearchText = await project(state, { marketplaceSearchText: undefined, timeline: undefined, publishedAt: 50 });
    const ids = [legacy, structured, mixed, converted, noSearchText];
    const before = await state.t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get(id))));
    expect((await allPages(state, { sortBy: "oldest" }, 1)).rows).toEqual(ids);
    const page = await state.t.query(api.projects.index.listPublicProjectsPaginated, { paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.find((row) => row.id === legacy)).toMatchObject({ city: "agadir", location: { legacyCity: "agadir", regionCode: null } });
    for (const id of [structured, mixed, converted, noSearchText]) {
      expect(page.page.find((row) => row.id === id)).toMatchObject({ city: null, location: { legacyCity: null } });
    }
    expect((await allPages(state, { regionCode: "09", sortBy: "oldest" })).rows).toEqual([structured, mixed, noSearchText]);
    // convex-test currently tries to tokenize an absent search field. Keep this
    // genuine missing-field fixture in non-text browsing; native search is
    // verified separately against indexed fixtures without patching the engine.
    expect(await state.t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get(id))))).toEqual(before);
    // Compatibility readers keep their existing contract and access policy.
    expect(await state.t.query(api.projects.index.getPublicProject, { projectId: mixed })).toMatchObject({ city: "rabat", location: { legacyCity: null } });
  });
});

describe("GEO6.2B public pagination and native ordering", () => {
  test.each(["newest", "oldest"] as const)("blank search uses global %s dates and native date ties", async (sortBy) => {
    const state = await setup();
    const ids = [];
    for (const publishedAt of [10, 20, 20, 30]) ids.push(await project(state, { publishedAt }));
    for (const search of [undefined, "", " \t\n "]) {
      expect((await allPages(state, { search, sortBy }, 1)).rows).toEqual(sortBy === "oldest" ? ids : [...ids].reverse());
    }
  });

  test("more than 24 incomplete leading candidates cannot hide 31 later complete opportunities", async () => {
    const state = await setup();
    const eligible = [];
    for (let index = 0; index < 31; index++) eligible.push(await project(state, { publishedAt: index }));
    for (let index = 0; index < 45; index++) {
      await project(state, { publishedAt: 1000 + index, ...(index % 3 === 0
        ? { title: undefined } : index % 3 === 1 ? { description: "" } : { primaryCategory: undefined }) });
    }
    for (const search of [undefined, "atlas"]) {
      const result = await allPages(state, { search }, 5, 19);
      expect(new Set(result.rows)).toEqual(new Set(eligible));
      if (!search) expect(result.rows).toEqual([...eligible].reverse());
    }
  });

  test.each(["newest", "oldest"] as const)("251+ records and sparse geographic/category matches exhaust every cursor with sortBy=%s", async (sortBy) => {
    const state = await setup();
    const ids: Id<"projects">[] = [];
    const regionIds: Id<"projects">[] = [];
    const provinceIds: Id<"projects">[] = [];
    const combinedIds: Id<"projects">[] = [];
    for (let index = 0; index < 301; index++) {
      const regionMatch = [3, 91, 207, 240, 250, 280, 300].includes(index);
      const provinceMatch = [207, 250, 300].includes(index);
      const categoryMatch = index === 300;
      const id = await project(state, { regionCode: regionMatch ? "09" : "05",
        provinceCode: regionMatch ? (provinceMatch ? "09.541" : "09.001") : "05.081",
        primaryCategory: categoryMatch ? "painting" : "renovation", publishedAt: 1000 - index });
      ids.push(id);
      if (regionMatch) regionIds.push(id);
      if (provinceMatch) provinceIds.push(id);
      if (categoryMatch) combinedIds.push(id);
    }
    const ordered = (rows: Id<"projects">[]) => sortBy === "newest" ? rows : [...rows].reverse();
    expect((await allPages(state, { sortBy }, 17)).rows).toEqual(ordered(ids));
    expect(new Set((await allPages(state, { search: "atlas", sortBy }, 17)).rows)).toEqual(new Set(ids));
    for (const search of [undefined, "atlas"]) {
      const byRegion = await allPages(state, { search, sortBy, regionCode: "09" }, 2, 19);
      const byProvince = await allPages(state, { search, sortBy, regionCode: "09", provinceCode: "09.541" }, 1, 19);
      expect(new Set(byRegion.rows)).toEqual(new Set(regionIds));
      expect(new Set(byProvince.rows)).toEqual(new Set(provinceIds));
      if (!search) {
        expect(byRegion.rows).toEqual(ordered(regionIds));
        expect(byProvince.rows).toEqual(ordered(provinceIds));
      } else expect(byProvince.pages.some((page) => page.page.length === 0 && !page.isDone && page.pageStatus === "SplitRequired")).toBe(true);
      expect((await allPages(state, { search, sortBy, regionCode: "09", provinceCode: "09.541", category: "painting" }, 1, 19)).rows).toEqual(combinedIds);
      expect((await allPages(state, { search, category: "painting" }, 1)).rows).toEqual(combinedIds);
    }
  });

  test.each([undefined, "atlas"])("end cursors and row/byte split metadata survive the public DTO with search=%s", async (search) => {
    const state = await setup();
    for (let index = 0; index < 8; index++) await project(state, { publishedAt: index });
    const filters = { search, regionCode: "09", sortBy: "oldest" as const };
    const first = await state.t.query(api.projects.index.listPublicProjectsPaginated,
      { ...filters, paginationOpts: { numItems: 3, cursor: null } });
    const sameRange = await state.t.query(api.projects.index.listPublicProjectsPaginated,
      { ...filters, paginationOpts: { numItems: 1, cursor: null, endCursor: first.continueCursor, id: 42 } });
    expect(sameRange.page.map((row) => row.id)).toEqual(first.page.map((row) => row.id));
    expect(sameRange.continueCursor).toBe(first.continueCursor);
    const limited = await state.t.query(api.projects.index.listPublicProjectsPaginated,
      { ...filters, paginationOpts: { numItems: 8, cursor: null, maximumBytesRead: 1 } });
    expect(limited.pageStatus).toBe("SplitRequired");
    expect(limited.splitCursor).toBeNull(); // a one-row split has no midpoint in convex-test
    expect(limited.isDone).toBe(false);
    const rowLimited = await state.t.query(api.projects.index.listPublicProjectsPaginated,
      { ...filters, paginationOpts: { numItems: 8, cursor: null, maximumRowsRead: 3 } });
    expect(rowLimited.pageStatus).toBe("SplitRequired");
    expect(rowLimited.splitCursor).toEqual(expect.any(String));
    expect((await allPages(state, filters, 2, 3)).rows).toHaveLength(8);
  });

  test("search delegates native relevance order and complete options to one paginate, without streaming projects", async () => {
    const state = await setup();
    for (const publishedAt of [300, 100, 200]) await project(state, { publishedAt });
    const paginationOpts: Args["paginationOpts"] = { numItems: 2, cursor: null, maximumRowsRead: 19, maximumBytesRead: 100_000, id: 42 };
    const expected = await state.t.query((ctx) => ctx.db.query("projects")
      .withSearchIndex("search_marketplace", (q) => q.search("marketplaceSearchText", "atlas")
        .eq("status", "published").eq("visibility", "marketplace").eq("primaryCategory", "renovation"))
      .filter((q) => q.and(q.eq(q.field("regionCode"), "09"), q.eq(q.field("provinceCode"), "09.541")))
      .paginate(paginationOpts));
    type NativeQuery = OrderedQuery<DataModel["projects"]>;
    type Serialized = { source: { type: string; indexName?: string; tableName?: string }; operators: unknown[] };
    type RuntimeQuery = { state: { type: string; query?: Serialized } };
    let prototype!: NativeQuery;
    await state.t.run(async (ctx) => {
      prototype = Object.getPrototypeOf(ctx.db.query("projects").withSearchIndex("search_marketplace",
        (q) => q.search("marketplaceSearchText", "atlas")));
    });
    const paginate = prototype.paginate;
    const iterator = prototype[Symbol.asyncIterator];
    const calls: { query: Serialized; options: Args["paginationOpts"] }[] = [];
    const pageSpy = vi.spyOn(prototype, "paginate").mockImplementation(function(this: NativeQuery, options) {
      const runtime = this as unknown as RuntimeQuery;
      calls.push({ query: structuredClone(runtime.state.query!), options });
      return paginate.call(this, options);
    });
    const iteratorSpy = vi.spyOn(prototype, Symbol.asyncIterator).mockImplementation(function(this: NativeQuery) {
      const source = (this as unknown as RuntimeQuery).state.query?.source;
      expect(source?.indexName?.startsWith("projects.")).not.toBe(true);
      expect(source?.tableName).not.toBe("projects");
      return iterator.call(this);
    });
    try {
      for (const sortBy of [undefined, "newest", "oldest"] as const) {
        const before = calls.length;
        const actual = await state.t.query(api.projects.index.listPublicProjectsPaginated,
          { search: " \tAtlas\n ", regionCode: "09", provinceCode: "09.541", category: "renovation", sortBy, paginationOpts });
        expect(calls).toHaveLength(before + 1);
        expect(calls.at(-1)).toMatchObject({ query: { source: { type: "Search", indexName: "projects.search_marketplace" } }, options: paginationOpts });
        expect(actual.page.map((row) => row.id)).toEqual(expected.page.map((row) => row._id));
        expect(actual).toMatchObject({ continueCursor: expected.continueCursor, isDone: expected.isDone,
          splitCursor: expected.splitCursor, pageStatus: expected.pageStatus });
      }
      for (const [filters, index] of [
        [{}, "by_status_visibility_publishedAt"],
        [{ regionCode: "09" }, "by_status_visibility_region_publishedAt"],
        [{ regionCode: "09", provinceCode: "09.541" }, "by_status_visibility_province_publishedAt"],
        [{ category: "renovation" }, "by_status_visibility_category_publishedAt"],
      ] as const) {
        const before = calls.length;
        await state.t.query(api.projects.index.listPublicProjectsPaginated, { ...filters, paginationOpts });
        expect(calls).toHaveLength(before + 1);
        expect(calls.at(-1)).toMatchObject({ query: { source: { type: "IndexRange", indexName: "projects." + index } }, options: paginationOpts });
      }
    } finally {
      pageSpy.mockRestore();
      iteratorSpy.mockRestore();
    }
  });

  test("the legacy list remains callable with its original bounded array contract", async () => {
    const state = await setup();
    for (let index = 0; index < 31; index++) await project(state);
    expect(await state.t.query(api.projects.index.listPublicProjects, {})).toHaveLength(24);
    expect((await allPages(state)).rows).toHaveLength(31);
  });
});

describe("GEO6.2B public privacy and access boundaries", () => {
  test.each([undefined, "atlas"])("only complete published marketplace DTOs appear with search=%s", async (search) => {
    const state = await setup();
    const visible = await project(state);
    for (const status of ["draft", "pending_review", "needs_changes", "in_discussion", "company_selected", "in_progress", "completed", "cancelled", "archived"] as const) await project(state, { status });
    const privateId = await project(state, { visibility: "invite_only" });
    await project(state, { title: "" });
    await project(state, { description: undefined });
    await project(state, { primaryCategory: undefined });
    await state.t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["PRIVATE_ATTACHMENT_CONTENT"]));
      await ctx.db.insert("projectAttachments", { projectId: visible, clientId: state.clientId, storageId,
        fileName: "PRIVATE_PLAN.pdf", contentType: "application/pdf", size: 10, createdAt: 1 });
    });
    const page = await state.t.query(api.projects.index.listPublicProjectsPaginated,
      { search, regionCode: "09", provinceCode: "09.541", paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map((row) => row.id)).toEqual([visible]);
    expect(Object.keys(page.page[0]).sort()).toEqual(["id", "title", "description", "city", "location", "primaryCategory", "timeline", "publishedAt", "thumbnailUrl"].sort());
    expect(Object.keys(page.page[0].location).sort()).toEqual(["regionCode", "provinceCode", "communeName", "legacyCity"].sort());
    for (const restricted of ["PRIVATE_", '"localityName"', '"neighborhood"', '"siteAddress"', '"clientId"', '"email"', '"phone"', '"attachments"', '"internalNotes"', '"locationMode"', '"marketplaceSearchText"']) expect(JSON.stringify(page)).not.toContain(restricted);
    expect(await state.t.query(api.projects.index.getPublicProject, { projectId: privateId })).toBeNull();
    expect((await allPages(state, { search: rural.localityName })).rows).toEqual([]);
    expect((await allPages(state, { search: rural.neighborhood })).rows).toEqual([]);
    await expect(state.t.query(api.projects.marketplace.listCompanyMarketplaceProjects,
      { paginationOpts: { numItems: 3, cursor: null } })).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test.each(["client", "company", "admin", "seo_team"] as const)("%s identity receives the same general public projection", async (accountType) => {
    const state = await setup();
    await project(state);
    const userId = await state.t.run((ctx) => ctx.db.insert("users", { accountType, onboardingStatus: "completed" }));
    const args = { paginationOpts: { numItems: 10, cursor: null } };
    const anonymous = await state.t.query(api.projects.index.listPublicProjectsPaginated, args);
    const signedIn = await state.t.withIdentity({ subject: String(userId) + "|session", tokenIdentifier: "test|" + userId })
      .query(api.projects.index.listPublicProjectsPaginated, args);
    expect(signedIn).toEqual(anonymous);
  });
});
