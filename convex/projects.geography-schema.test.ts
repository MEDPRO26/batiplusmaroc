/// <reference types="vite/client" />

import type { WithoutSystemFields } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { buildProjectMarketplaceSearchText } from "./projects/marketplaceSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
type ProjectInput = WithoutSystemFields<Doc<"projects">>;

const geography = {
  regionCode: "01",
  provinceCode: "01.511",
  communeName: " Commune privée — جماعة ",
  localityName: "Douar privé — دوار ⵜⴰⵎⵍⵉⵍ",
};
const geographicFields = ["regionCode", "provinceCode", "communeName", "localityName"] as const;

async function insertUser(t: Backend, accountType: "client" | "company" = "client") {
  return await t.run((ctx) => ctx.db.insert("users", {
    accountType,
    onboardingStatus: "completed",
    countryCode: "MA",
    firstName: "Samir",
    lastName: "Test",
    createdAt: 1,
    updatedAt: 1,
  }));
}

function projectInput(clientId: Id<"users">, overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    clientId,
    countryCode: "MA",
    surfaceUnknown: true,
    visibility: "marketplace",
    status: "draft",
    lastCompletedStep: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function publishedProject(clientId: Id<"users">, overrides: Partial<ProjectInput> = {}): ProjectInput {
  const project = projectInput(clientId, {
    title: "Rénovation maison",
    description: "Rénovation complète de la maison avec travaux de peinture.",
    primaryCategory: "renovation",
    city: "rabat",
    neighborhood: "Ancien quartier",
    propertyType: "house",
    timeline: "flexible",
    status: "published",
    lastCompletedStep: 5,
    publishedAt: 100,
    ...overrides,
  });
  return { ...project, marketplaceSearchText: buildProjectMarketplaceSearchText(project) };
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

describe("GEO2 additive project storage", () => {
  const shapes: { label: string; fields: Partial<ProjectInput> }[] = [
    { label: "legacy city only", fields: { city: "agadir" } },
    { label: "legacy city and neighborhood", fields: { city: "agadir", neighborhood: "Founty" } },
    { label: "draft without any location", fields: {} },
    { label: "structured location without legacy city", fields: { ...geography } },
    { label: "mixed historical and new location", fields: { city: "rabat", neighborhood: "Agdal", ...geography } },
  ];

  test.each(shapes)("accepts and preserves $label", async ({ fields }) => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    const input = projectInput(clientId, fields);
    const projectId = await t.run((ctx) => ctx.db.insert("projects", input));
    const stored = await t.run((ctx) => ctx.db.get("projects", projectId));

    expect(stored).toMatchObject(input);
    for (const field of ["city", "neighborhood", ...geographicFields] as const) {
      expect(stored?.[field]).toBe(input[field]);
      if (input[field] === undefined) expect(stored).not.toHaveProperty(field);
    }
  });

  test.each(geographicFields)("allows %s independently of every other location field", async (field) => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    const projectId = await t.run((ctx) => ctx.db.insert("projects", projectInput(clientId, {
      [field]: geography[field],
    })));
    const stored = await t.run((ctx) => ctx.db.get("projects", projectId));
    expect(stored?.[field]).toBe(geography[field]);
    expect(stored).not.toHaveProperty("city");
    for (const other of geographicFields.filter((candidate) => candidate !== field)) {
      expect(stored).not.toHaveProperty(other);
    }
  });

  test.each(geographicFields)("rejects numeric and null %s rather than coercing to strings", async (field) => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    for (const value of [1, null]) {
      // Deliberately bypass TypeScript to verify the storage validator itself.
      const invalid = { ...projectInput(clientId), [field]: value } as unknown as ProjectInput;
      await expect(t.run((ctx) => ctx.db.insert("projects", invalid))).rejects.toThrow("Validator error");
    }
  });

  test.each([
    "clientId", "countryCode", "surfaceUnknown", "visibility", "status",
    "lastCompletedStep", "createdAt", "updatedAt",
  ] as const)("preserves the existing required %s field", async (field) => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    const invalid = { ...projectInput(clientId), [field]: undefined } as unknown as ProjectInput;
    await expect(t.run((ctx) => ctx.db.insert("projects", invalid))).rejects.toThrow(`Missing required field \`${field}\``);
  });

  test("preserves Morocco-only storage and the legacy ten-city validator", async () => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    for (const invalidFields of [{ countryCode: "FR" }, { city: "azilal" }]) {
      const invalid = { ...projectInput(clientId), ...invalidFields } as unknown as ProjectInput;
      await expect(t.run((ctx) => ctx.db.insert("projects", invalid))).rejects.toThrow("Validator error");
    }
  });

  test("keeps catalogue and parent validation outside the additive storage layer", async () => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    for (const fields of [
      { regionCode: "05", provinceCode: "01.511" },
      { regionCode: "future-region", provinceCode: "future-province" },
    ]) {
      const projectId = await t.run((ctx) => ctx.db.insert("projects", projectInput(clientId, fields)));
      expect(await t.run((ctx) => ctx.db.get("projects", projectId))).toMatchObject(fields);
    }
  });

  test("an existing draft mutation neither derives geography nor rewrites historical or new location values", async () => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    const caller = asUser(t, clientId);
    for (const fields of [
      { city: "rabat" as const, neighborhood: "Agdal" },
      { city: "rabat" as const, neighborhood: "Agdal", ...geography },
    ]) {
      const projectId = await t.run((ctx) => ctx.db.insert("projects", projectInput(clientId, fields)));
      await caller.mutation(api.projects.index.saveTimeline, { projectId, timeline: "flexible" });
      const stored = await t.run((ctx) => ctx.db.get("projects", projectId));
      expect(stored).toMatchObject({ ...fields, timeline: "flexible" });
      for (const field of geographicFields) {
        expect(stored?.[field]).toBe(field in fields ? geography[field] : undefined);
      }
    }
  });
});

describe("GEO2 geographic index foundation", () => {
  test.each(["region", "province"] as const)("%s index uses status/visibility/area equality followed by native date pagination", async (area) => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    const matching: Id<"projects">[] = [];
    for (const [index, publishedAt] of [100, 200, 200].entries()) {
      matching.push(await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, {
        ...geography,
        publishedAt,
        city: index === 0 ? undefined : "rabat",
      }))));
    }
    for (const fields of [
      { regionCode: "05", provinceCode: "05.081" },
      {},
      { ...geography, visibility: "invite_only" as const },
      { ...geography, status: "pending_review" as const },
    ]) {
      await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { publishedAt: 900, ...fields })));
    }

    const readPage = (cursor: string | null) => t.query(async (ctx) => {
      const query = area === "region"
        ? ctx.db.query("projects").withIndex("by_status_visibility_region_publishedAt", (q) =>
          q.eq("status", "published").eq("visibility", "marketplace").eq("regionCode", "01"))
        : ctx.db.query("projects").withIndex("by_status_visibility_province_publishedAt", (q) =>
          q.eq("status", "published").eq("visibility", "marketplace").eq("provinceCode", "01.511"));
      return await query.order("desc").paginate({ numItems: 1, cursor });
    });
    const first = await readPage(null);
    const second = await readPage(first.continueCursor);
    const third = await readPage(second.continueCursor);

    expect([...first.page, ...second.page, ...third.page].map((project) => project._id)).toEqual([...matching].reverse());
    expect([first.isDone, second.isDone, third.isDone]).toEqual([false, false, true]);
    expect(first.page[0]._creationTime).toBeGreaterThan(second.page[0]._creationTime);
    expect(third.page[0]).not.toHaveProperty("city");
  });

  test("legacy city and unfiltered publication indexes still return legacy and mixed records", async () => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    const legacy = await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { publishedAt: 10 })));
    const mixed = await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { ...geography, publishedAt: 20 })));
    const privateId = await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { visibility: "invite_only", publishedAt: 30 })));
    const otherCity = await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { city: "agadir", publishedAt: 40 })));

    const byCity = await t.query((ctx) => ctx.db.query("projects")
      .withIndex("by_status_and_city", (q) => q.eq("status", "published").eq("city", "rabat")).take(10));
    expect(byCity.map((project) => project._id)).toEqual([legacy, mixed, privateId]);
    const readCityPage = (cursor: string | null) => t.query((ctx) => ctx.db.query("projects")
      .withIndex("by_status_visibility_city_publishedAt", (q) => q.eq("status", "published").eq("visibility", "marketplace").eq("city", "rabat"))
      .order("desc").paginate({ numItems: 1, cursor }));
    const first = await readCityPage(null);
    const second = await readCityPage(first.continueCursor);
    expect([...first.page, ...second.page].map((project) => project._id)).toEqual([mixed, legacy]);
    expect(second.isDone).toBe(true);
    const allAreas = await t.query((ctx) => ctx.db.query("projects")
      .withIndex("by_status_visibility_publishedAt", (q) => q.eq("status", "published").eq("visibility", "marketplace"))
      .order("desc").take(10));
    expect(allAreas.map((project) => project._id)).toEqual([otherCity, mixed, legacy]);
  });

  test("search_marketplace retains its legacy budget filter and stored budget values", async () => {
    const t = convexTest(schema, modules);
    const clientId = await insertUser(t);
    const legacyBudget = { budgetRange: "under_50000" as const, budgetMin: 100, budgetMax: 200, budgetUnknown: false, marketplaceBudgetRank: 0 };
    const matching: Id<"projects">[] = [];
    for (const fields of [{}, geography]) {
      matching.push(await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { ...fields, ...legacyBudget }))));
    }
    for (const fields of [
      {},
      { budgetRange: "50000_100000" as const },
      { ...legacyBudget, visibility: "invite_only" as const },
    ]) {
      await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, fields)));
    }
    const results = await t.query((ctx) => ctx.db.query("projects")
      .withSearchIndex("search_marketplace", (q) => q.search("marketplaceSearchText", "renovation")
        .eq("status", "published").eq("visibility", "marketplace").eq("city", "rabat").eq("budgetRange", "under_50000"))
      .take(10));
    expect(new Set(results.map((project) => project._id))).toEqual(new Set(matching));
    for (const project of results) expect(project).toMatchObject(legacyBudget);
  });
});

test("geographic storage and current projections preserve general location, privacy and invite-only access", async () => {
  const t = convexTest(schema, modules);
  const clientId = await insertUser(t);
  const companyUserId = await insertUser(t, "company");
  await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Atlas Build", city: "rabat", description: "Construction company profile.",
      onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("companyMembers", { companyId, userId: companyUserId, role: "owner", status: "active", createdAt: 1 });
  });
  const legacy = await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { publishedAt: 10 })));
  const mixed = await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { ...geography, publishedAt: 20 })));
  const privateId = await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { ...geography, visibility: "invite_only", publishedAt: 30 })));
  const noCity = await t.run((ctx) => ctx.db.insert("projects", publishedProject(clientId, { ...geography, city: undefined, publishedAt: 40 })));
  const publicList = await t.query(api.projects.index.listPublicProjects, {});
  const publicDetail = await t.query(api.projects.index.getPublicProject, { projectId: mixed });
  const args = { paginationOpts: { numItems: 10, cursor: null }, city: "rabat" as const };
  const caller = asUser(t, companyUserId);
  const companyList = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, args);
  const companyDetail = await caller.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: mixed });

  expect(publicList.map((project) => project.id)).toEqual([noCity, mixed, legacy]);
  expect(companyList.page.map((project) => project.id)).toEqual([mixed, legacy]);
  expect(publicDetail).toMatchObject({ city: "rabat" });
  expect(companyDetail).toMatchObject({ city: "rabat", location: {
    regionCode: geography.regionCode, provinceCode: geography.provinceCode, communeName: geography.communeName, legacyCity: "rabat",
  } });
  for (const dto of [...publicList, publicDetail, ...companyList.page, companyDetail]) {
    for (const field of ["localityName", "neighborhood"]) {
      expect(dto).not.toHaveProperty(field);
      expect(dto?.location).not.toHaveProperty(field);
    }
  }
  expect(await t.query(api.projects.index.getPublicProject, { projectId: privateId })).toBeNull();
  expect(await t.query(api.projects.index.getPublicProject, { projectId: noCity })).toMatchObject({ city: null });
  await expect(t.query(api.projects.marketplace.listCompanyMarketplaceProjects, args)).rejects.toThrow("NOT_AUTHENTICATED");
  await expect(asUser(t, clientId).query(api.projects.marketplace.listCompanyMarketplaceProjects, args)).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
  const stored = await t.run((ctx) => ctx.db.get("projects", mixed));
  expect(stored).toMatchObject(geography);
  expect(stored?.marketplaceSearchText).not.toContain(geography.communeName.trim().toLowerCase());
  expect(stored?.marketplaceSearchText).not.toContain(geography.localityName.toLowerCase());
});
