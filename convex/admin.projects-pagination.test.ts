/// <reference types="vite/client" />

import type { FunctionArgs, FunctionReturnType, OrderedQuery, WithoutSystemFields } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { getProvincesByRegion, getRegions } from "../lib/geography/morocco";
import { api } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Input = WithoutSystemFields<Doc<"projects">>;
type Args = FunctionArgs<typeof api.admin.projects.listProjectsPage>;
type Filters = Omit<Args, "paginationOpts">;
type Page = FunctionReturnType<typeof api.admin.projects.listProjectsPage>;

async function setup() {
  const t = convexTest(schema, modules);
  const [adminId, clientId] = await t.run(async (ctx) => Promise.all([
    ctx.db.insert("users", { accountType: "admin", firstName: "Ada", lastName: "Admin" }),
    ctx.db.insert("users", { accountType: "client", firstName: "Client", lastName: "Tester",
      email: "PRIVATE_EMAIL@example.test", phone: "PRIVATE_PHONE" }),
  ]));
  const admin = t.withIdentity({ subject: `${adminId}|session`, tokenIdentifier: `test|${adminId}` });
  return { t, admin, adminId, clientId };
}
type State = Awaited<ReturnType<typeof setup>>;

function input(clientId: Id<"users">, overrides: Partial<Input> = {}): Input {
  return { clientId, countryCode: "MA", title: "Rural roof project", status: "pending_review",
    visibility: "marketplace", surfaceUnknown: true, lastCompletedStep: 5, createdAt: 1, updatedAt: 1,
    submittedAt: 100, regionCode: "05", provinceCode: "05.081", locationMode: "structured",
    communeName: "Aït Tamlil — آيت تامليل", localityName: "Douar ⵜⴰⵎⵍⵉⵍ", ...overrides };
}
async function project(state: State, overrides: Partial<Input> = {}) {
  return state.t.run((ctx) => ctx.db.insert("projects", input(state.clientId, overrides)));
}
async function allPages(state: State, filters: Filters = { status: "all" }, numItems = 7, maximumRowsRead?: number) {
  const rows: Page["page"] = [];
  const pages: Page[] = [];
  let cursor: string | null = null;
  for (let count = 0; count < 400; count++) {
    const page: Page = await state.admin.query(api.admin.projects.listProjectsPage,
      { ...filters, paginationOpts: { numItems, cursor, maximumRowsRead } });
    pages.push(page);
    rows.push(...page.page);
    if (page.isDone) {
      expect(new Set(rows.map((row) => row.projectId)).size).toBe(rows.length);
      return { rows, pages };
    }
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }
  throw new Error("Fixture pagination did not exhaust");
}
function ids(rows: Page["page"]) { return rows.map((row) => row.projectId); }

describe("GEO9.1B Admin Project pagination and ordering", () => {
  test("includes 202 projects and orders by submission independently of creation, publication and visibility", async () => {
    const state = await setup();
    const older = await project(state, { title: "Older private rural project", submittedAt: 10_000,
      visibility: "invite_only", createdAt: 1, publishedAt: 1 });
    const rest = await state.t.run(async (ctx) => {
      const result = [];
      for (let index = 1; index <= 201; index++) {
        result.push(await ctx.db.insert("projects", input(state.clientId, {
          submittedAt: index, createdAt: index + 1, publishedAt: 20_000 - index,
        })));
      }
      return result;
    });
    const original = await state.admin.query(api.admin.projects.listProjects, { status: "all" });
    expect(original).toHaveLength(200);
    expect(ids(original)).not.toContain(older);
    const { rows, pages } = await allPages(state, { status: "all" }, 25);
    expect(ids(rows)).toEqual([older, ...rest.reverse()]);
    expect(rows).toHaveLength(202);
    expect(pages.length).toBeGreaterThan(1);
    expect((await allPages(state, { status: "all", search: "older private", regionCode: "05", provinceCode: "05.081" })).rows)
      .toEqual([expect.objectContaining({ projectId: older })]);
  });

  test("historical undated projects remain last, visible and unmodified in every index path", async () => {
    const state = await setup();
    const datedOld = await project(state, { submittedAt: 20, createdAt: 90_000, publishedAt: 90_000 });
    const undated = await project(state, { submittedAt: undefined, createdAt: 99_000, publishedAt: 99_000, title: undefined });
    const datedNew = await project(state, { submittedAt: 30, createdAt: 1, publishedAt: 1 });
    const storedBefore = await state.t.run((ctx) => ctx.db.get(undated));
    for (const filters of [
      { status: "all" }, { status: "pending_review" },
      { status: "all", regionCode: "05" },
      { status: "pending_review", regionCode: "05", provinceCode: "05.081" },
    ] satisfies Filters[]) {
      const { rows } = await allPages(state, filters, 1);
      expect(ids(rows)).toEqual([datedNew, datedOld, undated]);
      expect(rows[2]).toMatchObject({ submittedAt: null, title: "—" });
    }
    expect(await state.t.run((ctx) => ctx.db.get(undated))).toEqual(storedBefore);
  });

  test("equal submission timestamps retain native tie ordering across page boundaries without duplicates", async () => {
    const state = await setup();
    for (let index = 0; index < 12; index++) await project(state, { createdAt: 1000 - index, submittedAt: 100 });
    const native = await state.t.query((ctx) => ctx.db.query("projects").withIndex("by_submittedAt")
      .order("desc").paginate({ numItems: 100, cursor: null }));
    expect(ids((await allPages(state, { status: "all" }, 1)).rows)).toEqual(native.page.map((row) => row._id));
  });

  test("empty intermediate pages retain continuation until a match beyond the old cap", async () => {
    const state = await setup();
    const target = await project(state, { title: "The RURAL ROOF target", city: "rabat", submittedAt: 1,
      visibility: "invite_only" });
    await state.t.run(async (ctx) => {
      for (let index = 0; index < 201; index++) await ctx.db.insert("projects", input(state.clientId, {
        submittedAt: index + 2, createdAt: index + 2,
        title: index % 2 ? "Different project" : "The rural roof target",
        city: "agadir", status: index % 2 ? "pending_review" : "published",
      }));
    });
    const filters: Filters = { status: "pending_review", city: "rabat", search: "  RURAL   ROOF  ",
      regionCode: "05", provinceCode: "05.081" };
    const { rows, pages } = await allPages(state, filters, 20, 11);
    expect(pages[0].page).toEqual([]);
    expect(pages[0].isDone).toBe(false);
    expect(pages.filter((page) => !page.page.length && !page.isDone).length).toBeGreaterThan(10);
    expect(ids(rows)).toEqual([target]);
    expect(pages.at(-1)?.isDone).toBe(true);
    expect((await allPages(state, { ...filters, search: "absent everywhere" }, 25)).rows).toEqual([]);
  });

  test("passes native end cursors, id, row/byte limits and split metadata through the allowlisted DTO", async () => {
    const state = await setup();
    for (let index = 0; index < 8; index++) await project(state, { submittedAt: index + 1 });
    const args: Filters = { status: "all", regionCode: "05", provinceCode: "05.081" };
    const first = await state.admin.query(api.admin.projects.listProjectsPage,
      { ...args, paginationOpts: { numItems: 3, cursor: null } });
    const sameRange = await state.admin.query(api.admin.projects.listProjectsPage,
      { ...args, paginationOpts: { numItems: 1, cursor: null, endCursor: first.continueCursor, id: 42 } });
    expect(sameRange.page).toEqual(first.page);
    expect(sameRange.continueCursor).toBe(first.continueCursor);
    expect(sameRange.isDone).toBe(first.isDone);
    const rowLimited = await state.admin.query(api.admin.projects.listProjectsPage,
      { ...args, paginationOpts: { numItems: 8, cursor: null, maximumRowsRead: 3 } });
    expect(rowLimited.pageStatus).toBe("SplitRequired");
    expect(rowLimited.splitCursor).toEqual(expect.any(String));
    expect(rowLimited.isDone).toBe(false);
    const byteLimited = await state.admin.query(api.admin.projects.listProjectsPage,
      { ...args, paginationOpts: { numItems: 8, cursor: null, maximumBytesRead: 1 } });
    expect(byteLimited.pageStatus).toBe("SplitRequired");
    expect(byteLimited.isDone).toBe(false);
    expect((await allPages(state, args, 3, 2)).rows).toHaveLength(8);
  });

  test("uses a single ordered native page with complete options and no database residual scan", async () => {
    const state = await setup();
    await project(state);
    type NativeQuery = OrderedQuery<DataModel["projects"]>;
    type Serialized = { source: { indexName: string }; operators: unknown[] };
    type Runtime = { state: { query: Serialized } };
    let prototype!: NativeQuery;
    await state.t.run(async (ctx) => {
      prototype = Object.getPrototypeOf(ctx.db.query("projects").withIndex("by_submittedAt").order("desc"));
    });
    const paginate = prototype.paginate;
    const calls: { indexName: string; operators: unknown[]; options: Args["paginationOpts"] }[] = [];
    const spy = vi.spyOn(prototype, "paginate").mockImplementation(function (this: NativeQuery, options) {
      const serialized = (this as unknown as Runtime).state.query;
      calls.push({ indexName: serialized.source.indexName, operators: serialized.operators, options });
      return paginate.call(this, options);
    });
    try {
      const paginationOpts = { numItems: 5, cursor: null, id: 42, maximumRowsRead: 3, maximumBytesRead: 100_000 };
      for (const [filters, indexName] of [
        [{ status: "all" }, "projects.by_submittedAt"],
        [{ status: "pending_review" }, "projects.by_status_and_submittedAt"],
        [{ status: "published", regionCode: "05" }, "projects.by_regionCode_and_submittedAt"],
        [{ status: "all", regionCode: "05", provinceCode: "05.081", city: "rabat", search: "missing" }, "projects.by_provinceCode_and_submittedAt"],
      ] satisfies [Filters, string][]) {
        calls.length = 0;
        await state.admin.query(api.admin.projects.listProjectsPage, { ...filters, paginationOpts });
        expect(calls).toEqual([{ indexName, operators: [], options: paginationOpts }]);
      }
    } finally { spy.mockRestore(); }
  });
});

describe("GEO9.1B recorded geography and filter compatibility", () => {
  test("uses all twelve GEO1 regions and their dependent provinces", async () => {
    const state = await setup();
    const selections = [];
    for (const region of getRegions()) {
      const province = getProvincesByRegion(region.code)[0];
      selections.push({ regionCode: region.code, provinceCode: province.code,
        id: await project(state, { regionCode: region.code, provinceCode: province.code }) });
    }
    for (const selection of selections) {
      expect(ids((await allPages(state, { status: "all", regionCode: selection.regionCode })).rows)).toEqual([selection.id]);
      expect(ids((await allPages(state, { status: "all", regionCode: selection.regionCode, provinceCode: selection.provinceCode })).rows)).toEqual([selection.id]);
    }
  });

  test("combines title, city, status and geography while retaining both visibility types", async () => {
    const state = await setup();
    const target = await project(state, { city: "rabat", visibility: "invite_only", submittedAt: 80 });
    const publicTarget = await project(state, { city: "rabat", submittedAt: 70 });
    await project(state, { status: "published", city: "rabat" });
    await project(state, { city: "agadir" });
    await project(state, { city: "rabat", title: "Different title" });
    await project(state, { city: "rabat", provinceCode: "05.091" });
    await project(state, { city: "rabat", regionCode: "09", provinceCode: "05.081" });
    const { rows } = await allPages(state, { status: "pending_review", search: "  RURAL   roof ", city: "rabat",
      regionCode: "05", provinceCode: "05.081" }, 1);
    expect(ids(rows)).toEqual([target, publicTarget]);
    expect(rows[0].clientName).toBe("Client Tester");
    expect(Object.keys(rows[0]).sort()).toEqual(["projectId", "title", "clientName", "city", "location",
      "category", "customCategoryText", "submittedAt", "status"].sort());
    expect(Object.keys(rows[0].location).sort()).toEqual(["regionCode", "provinceCode", "communeName", "legacyCity", "localityName", "neighborhood"].sort());
    expect(JSON.stringify(rows)).not.toMatch(/PRIVATE_EMAIL|PRIVATE_PHONE|siteAddress|clientId/);
  });

  test("all-geography retains city-only and cleared history without inferring geographic codes", async () => {
    const state = await setup();
    const legacy = await project(state, { regionCode: undefined, provinceCode: undefined,
      communeName: undefined, localityName: undefined, locationMode: undefined, city: "rabat", submittedAt: undefined });
    const cleared = await project(state, { regionCode: undefined, provinceCode: undefined,
      communeName: undefined, localityName: undefined, city: "agadir", submittedAt: undefined });
    const structured = await project(state);
    const before = await state.t.run((ctx) => Promise.all([legacy, cleared, structured].map((id) => ctx.db.get(id))));
    expect(new Set(ids((await allPages(state)).rows))).toEqual(new Set([legacy, cleared, structured]));
    expect(ids((await allPages(state, { status: "all", city: "rabat" })).rows)).toEqual([legacy]);
    expect(ids((await allPages(state, { status: "all", regionCode: "05" })).rows)).toEqual([structured]);
    expect(await state.t.run((ctx) => Promise.all([legacy, cleared, structured].map((id) => ctx.db.get(id))))).toEqual(before);
  });

  test.each(["", "5", "99", " 05 ", "Béni Mellal-Khénifra"])("rejects noncanonical region %j", async (regionCode) => {
    const state = await setup();
    await expect(state.admin.query(api.admin.projects.listProjectsPage,
      { status: "all", regionCode, paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow("INVALID_PROJECT_REGION");
  });
  test.each(["", "5.081", "05.000", " 05.081 ", "Azilal"])("rejects noncanonical province %j", async (provinceCode) => {
    const state = await setup();
    await expect(state.admin.query(api.admin.projects.listProjectsPage,
      { status: "all", regionCode: "05", provinceCode, paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow("INVALID_PROJECT_PROVINCE");
  });
  test.each<[Partial<Filters>, string]>([
    [{ provinceCode: "05.081" }, "PROJECT_REGION_REQUIRED"],
    [{ regionCode: "09", provinceCode: "05.081" }, "PROJECT_PROVINCE_REGION_MISMATCH"],
  ])("rejects invalid administrative selection %j", async (filters, error) => {
    const state = await setup();
    await expect(state.admin.query(api.admin.projects.listProjectsPage,
      { status: "all", ...filters, paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow(error);
  });
  test.each([0, -1, 1.5, 101, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid page size %s", async (numItems) => {
    const state = await setup();
    await expect(state.admin.query(api.admin.projects.listProjectsPage,
      { status: "all", paginationOpts: { numItems, cursor: null } })).rejects.toThrow("INVALID_ADMIN_PROJECT_PAGE_SIZE");
  });
});

describe("GEO9.1B Admin authorization on every page", () => {
  test("blocks anonymous, Client, Company and SEO callers", async () => {
    const state = await setup();
    const args: Args = { status: "all", paginationOpts: { numItems: 5, cursor: null } };
    await expect(state.t.query(api.admin.projects.listProjectsPage, args)).rejects.toThrow("NOT_AUTHENTICATED");
    for (const accountType of ["client", "company", "seo_team"] as const) {
      const userId = await state.t.run((ctx) => ctx.db.insert("users", { accountType }));
      const caller = state.t.withIdentity({ subject: `${userId}|session` });
      await expect(caller.query(api.admin.projects.listProjectsPage, args)).rejects.toThrow("ADMIN_REQUIRED");
    }
  });
  test.each(["revoked", "deleted"] as const)("rechecks an Admin who is %s before continuation", async (change) => {
    const state = await setup();
    await project(state);
    await project(state);
    const first = await state.admin.query(api.admin.projects.listProjectsPage,
      { status: "all", paginationOpts: { numItems: 1, cursor: null } });
    await state.t.run((ctx) => change === "deleted" ? ctx.db.delete(state.adminId) :
      ctx.db.patch(state.adminId, { accountType: "company" }));
    await expect(state.admin.query(api.admin.projects.listProjectsPage,
      { status: "all", paginationOpts: { numItems: 1, cursor: first.continueCursor } })).rejects.toThrow("ADMIN_REQUIRED");
  });
});
