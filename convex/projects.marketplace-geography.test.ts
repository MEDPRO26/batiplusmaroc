/// <reference types="vite/client" />

import type { FunctionArgs, FunctionReturnType, WithoutSystemFields } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { buildProjectMarketplaceSearchText } from "./projects/marketplaceSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
type Input = WithoutSystemFields<Doc<"projects">>;
type Filters = Omit<FunctionArgs<typeof api.projects.marketplace.listCompanyMarketplaceProjects>, "paginationOpts">;
const now = 1_790_000_000_000;
const rural = { regionCode: "09", provinceCode: "09.541", communeName: "Commune d’Aoulouz",
  localityName: "PRIVATE_DOUAR_آيت_ⵜⴰⵎⵍⵉⵍ", neighborhood: "PRIVATE_NEIGHBORHOOD" };

function asUser(t: Backend, id: Id<"users">) {
  return t.withIdentity({ subject: `${id}|test-session`, tokenIdentifier: `test|${id}` });
}
async function setup() {
  const t = convexTest(schema, modules);
  const clientId = await t.run((ctx) => ctx.db.insert("users", {
    accountType: "client", onboardingStatus: "completed", email: "PRIVATE_EMAIL@example.test", phone: "PRIVATE_PHONE",
    firstName: "Samir", lastName: "Private", countryCode: "MA", createdAt: 1, updatedAt: 1,
  }));
  const companyUserId = await t.run((ctx) => ctx.db.insert("users", { accountType: "company", onboardingStatus: "completed" }));
  const companyId = await t.run((ctx) => ctx.db.insert("companies", { name: "Atlas Build", onboardingStatus: "completed",
    verificationStatus: "verified", operationalStatus: "normal", createdAt: 1, updatedAt: 1 }));
  const membershipId = await t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId, userId: companyUserId, role: "owner", status: "active", createdAt: 1,
  }));
  return { t, clientId, companyUserId, companyId, membershipId, caller: asUser(t, companyUserId) };
}
type State = Awaited<ReturnType<typeof setup>>;
async function project(state: State, overrides: Partial<Input> = {}) {
  const input: Input = {
    clientId: state.clientId, countryCode: "MA", ...rural, locationMode: "structured",
    title: "Atlas rural renovation", description: "General construction description.", primaryCategory: "renovation",
    propertyType: "house", surface: 150, surfaceUnknown: false, timeline: "flexible", status: "published",
    visibility: "marketplace", lastCompletedStep: 5, publishedAt: now, createdAt: 1, updatedAt: 1, ...overrides,
  };
  return await state.t.run((ctx) => ctx.db.insert("projects", {
    ...input, marketplaceSearchText: buildProjectMarketplaceSearchText(input),
  }));
}
async function allPages(state: State, filters: Filters, numItems = 3, maximumRowsRead?: number) {
  const rows: Id<"projects">[] = [];
  const pages: FunctionReturnType<typeof api.projects.marketplace.listCompanyMarketplaceProjects>[] = [];
  let cursor: string | null = null;
  for (let count = 0; count < 300; count++) {
    const page: FunctionReturnType<typeof api.projects.marketplace.listCompanyMarketplaceProjects> = await state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      ...filters, paginationOpts: { numItems, cursor, maximumRowsRead },
    });
    pages.push(page);
    rows.push(...page.page.map((row) => row.id));
    if (page.isDone) {
      expect(new Set(rows).size).toBe(rows.length);
      return { rows, pages };
    }
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }
  throw new Error("Pagination did not reach the end of the fixture");
}

describe("GEO6.1 geographic query contract", () => {
  test.each(["", "9", "00", "99", " 09 ", "Souss-Massa", "__proto__"])("rejects invalid region %j", async (regionCode) => {
    const state = await setup();
    await expect(state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      regionCode, paginationOpts: { numItems: 3, cursor: null },
    })).rejects.toThrow("INVALID_PROJECT_REGION");
  });

  test.each(["", "9.541", "09.000", "99.999", " 09.541 ", "Taroudannt"])("rejects invalid province %j", async (provinceCode) => {
    const state = await setup();
    await expect(state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      regionCode: "09", provinceCode, paginationOpts: { numItems: 3, cursor: null },
    })).rejects.toThrow("INVALID_PROJECT_PROVINCE");
  });

  test.each<[Filters, string]>([
    [{ provinceCode: "09.541" }, "PROJECT_REGION_REQUIRED"],
    [{ regionCode: "05", provinceCode: "09.541" }, "PROJECT_PROVINCE_REGION_MISMATCH"],
    [{ regionCode: "09", city: "agadir" }, "AMBIGUOUS_PROJECT_LOCATION_FILTER"],
    [{ regionCode: "09", cities: ["agadir"] }, "AMBIGUOUS_PROJECT_LOCATION_FILTER"],
    [{ regionCode: "09", cities: [] }, "AMBIGUOUS_PROJECT_LOCATION_FILTER"],
    [{ provinceCode: "09.541", city: "agadir" }, "AMBIGUOUS_PROJECT_LOCATION_FILTER"],
  ])("rejects incomplete, cross-region and mixed geographic arguments: %j", async (filters, code) => {
    const state = await setup();
    await expect(state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      ...filters, paginationOpts: { numItems: 3, cursor: null },
    })).rejects.toThrow(code);
  });
});

describe("GEO6.1 nationwide and historical discovery", () => {
  test("All Morocco includes legacy, rural, mixed and marked records without deriving geography or reviving city labels", async () => {
    const state = await setup();
    const legacy = await project(state, { regionCode: undefined, provinceCode: undefined, communeName: undefined,
      localityName: undefined, locationMode: undefined, city: "agadir", publishedAt: 10 });
    const structured = await project(state, { publishedAt: 20 });
    const mixed = await project(state, { city: "rabat", locationMode: undefined, publishedAt: 30 });
    const cleared = await project(state, { regionCode: undefined, provinceCode: undefined, communeName: undefined,
      localityName: undefined, city: "agadir", publishedAt: 40 });
    const storedBefore = await state.t.run((ctx) => Promise.all([legacy, structured, mixed, cleared].map((id) => ctx.db.get(id))));
    expect((await allPages(state, { sortBy: "oldest" })).rows).toEqual([legacy, structured, mixed, cleared]);
    const page = await state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.find((row) => row.id === legacy)?.location.legacyCity).toBe("agadir");
    expect(page.page.find((row) => row.id === structured)?.city).toBeNull();
    for (const id of [mixed, cleared]) expect(page.page.find((row) => row.id === id)?.location.legacyCity).toBeNull();
    expect((await allPages(state, { regionCode: "09", sortBy: "oldest" })).rows).toEqual([structured, mixed]);
    expect((await allPages(state, { city: "agadir", sortBy: "oldest" })).rows).toEqual([legacy, cleared]);
    expect((await allPages(state, { cities: ["rabat", "agadir"], sortBy: "oldest" })).rows).toEqual([legacy, mixed, cleared]);
    expect((await allPages(state, { city: "rabat", cities: ["agadir"], sortBy: "oldest" })).rows).toEqual([legacy, cleared]);
    expect(await state.t.run((ctx) => Promise.all([legacy, structured, mixed, cleared].map((id) => ctx.db.get(id))))).toEqual(storedBefore);
  });

  test("a region includes its different provinces; a province narrows it and excludes inconsistent stored parents", async () => {
    const state = await setup();
    const taroudannt = await project(state, { publishedAt: 10 });
    const agadir = await project(state, { provinceCode: "09.001", publishedAt: 20 });
    await project(state, { regionCode: "05", provinceCode: "05.081", publishedAt: 30 });
    await project(state, { regionCode: "05", provinceCode: "09.541", publishedAt: 40 });
    expect((await allPages(state, { regionCode: "09" })).rows).toEqual([agadir, taroudannt]);
    expect((await allPages(state, { regionCode: "09", provinceCode: "09.541" })).rows).toEqual([taroudannt]);
    expect((await allPages(state, { regionCode: "09", provinceCode: "09.001" })).rows).toEqual([agadir]);
    expect((await allPages(state, { regionCode: "12" })).rows).toEqual([]);
  });
});

describe("GEO6.1 combined filters and native pagination", () => {
  test.each(["newest", "oldest"] as const)("search/category/timeline/property/surface/date combinations retain %s order", async (sortBy) => {
    const state = await setup();
    const matching = [];
    for (const publishedAt of [now - 30_000, now - 20_000, now - 20_000, now - 10_000]) {
      matching.push(await project(state, { title: "Atlas renovation match", publishedAt }));
    }
    for (const overrides of [
      { regionCode: "05", provinceCode: "05.081" }, { provinceCode: "09.001" },
      { title: "Different keyword" }, { primaryCategory: "architecture" as const }, { timeline: "asap" as const },
      { propertyType: "apartment" as const }, { surface: 70 }, { publishedAt: now - 40 * 86_400_000 },
      { visibility: "invite_only" as const }, { status: "pending_review" as const },
    ]) await project(state, { title: "Atlas renovation match", ...overrides });
    const filters: Filters = { regionCode: "09", provinceCode: "09.541", search: "  atlas  ", categories: ["renovation", "painting"],
      timelines: ["flexible"], propertyTypes: ["house"], surfaceRanges: ["100_200"], postedWindows: ["last_7d"], now, sortBy };
    const { rows } = await allPages(state, filters, 1);
    expect(rows).toEqual(sortBy === "oldest" ? matching : [...matching].reverse());
  });

  test.each(["newest", "oldest"] as const)("201+ common projects and sparse late matches paginate in %s order without a cap", async (sortBy) => {
    const state = await setup();
    const everyId = [];
    const rareIds = [];
    for (let index = 0; index < 251; index++) {
      const rare = [3, 91, 207, 230, 240, 250].includes(index);
      const id = await project(state, { title: rare ? "Atlas rare renovation" : "Atlas common renovation",
        primaryCategory: rare ? "painting" : "renovation", publishedAt: now - index * 1000 });
      everyId.push(id);
      if (rare) rareIds.push(id);
    }
    const expected = (ids: Id<"projects">[]) => sortBy === "newest" ? ids : [...ids].reverse();
    expect((await allPages(state, { regionCode: "09", provinceCode: "09.541", sortBy }, 17)).rows).toEqual(expected(everyId));
    expect((await allPages(state, { regionCode: "09", search: "atlas", sortBy }, 17)).rows).toEqual(expected(everyId));
    for (const search of [undefined, "rare"]) {
      const paginated = await allPages(state, { regionCode: "09", provinceCode: "09.541", categories: ["painting", "architecture"],
        search, postedWindows: ["last_7d"], now, sortBy }, 2, 19);
      expect(paginated.rows).toEqual(expected(rareIds));
      expect(paginated.pages.some((page) => page.pageStatus === "SplitRequired" && !page.isDone)).toBe(true);
    }
  });

  test.each(["newest", "oldest"] as const)("rare region and province matches among 251 nationwide projects retain %s pagination", async (sortBy) => {
    const state = await setup();
    const commonIds: Id<"projects">[] = [];
    const regionIds: Id<"projects">[] = [];
    const provinceIds: Id<"projects">[] = [];
    for (let index = 0; index < 251; index++) {
      const rareRegion = [3, 91, 207, 230, 240, 250].includes(index);
      const rareProvince = [207, 240, 250].includes(index);
      const id = await project(state, {
        regionCode: rareRegion ? "09" : "05",
        provinceCode: rareRegion ? (rareProvince ? "09.541" : "09.001") : "05.081",
        publishedAt: now - index * 1000,
      });
      if (rareRegion) regionIds.push(id);
      else commonIds.push(id);
      if (rareProvince) provinceIds.push(id);
    }
    const expected = (ids: Id<"projects">[]) => sortBy === "newest" ? ids : [...ids].reverse();
    expect((await allPages(state, { regionCode: "05", sortBy }, 17)).rows).toEqual(expected(commonIds));
    for (const search of [undefined, "atlas"]) {
      expect((await allPages(state, { regionCode: "09", search, sortBy }, 2, 19)).rows).toEqual(expected(regionIds));
      expect((await allPages(state, { regionCode: "09", provinceCode: "09.541", search, sortBy }, 1, 19)).rows).toEqual(expected(provinceIds));
    }
  });

  test("native endCursor and split metadata survive projection without losing matches", async () => {
    const state = await setup();
    const ids = [];
    for (let index = 0; index < 8; index++) ids.push(await project(state, { publishedAt: index + 1 }));
    const filters = { regionCode: "09", search: "atlas", sortBy: "oldest" as const };
    const first = await state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      ...filters, paginationOpts: { numItems: 3, cursor: null },
    });
    const sameRange = await state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      ...filters, paginationOpts: { numItems: 1, cursor: null, endCursor: first.continueCursor, id: 42 },
    });
    expect(sameRange.page.map((row) => row.id)).toEqual(ids.slice(0, 3));
    const limited = await state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      ...filters, paginationOpts: { numItems: 8, cursor: null, maximumBytesRead: 1 },
    });
    expect(limited.pageStatus).toBe("SplitRequired");
    expect(limited.isDone).toBe(false);
    expect((await allPages(state, filters, 2)).rows).toEqual(ids);
  });

  test("an incomplete published card cannot consume a page or hide later eligible matches", async () => {
    const state = await setup();
    const good = await project(state, { publishedAt: 10 });
    await project(state, { title: undefined, publishedAt: 20 });
    await project(state, { description: "", publishedAt: 30 });
    expect((await allPages(state, { regionCode: "09" }, 1)).rows).toEqual([good]);
  });
});

describe("GEO6.1 privacy and current Company authorization", () => {
  test.each([undefined, "atlas"])("feeds omit locality, neighborhood, contact, files and private records with search=%s", async (search) => {
    const state = await setup();
    const visible = await project(state);
    for (const status of ["draft", "pending_review", "needs_changes", "in_discussion", "company_selected", "in_progress", "completed", "cancelled", "archived"] as const) {
      await project(state, { status });
    }
    await project(state, { visibility: "invite_only" });
    const page = await state.caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      regionCode: "09", provinceCode: "09.541", search, paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((row) => row.id)).toEqual([visible]);
    expect(Object.keys(page.page[0].location).sort()).toEqual(["communeName", "legacyCity", "provinceCode", "regionCode"]);
    for (const secret of ["PRIVATE_", '"localityName"', '"neighborhood"', '"locationMode"', '"siteAddress"', '"attachments"', '"email"', '"phone"']) {
      expect(JSON.stringify(page)).not.toContain(secret);
    }
    expect((await allPages(state, { regionCode: "09", search: rural.localityName })).rows).toEqual([]);
  });

  test.each(["anonymous", "client", "admin", "seo_team", "revoked membership", "wrong role", "incomplete onboarding"] as const)("denies %s before reading geography", async (audience) => {
    const state = await setup();
    await project(state);
    let caller = state.caller;
    let code = "COMPANY_ACCOUNT_REQUIRED";
    if (audience === "anonymous") { caller = state.t; code = "NOT_AUTHENTICATED"; }
    else if (audience === "client") caller = asUser(state.t, state.clientId);
    else if (audience === "admin" || audience === "seo_team") {
      const id = await state.t.run((ctx) => ctx.db.insert("users", { accountType: audience }));
      caller = asUser(state.t, id);
    } else if (audience === "revoked membership") {
      await state.t.run((ctx) => ctx.db.patch(state.membershipId, { status: "inactive" }));
      code = "COMPANY_MEMBERSHIP_REQUIRED";
    } else if (audience === "wrong role") await state.t.run((ctx) => ctx.db.patch(state.companyUserId, { accountType: "client" }));
    else {
      await state.t.run((ctx) => ctx.db.patch(state.companyId, { onboardingStatus: "pending" }));
      code = "COMPANY_ONBOARDING_REQUIRED";
    }
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      regionCode: "09", paginationOpts: { numItems: 3, cursor: null },
    })).rejects.toThrow(code);
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      regionCode: "invalid", paginationOpts: { numItems: 3, cursor: null },
    })).rejects.toThrow(code);
  });

  test.each(["verified", "pending", "suspended"] as const)("%s Company browsing preserves its existing proposal eligibility", async (status) => {
    const state = await setup();
    const id = await project(state);
    await state.t.run((ctx) => ctx.db.patch(state.companyId, status === "suspended" ? { operationalStatus: status } : { verificationStatus: status }));
    expect((await allPages(state, { regionCode: "09" })).rows).toEqual([id]);
    const detail = await state.caller.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: id });
    expect(detail?.canSubmitQuote).toBe(status === "verified");
  });
});
