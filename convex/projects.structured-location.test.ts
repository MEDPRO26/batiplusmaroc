/// <reference types="vite/client" />

import type { FunctionArgs, WithoutSystemFields } from "convex/server";
import { ConvexError } from "convex/values";
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import reference from "../lib/geography/fixtures/hcp-rgph-2024.json";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { buildProjectMarketplaceSearchText } from "./projects/marketplaceSearch";
import type { StructuredProjectLocationInput } from "./projects/locationValidation";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
type SaveArgs = FunctionArgs<typeof api.projects.index.saveStructuredLocation>;
type Role = NonNullable<Doc<"users">["accountType"]>;
const empty: StructuredProjectLocationInput = {
  regionCode: null,
  provinceCode: null,
  communeName: null,
  localityName: null,
};
const location = {
  regionCode: "05",
  provinceCode: "05.081",
  communeName: "Aït Tamlil — آيت تامليل",
  localityName: "PRIVATE_DOUAR_AFTER_SAVE_ⵜⴰⵎⵍⵉⵍ",
};
const neighborhood = "PRIVATE_LEGACY_NEIGHBORHOOD";
const fields = [
  "regionCode",
  "provinceCode",
  "communeName",
  "localityName",
] as const;

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}
async function user(
  t: Backend,
  accountType: Role,
  onboardingStatus: "pending" | "completed" = "completed",
) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      accountType,
      onboardingStatus,
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}
async function company(t: Backend, role: "owner" | "staff" = "owner") {
  const userId = await user(t, "company");
  const companyId = await t.run((ctx) =>
    ctx.db.insert("companies", {
      name: "Construction Company",
      onboardingStatus: "completed",
      verificationStatus: "verified",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("companyMembers", {
      userId,
      companyId,
      role,
      status: "active",
      createdAt: 1,
    }),
  );
  return { userId, companyId };
}
async function setup(
  overrides: Partial<WithoutSystemFields<Doc<"projects">>> = {},
) {
  const t = convexTest(schema, modules);
  const ownerId = await user(t, "client");
  const owner = asUser(t, ownerId);
  const { projectId } = await owner.mutation(
    api.projects.index.initializeDraft,
    {},
  );
  if (Object.keys(overrides).length)
    await t.run((ctx) => ctx.db.patch(projectId, overrides));
  return { t, ownerId, owner, projectId };
}
type State = Awaited<ReturnType<typeof setup>>;
async function savedProject(state: State) {
  const project = await state.t.run((ctx) =>
    ctx.db.get("projects", state.projectId),
  );
  if (!project) throw new Error("Missing test Project");
  return project;
}
async function save(
  state: State,
  input: StructuredProjectLocationInput = location,
) {
  return await state.owner.mutation(api.projects.index.saveStructuredLocation, {
    projectId: state.projectId,
    ...input,
  });
}
async function expectAtomicRejection(
  state: State,
  input: StructuredProjectLocationInput,
  errorCode: string,
) {
  const before = await savedProject(state);
  await expect(save(state, input)).rejects.toThrow(errorCode);
  expect(await savedProject(state)).toEqual(before);
}
function expectGeneral(dto: unknown) {
  const serialized = JSON.stringify(dto);
  for (const sensitive of [
    location.localityName,
    neighborhood,
    '"localityName"',
    '"neighborhood"',
    '"siteAddress"',
  ]) {
    expect(serialized).not.toContain(sensitive);
  }
}

describe("GEO4.1 authoritative administrative writes", () => {
  // Use the independent HCP workbook fixture, not values derived from the mutation's catalogue.
  test.each(reference.provinces)(
    "saves authoritative $kind $regionCode / $code without fabricating a city",
    async (area) => {
      const state = await setup();
      await expect(
        save(state, {
          ...empty,
          regionCode: area.regionCode,
          provinceCode: area.code,
        }),
      ).resolves.toBeNull();
      const project = await savedProject(state);
      expect(project).toMatchObject({
        regionCode: area.regionCode,
        provinceCode: area.code,
        countryCode: "MA",
        status: "draft",
      });
      expect(project).not.toHaveProperty("city");
      expect(project).not.toHaveProperty("neighborhood");
    },
  );

  test.each(reference.regions)(
    "accepts incomplete region-only draft $code",
    async (region) => {
      const state = await setup();
      await save(state, { ...empty, regionCode: region.code });
      expect(await savedProject(state)).toMatchObject({
        regionCode: region.code,
      });
      expect(await savedProject(state)).not.toHaveProperty("provinceCode");
    },
  );

  test.each([
    "99",
    "",
    " ",
    "5",
    "05 ",
    " 05",
    "05\n",
    "٠٥",
    "Béni Mellal-Khénifra",
    "__proto__",
    "constructor",
  ])(
    "rejects unknown or noncanonical region %j atomically",
    async (regionCode) => {
      const state = await setup(location);
      await expectAtomicRejection(
        state,
        { ...location, regionCode },
        "INVALID_PROJECT_REGION",
      );
    },
  );
  test.each([
    "05.999",
    "99.999",
    "",
    " ",
    "05081",
    "5.081",
    "05.81",
    "05.081 ",
    "05.081\n",
    "Azilal",
    "__proto__",
  ])(
    "rejects unknown or noncanonical province %j atomically",
    async (provinceCode) => {
      const state = await setup(location);
      await expectAtomicRejection(
        state,
        { ...location, provinceCode },
        "INVALID_PROJECT_PROVINCE",
      );
    },
  );
  test("rejects a valid province assigned to another region without changing any snapshot field", async () => {
    const state = await setup(location);
    await expectAtomicRejection(
      state,
      {
        regionCode: "01",
        provinceCode: "05.081",
        communeName: "Changed commune",
        localityName: "Changed locality",
      },
      "PROJECT_PROVINCE_REGION_MISMATCH",
    );
  });
  test("rejects a province without a region instead of inferring its parent", async () => {
    const state = await setup(location);
    await expectAtomicRejection(
      state,
      { ...empty, provinceCode: "05.081" },
      "PROJECT_REGION_REQUIRED",
    );
  });
});

describe("GEO4.1 complete snapshots and text", () => {
  test.each([
    { name: "no geography", input: empty },
    { name: "region only", input: { ...empty, regionCode: "05" } },
    {
      name: "administrative pair",
      input: { ...empty, regionCode: "05", provinceCode: "05.081" },
    },
    {
      name: "pair and commune",
      input: {
        ...empty,
        regionCode: "05",
        provinceCode: "05.081",
        communeName: "Aït Tamlil",
      },
    },
    {
      name: "pair and locality",
      input: {
        ...empty,
        regionCode: "05",
        provinceCode: "05.081",
        localityName: "Douar Tamlil",
      },
    },
    { name: "full geography", input: location },
    {
      name: "text before administrative selection",
      input: {
        ...empty,
        communeName: "جماعة آيت تامليل",
        localityName: "ⴰⵢⵜ ⵜⴰⵎⵍⵉⵍ",
      },
    },
  ])(
    "saves $name as a draft without requiring commune or locality",
    async ({ input }) => {
      const state = await setup();
      await save(state, input);
      const project = await savedProject(state);
      for (const field of fields) {
        if (input[field] === null) expect(project).not.toHaveProperty(field);
        else expect(project[field]).toBe(input[field]);
      }
      expect(project).toMatchObject({ status: "draft", lastCompletedStep: 0 });
    },
  );

  test.each([
    ["  Aït\u00a0\u00a0Tamlil\t—\nآيت تامليل  ", "Aït Tamlil — آيت تامليل"],
    [" \r\nⴰⵢⵜ   ⵜⴰⵎⵍⵉⵍ \t", "ⴰⵢⵜ ⵜⴰⵎⵍⵉⵍ"],
    [" Be\u0301ni Mellal ", "Be\u0301ni Mellal"],
    [" آيت\u200cتامليل ", "آيت\u200cتامليل"],
  ])(
    "normalizes whitespace while preserving place spelling %j",
    async (raw, normalized) => {
      const state = await setup();
      await save(state, { ...empty, communeName: raw, localityName: raw });
      expect(await savedProject(state)).toMatchObject({
        communeName: normalized,
        localityName: normalized,
      });
    },
  );

  test("null and blank text remove optional fields rather than persisting null or an empty string", async () => {
    const state = await setup({ ...location, city: "agadir", neighborhood });
    await save(state, {
      ...location,
      communeName: " \t\n\u00a0",
      localityName: "",
    });
    let project = await savedProject(state);
    expect(project).not.toHaveProperty("communeName");
    expect(project).not.toHaveProperty("localityName");
    await save(state, empty);
    project = await savedProject(state);
    for (const field of fields) expect(project).not.toHaveProperty(field);
    expect(project).toMatchObject({
      city: "agadir",
      neighborhood,
      countryCode: "MA",
    });
  });

  test("changing administrative area replaces explicitly cleared province, commune and locality", async () => {
    const state = await setup(location);
    await save(state, { ...empty, regionCode: "01" });
    const regionalDraft = await savedProject(state);
    expect(regionalDraft.regionCode).toBe("01");
    for (const field of [
      "provinceCode",
      "communeName",
      "localityName",
    ] as const)
      expect(regionalDraft).not.toHaveProperty(field);
    await save(state, {
      ...empty,
      regionCode: "01",
      provinceCode: "01.511",
      localityName: "Tanger",
    });
    expect(await savedProject(state)).toMatchObject({
      regionCode: "01",
      provinceCode: "01.511",
      localityName: "Tanger",
    });
    expect(await savedProject(state)).not.toHaveProperty("communeName");
  });

  test.each(fields)(
    "requires an explicit %s key and rejects partial-merge callers atomically",
    async (omitted) => {
      const state = await setup(location);
      const before = await savedProject(state);
      const input: Partial<SaveArgs> = {
        projectId: state.projectId,
        ...location,
      };
      delete input[omitted];
      await expect(
        state.owner.mutation(
          api.projects.index.saveStructuredLocation,
          input as SaveArgs,
        ),
      ).rejects.toThrow();
      expect(await savedProject(state)).toEqual(before);
    },
  );
  test.each(fields)(
    "rejects non-string/non-null %s arguments through Convex validators",
    async (field) => {
      const state = await setup(location);
      const before = await savedProject(state);
      const input = {
        projectId: state.projectId,
        ...location,
        [field]: 5,
      } as unknown as SaveArgs;
      await expect(
        state.owner.mutation(api.projects.index.saveStructuredLocation, input),
      ).rejects.toThrow();
      expect(await savedProject(state)).toEqual(before);
    },
  );

  test.each(["communeName", "localityName"] as const)(
    "enforces the normalized 100 UTF-16-unit bound for %s",
    async (field) => {
      const state = await setup(location);
      await save(state, { ...location, [field]: `  ${"é".repeat(100)} \n` });
      expect((await savedProject(state))[field]).toBe("é".repeat(100));
      await expectAtomicRejection(
        state,
        { ...location, [field]: "é".repeat(101) },
        field === "communeName"
          ? "INVALID_PROJECT_COMMUNE"
          : "INVALID_PROJECT_LOCALITY",
      );
      await save(state, { ...location, [field]: "𞸀".repeat(50) });
      expect((await savedProject(state))[field]).toBe("𞸀".repeat(50));
      await expectAtomicRejection(
        state,
        { ...location, [field]: "𞸀".repeat(51) },
        field === "communeName"
          ? "INVALID_PROJECT_COMMUNE"
          : "INVALID_PROJECT_LOCALITY",
      );
    },
  );
  test.each([
    "\u0000",
    "\u0008",
    "\u000b",
    "\u000c",
    "\u001b",
    "\u007f",
    "\u0085",
    "\u009f",
    "\u202a",
    "\u202e",
    "\u2066",
    "\u2069",
  ])(
    "rejects unsafe control %j in either field before writing",
    async (control) => {
      const state = await setup(location);
      for (const field of ["communeName", "localityName"] as const) {
        await expectAtomicRejection(
          state,
          { ...location, [field]: `Place${control}name` },
          field === "communeName"
            ? "INVALID_PROJECT_COMMUNE"
            : "INVALID_PROJECT_LOCALITY",
        );
      }
    },
  );
  test("validation errors contain only static codes, without raw geography or private locality", async () => {
    const state = await setup(location);
    const invalid = {
      ...location,
      communeName: "PRIVATE_COMMUNE\u0000",
      localityName: "PRIVATE_LOCALITY\u0000",
    };
    const failure: unknown = await save(state, invalid).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ConvexError);
    expect((failure as ConvexError<string>).data).toBe(
      "INVALID_PROJECT_COMMUNE",
    );
    expect(String(failure)).not.toContain("PRIVATE_");
    expect(await savedProject(state)).toMatchObject(location);
  });
});

describe("GEO4.1 legacy behavior and bounded effects", () => {
  test.each(["draft", "needs_changes"] as const)(
    "preserves legacy and unrelated fields during an editable %s save",
    async (status) => {
      const state = await setup({
        status,
        city: "agadir",
        neighborhood,
        primaryCategory: "renovation",
        title: "Historical title",
        description: "Historical project description",
        propertyType: "house",
        surface: 90,
        surfaceUnknown: false,
        timeline: "flexible",
        visibility: "invite_only",
        lastCompletedStep: 6,
        marketplaceSearchText: "existing safe search text",
      });
      const before = await savedProject(state);
      await save(state);
      expect(await savedProject(state)).toEqual({
        ...before,
        ...location,
        updatedAt: expect.any(Number),
      });
    },
  );
  test("legacy saveLocation still updates its own fields/progression without changing structured geography", async () => {
    const state = await setup({ ...location, lastCompletedStep: 1 });
    await state.owner.mutation(api.projects.index.saveLocation, {
      projectId: state.projectId,
      city: "rabat",
      neighborhood: "  Agdal\n Centre  ",
    });
    expect(await savedProject(state)).toMatchObject({
      ...location,
      city: "rabat",
      neighborhood: "Agdal Centre",
      lastCompletedStep: 2,
    });
    await state.owner.mutation(api.projects.index.saveLocation, {
      projectId: state.projectId,
      city: "agadir",
    });
    expect(await savedProject(state)).toMatchObject({
      ...location,
      city: "agadir",
      lastCompletedStep: 2,
    });
    expect(await savedProject(state)).not.toHaveProperty("neighborhood");
    const before = await savedProject(state);
    await expect(
      state.owner.mutation(api.projects.index.saveLocation, {
        projectId: state.projectId,
        city: "agadir",
        neighborhood: "x".repeat(101),
      }),
    ).rejects.toThrow("INVALID_PROJECT_NEIGHBORHOOD");
    expect(await savedProject(state)).toEqual(before);
    await save(state, { ...empty, regionCode: "01", provinceCode: "01.511" });
    expect(await savedProject(state)).toMatchObject({
      city: "agadir",
      lastCompletedStep: 2,
      regionCode: "01",
      provinceCode: "01.511",
    });
  });
  test("structured-only saving leaves the current city-based wizard resume and publication gates intact", async () => {
    const state = await setup({
      primaryCategory: "renovation",
      title: "Safe rural renovation",
      propertyType: "house",
      description: "A sufficiently detailed general renovation description.",
      surfaceUnknown: true,
      timeline: "flexible",
      lastCompletedStep: 6,
    });
    await save(state);
    const wizard = await state.owner.query(api.projects.index.getWizard, {
      projectId: state.projectId,
    });
    expect(wizard.draft).toMatchObject({
      city: null,
      location: { ...location, legacyCity: null, neighborhood: null },
      resumeStep: 2,
    });
    expect((await savedProject(state)).lastCompletedStep).toBe(6);
    await expect(
      state.owner.mutation(api.projects.index.publishProject, {
        projectId: state.projectId,
      }),
    ).rejects.toThrow("PROJECT_INCOMPLETE");
    expect((await savedProject(state)).status).toBe("draft");
  });
  test("repeated snapshots preserve the same Project and create no history, notifications or extra activity", async () => {
    const state = await setup({
      city: "rabat",
      neighborhood,
      lastCompletedStep: 3,
    });
    const before = await savedProject(state);
    const activityBefore = await state.t.run((ctx) =>
      ctx.db
        .query("marketplaceActivity")
        .withIndex("by_projectId_and_createdAt", (q) =>
          q.eq("projectId", state.projectId),
        )
        .take(10),
    );
    for (let retry = 0; retry < 3; retry++) await save(state);
    const after = await savedProject(state);
    expect(after).toEqual({
      ...before,
      ...location,
      updatedAt: expect.any(Number),
    });
    const sideEffects = await state.t.run(async (ctx) => ({
      projects: await ctx.db
        .query("projects")
        .withIndex("by_clientId", (q) => q.eq("clientId", state.ownerId))
        .take(10),
      history: await ctx.db
        .query("projectStatusHistory")
        .withIndex("by_projectId", (q) => q.eq("projectId", state.projectId))
        .take(10),
      activity: await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_projectId_and_createdAt", (q) =>
          q.eq("projectId", state.projectId),
        )
        .take(10),
      notifications: await ctx.db.query("notifications").take(10),
    }));
    expect(sideEffects.projects.map((project) => project._id)).toEqual([
      state.projectId,
    ]);
    expect(sideEffects.history).toEqual([]);
    expect(sideEffects.activity).toEqual(activityBefore);
    expect(sideEffects.notifications).toEqual([]);
  });
});

describe("GEO4.1 owning Client authorization", () => {
  test.each([
    "other Client",
    "Company owner",
    "Company staff",
    "SEO user",
    "Admin",
    "anonymous",
    "pending Client",
  ] as const)("denies %s with no mutation effects", async (audience) => {
    const state = await setup(location);
    const before = await savedProject(state);
    let caller: Pick<Backend, "mutation"> = state.t;
    let errorCode = "NOT_AUTHENTICATED";
    if (audience !== "anonymous") {
      let userId: Id<"users">;
      if (audience === "Company owner" || audience === "Company staff") {
        userId = (
          await company(
            state.t,
            audience === "Company owner" ? "owner" : "staff",
          )
        ).userId;
      } else {
        userId = await user(
          state.t,
          audience === "Admin"
            ? "admin"
            : audience === "SEO user"
              ? "seo_team"
              : "client",
          audience === "pending Client" ? "pending" : "completed",
        );
      }
      caller = asUser(state.t, userId);
      errorCode =
        audience === "other Client"
          ? "PROJECT_NOT_FOUND"
          : audience === "pending Client"
            ? "CLIENT_ONBOARDING_REQUIRED"
            : "CLIENT_ACCOUNT_REQUIRED";
    }
    await expect(
      caller.mutation(api.projects.index.saveStructuredLocation, {
        projectId: state.projectId,
        ...empty,
      }),
    ).rejects.toThrow(errorCode);
    expect(await savedProject(state)).toEqual(before);
  });
  test.each([
    "pending_review",
    "published",
    "in_discussion",
    "company_selected",
    "in_progress",
    "completed",
    "cancelled",
    "archived",
  ] as const)(
    "denies editing in %s without reopening the Project",
    async (status) => {
      const state = await setup({ ...location, status });
      await expectAtomicRejection(state, empty, "PROJECT_NOT_EDITABLE");
    },
  );
  test("rechecks current ownership and stored role on subsequent saves", async () => {
    const state = await setup();
    await save(state);
    const otherId = await user(state.t, "client");
    await state.t.run((ctx) =>
      ctx.db.patch(state.projectId, { clientId: otherId }),
    );
    await expectAtomicRejection(state, empty, "PROJECT_NOT_FOUND");
    await state.t.run(async (ctx) => {
      await ctx.db.patch(state.projectId, { clientId: state.ownerId });
      await ctx.db.patch(state.ownerId, { accountType: "admin" });
    });
    await expectAtomicRejection(state, empty, "CLIENT_ACCOUNT_REQUIRED");
  });
  test("deleted Project IDs remain not found", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.delete(state.projectId));
    await expect(save(state)).rejects.toThrow("PROJECT_NOT_FOUND");
  });
});

test("real structured saves retain GEO3 audience privacy, search exclusion and mutual-interest authorization", async () => {
  const state = await setup({
    neighborhood,
    primaryCategory: "renovation",
    title: "Safe rural renovation",
    propertyType: "house",
    description: "A sufficiently detailed general renovation description.",
    surfaceUnknown: true,
    timeline: "flexible",
  });
  await save(state);
  const adminId = await user(state.t, "admin");
  const member = await company(state.t);
  const other = await company(state.t);
  const expected = { ...location, legacyCity: null, neighborhood };
  expect(
    await state.owner.query(api.projects.index.getMyProject, {
      projectId: state.projectId,
    }),
  ).toMatchObject({ location: expected });
  expect(
    await asUser(state.t, adminId).query(api.admin.projects.getProjectReview, {
      projectId: state.projectId,
    }),
  ).toMatchObject({ location: expected });
  // Fixture publication only: GEO4.1 deliberately cannot submit a no-city Project yet.
  await state.t.run(async (ctx) => {
    const project = await ctx.db.get(state.projectId);
    if (!project) throw new Error("Missing test Project");
    await ctx.db.patch(state.projectId, {
      status: "published",
      publishedAt: 1,
      marketplaceSearchText: buildProjectMarketplaceSearchText(project),
    });
  });
  const args = { paginationOpts: { numItems: 10, cursor: null } };
  for (const dto of [
    await state.t.query(api.projects.index.getPublicProject, {
      projectId: state.projectId,
    }),
    await state.t.query(api.projects.index.listPublicProjects, {}),
    await asUser(state.t, member.userId).query(
      api.projects.marketplace.getCompanyMarketplaceProject,
      { projectId: state.projectId },
    ),
    await asUser(state.t, member.userId).query(
      api.projects.marketplace.listCompanyMarketplaceProjects,
      args,
    ),
  ])
    expectGeneral(dto);
  expect((await savedProject(state)).marketplaceSearchText).not.toContain(
    location.localityName.toLowerCase(),
  );
  expect(
    (
      await asUser(state.t, member.userId).query(
        api.projects.marketplace.listCompanyMarketplaceProjects,
        { ...args, search: location.localityName },
      )
    ).page,
  ).toEqual([]);
  const quoteId = await state.t.run((ctx) =>
    ctx.db.insert("projectQuotes", {
      projectId: state.projectId,
      companyId: member.companyId,
      submittedByUserId: member.userId,
      message: "A submitted initial proposal.",
      estimatedPrice: 100_000,
      currency: "MAD",
      estimatedDuration: 30,
      availableStartDate: "2099-01-01",
      scope: "Renovation work",
      quoteType: "initial",
      status: "submitted",
      createdAt: 1,
      updatedAt: 1,
      submittedAt: 1,
    }),
  );
  expectGeneral(
    await asUser(state.t, member.userId).query(
      api.projects.marketplace.getCompanyMarketplaceProject,
      { projectId: state.projectId },
    ),
  );
  await state.owner.mutation(api.quotes.index.reviewInitialQuote, {
    quoteId,
    action: "open_discussion",
  });
  expect(
    await asUser(state.t, member.userId).query(
      api.projects.marketplace.getCompanyMarketplaceProject,
      { projectId: state.projectId },
    ),
  ).toMatchObject({ location: expected });
  expectGeneral(
    await asUser(state.t, other.userId).query(
      api.projects.marketplace.getCompanyMarketplaceProject,
      { projectId: state.projectId },
    ),
  );
  expectGeneral(
    await state.t.query(api.projects.index.getPublicProject, {
      projectId: state.projectId,
    }),
  );
  expectGeneral(
    await asUser(state.t, member.userId).query(
      api.projects.marketplace.listCompanyMarketplaceProjects,
      args,
    ),
  );
});
