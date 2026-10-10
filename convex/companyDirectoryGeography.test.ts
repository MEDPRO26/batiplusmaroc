/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildCompanyDirectorySearchText } from "./companies/directory";
import { compareCompaniesByDirectoryOrder } from "../lib/geography/directory-coverage";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
type Service = "renovation" | "plumbing";
type Sort = "relevance" | "newest" | "oldest";

type SeedOptions = {
  name: string;
  slug: string;
  city?: string;
  service?: Service;
  serviceAreas?: Array<"agadir" | "casablanca" | "rabat">;
  verificationStatus?: "draft" | "verified";
  operationalStatus?: "normal" | "suspended" | null;
  directoryListed?: boolean;
  description?: string | null;
  coverage?: string[];
  indexKeys?: string[];
  omitEligibility?: boolean;
  omitSearchText?: boolean;
};

async function seedCompany(t: Backend, options: SeedOptions) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const city = options.city ?? "Agadir";
    const service = options.service ?? "renovation";
    const serviceAreas = options.serviceAreas ?? ["agadir"];
    const userId = await ctx.db.insert("users", {
      email: `${options.slug}@directory-geo.test`,
      accountType: "company",
      onboardingStatus: "completed",
      createdAt: now,
      updatedAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: options.name,
      legalName: "PRIVATE-LEGAL-NAME",
      slug: options.slug,
      phone: "0612345678",
      city,
      description:
        options.description === null
          ? undefined
          : (options.description ??
            `${options.name} completes residential construction work.`),
      serviceAreas,
      directorySearchText: options.omitSearchText ? undefined : buildCompanyDirectorySearchText({
        name: options.name,
        city,
        services: [service],
        serviceAreas,
      }),
      onboardingStatus: "completed",
      verificationStatus: options.verificationStatus ?? "draft",
      ...(options.omitEligibility
        ? {}
        : {
            operationalStatus:
              options.operationalStatus === null
                ? undefined
                : (options.operationalStatus ?? "normal"),
            directoryListed:
              options.directoryListed ??
              options.operationalStatus !== "suspended",
          }),
      ...(options.coverage === undefined
        ? {}
        : { coverageScopeKeys: options.coverage }),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("companyMembers", {
      companyId,
      userId,
      role: "owner",
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("companyServices", {
      companyId,
      service,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("companyVerifications", {
      companyId,
      legalName: "PRIVATE-LEGAL-NAME",
      ice: "001122334455667",
      rcNumber: "PRIVATE-RC",
      legalRepresentative: "PRIVATE-REPRESENTATIVE",
      phone: "0600000000",
      address: "PRIVATE-ADDRESS",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    for (const areaKey of options.indexKeys ?? options.coverage ?? []) {
      await ctx.db.insert("companyCoverageIndex", { companyId, areaKey });
    }
    return { companyId, userId };
  });
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}

function list(
  t: Backend,
  args: {
    search?: string;
    city?: string;
    service?: Service;
    verifiedOnly?: boolean;
    sort?: Sort;
    regionCode?: string;
    provinceCode?: string;
    cursor?: string | null;
    endCursor?: string;
    maximumRowsRead?: number;
    numItems?: number;
  } = {},
) {
  return t.query(api.companies.directory.listPublicCompanies, {
    paginationOpts: {
      numItems: args.numItems ?? 20,
      cursor: args.cursor ?? null,
      ...(args.endCursor === undefined ? {} : { endCursor: args.endCursor }),
      ...(args.maximumRowsRead === undefined ? {} : { maximumRowsRead: args.maximumRowsRead }),
    },
    search: args.search,
    city: args.city,
    service: args.service,
    verifiedOnly: args.verifiedOnly ?? false,
    sort: args.sort ?? "newest",
    regionCode: args.regionCode,
    provinceCode: args.provinceCode,
  });
}

async function collect(t: Backend, args: Parameters<typeof list>[1]) {
  const rows = [];
  let cursor = args?.cursor ?? null;
  for (let guard = 0; guard < 400; guard += 1) {
    const page = await list(t, { ...args, cursor });
    rows.push(...page.page);
    if (page.isDone) return rows;
    cursor = page.continueCursor;
  }
  throw new Error("directory pagination did not finish");
}

describe("public company directory geographic discovery", () => {
  test("matches explicit coverage without treating headquarters or legacy areas as coverage", async () => {
    const t = convexTest(schema, modules);
    const national = await seedCompany(t, {
      name: "Atlas National",
      slug: "atlas-national",
      city: "Casablanca",
      serviceAreas: ["casablanca"],
      verificationStatus: "verified",
      coverage: ["MA"],
    });
    await seedCompany(t, {
      name: "Atlas Regional",
      slug: "atlas-regional",
      coverage: ["R:09"],
    });
    const taroudannt = await seedCompany(t, {
      name: "Taroudannt Only",
      slug: "taroudannt-only",
      city: "Taroudannt",
      coverage: ["P:09.541"],
    });
    await seedCompany(t, {
      name: "Agadir Prefecture",
      slug: "agadir-prefecture",
      coverage: ["P:09.001"],
    });
    await seedCompany(t, {
      name: "Overlap Builder",
      slug: "overlap-builder",
      coverage: ["MA", "R:09", "P:09.541"],
    });
    const legacy = await seedCompany(t, {
      name: "Legacy Regional",
      slug: "legacy-regional",
      coverage: ["R:09"],
      omitEligibility: true,
    });
    const plain = await seedCompany(t, {
      name: "Plain Eligible",
      slug: "plain-eligible",
      city: "Casablanca",
      serviceAreas: ["casablanca"],
    });
    await seedCompany(t, {
      name: "Tanger Only",
      slug: "tanger-only",
      coverage: ["P:01.511"],
    });
    const headquarters = await seedCompany(t, {
      name: "Headquarters Only",
      slug: "headquarters-only",
      city: "Taroudannt",
      serviceAreas: ["agadir"],
    });
    await seedCompany(t, {
      name: "Atlas Plumbing",
      slug: "atlas-plumbing",
      service: "plumbing",
      coverage: ["R:09"],
    });
    await seedCompany(t, {
      name: "Suspended National",
      slug: "suspended-national",
      operationalStatus: "suspended",
      coverage: ["MA"],
    });
    await seedCompany(t, {
      name: "Unlisted National",
      slug: "unlisted-national",
      directoryListed: false,
      coverage: ["MA"],
    });
    await seedCompany(t, {
      name: "Incomplete National",
      slug: "incomplete-national",
      description: null,
      coverage: ["MA"],
    });
    const malformed = await seedCompany(t, {
      name: "Malformed Coverage",
      slug: "malformed-coverage",
      coverage: ["MA", "NOT-A-SCOPE"],
      indexKeys: ["MA"],
    });
    const stale = await seedCompany(t, {
      name: "Stale Index",
      slug: "stale-index",
      indexKeys: ["P:09.541"],
    });
    const keysOnly = await seedCompany(t, {
      name: "Keys Without Index",
      slug: "keys-without-index",
      coverage: ["R:09"],
      indexKeys: [],
    });

    const all = await collect(t, { sort: "newest", numItems: 5 });
    const allSlugs = all.map((company) => company.slug);
    expect(allSlugs).toEqual([
      "keys-without-index",
      "stale-index",
      "malformed-coverage",
      "atlas-plumbing",
      "headquarters-only",
      "tanger-only",
      "plain-eligible",
      "legacy-regional",
      "overlap-builder",
      "agadir-prefecture",
      "taroudannt-only",
      "atlas-regional",
      "atlas-national",
    ]);
    expect(allSlugs).not.toContain("suspended-national");
    expect(allSlugs).not.toContain("unlisted-national");
    expect(allSlugs).not.toContain("incomplete-national");

    const regionSlugs = [
      "keys-without-index",
      "legacy-regional",
      "overlap-builder",
      "agadir-prefecture",
      "taroudannt-only",
      "atlas-regional",
      "atlas-plumbing",
      "atlas-national",
    ];
    const regionPage = await collect(t, {
      regionCode: "09",
      sort: "newest",
      numItems: 2,
    });
    expect(regionPage.map((company) => company.slug)).toEqual(
      all
        .filter((company) => new Set(regionSlugs).has(company.slug))
        .map((company) => company.slug),
    );
    for (const slug of [
      "plain-eligible",
      "tanger-only",
      "headquarters-only",
      "malformed-coverage",
      "stale-index",
      "suspended-national",
    ]) {
      expect(regionPage.map((company) => company.slug)).not.toContain(slug);
    }
    expect(
      regionPage.find((company) => company.slug === "taroudannt-only")
        ?.coverageScopeKeys,
    ).toEqual(["P:09.541"]);
    expect(
      regionPage.find((company) => company.slug === "overlap-builder")
        ?.coverageScopeKeys,
    ).toEqual(["MA", "R:09", "P:09.541"]);
    expect(new Set(regionPage.map((company) => company.id)).size).toBe(
      regionPage.length,
    );

    const province = await collect(t, {
      regionCode: "09",
      provinceCode: "09.541",
      sort: "newest",
      numItems: 2,
    });
    expect(province.map((company) => company.slug)).toEqual([
      "keys-without-index",
      "atlas-plumbing",
      "legacy-regional",
      "overlap-builder",
      "taroudannt-only",
      "atlas-regional",
      "atlas-national",
    ]);
    expect(province.map((company) => company.slug)).not.toContain(
      "agadir-prefecture",
    );
    expect(province.map((company) => company.slug)).not.toContain(
      "tanger-only",
    );

    const oldest = await collect(t, {
      regionCode: "09",
      sort: "oldest",
      numItems: 3,
    });
    expect(oldest.map((company) => company.id)).toEqual(
      [...regionPage].reverse().map((company) => company.id),
    );
    const relevance = await collect(t, {
      regionCode: "09",
      sort: "relevance",
      numItems: 4,
    });
    expect(relevance.map((company) => company.id)).toEqual(
      regionPage.map((company) => company.id),
    );

    expect(
      (await collect(t, { regionCode: "09", verifiedOnly: true })).map(
        (company) => company.slug,
      ),
    ).toEqual(["atlas-national"]);
    expect(
      (await collect(t, { search: "Atlas", regionCode: "09" }))
        .map((company) => company.slug)
        .sort(),
    ).toEqual(["atlas-national", "atlas-plumbing", "atlas-regional"]);
    expect(
      (await collect(t, { city: "Casablanca", regionCode: "09" })).map(
        (company) => company.slug,
      ),
    ).toEqual(["atlas-national"]);
    expect(
      (await collect(t, { city: "Casablanca" }))
        .map((company) => company.slug)
        .sort(),
    ).toEqual(["atlas-national", "plain-eligible"]);
    expect(
      (await collect(t, { service: "plumbing", regionCode: "09" })).map(
        (company) => company.slug,
      ),
    ).toEqual(["atlas-plumbing"]);
    expect(
      (await collect(t, { service: "renovation", regionCode: "09" })).map(
        (company) => company.slug,
      ),
    ).not.toContain("atlas-plumbing");

    const searched = await collect(t, { search: "Atlas" });
    const searchedRegion = await collect(t, {
      search: "Atlas",
      regionCode: "09",
      numItems: 1,
    });
    expect(searchedRegion.map((company) => company.id)).toEqual(
      searched
        .filter((company) =>
          company.coverageScopeKeys.some(
            (key) => key === "MA" || key === "R:09" || key.startsWith("P:09."),
          ),
        )
        .map((company) => company.id),
    );

    const first = await list(t, {
      regionCode: "09",
      numItems: 2,
      sort: "newest",
    });
    const second = await list(t, {
      regionCode: "09",
      numItems: 2,
      sort: "newest",
      cursor: first.continueCursor,
    });
    expect(first.isDone).toBe(false);
    const walked = [first, second];
    let walkCursor = second.continueCursor;
    let sawEmptyUnfinished = first.page.length === 0 || second.page.length === 0;
    for (let guard = 0; guard < 30; guard += 1) {
      const page = await list(t, {
        regionCode: "09",
        numItems: 2,
        sort: "newest",
        cursor: walkCursor,
      });
      walked.push(page);
      if (page.page.length === 0 && !page.isDone) sawEmptyUnfinished = true;
      if (page.isDone) break;
      walkCursor = page.continueCursor;
    }
    expect(sawEmptyUnfinished).toBe(true);
    expect(walked.flatMap((page) => page.page).map((company) => company.slug)).toEqual(
      regionPage.map((company) => company.slug),
    );
    expect(walked.at(-1)?.isDone).toBe(true);
    await expect(
      list(t, {
        regionCode: "09",
        numItems: 2,
        sort: "newest",
        cursor: first.continueCursor,
      }),
    ).resolves.toEqual(second);
    await expect(
      list(t, { regionCode: "01", numItems: 2, cursor: first.continueCursor }),
    ).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");
    await expect(
      list(t, {
        regionCode: "09",
        provinceCode: "09.541",
        numItems: 2,
        cursor: first.continueCursor,
      }),
    ).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");
    await expect(
      list(t, {
        regionCode: "09",
        sort: "oldest",
        numItems: 2,
        cursor: first.continueCursor,
      }),
    ).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");
    await expect(
      list(t, { numItems: 2, cursor: first.continueCursor }),
    ).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");
    const finished = await list(t, {
      regionCode: "09",
      numItems: 20,
      cursor: (await list(t, { regionCode: "09", numItems: 20 }))
        .continueCursor,
    });
    expect(finished.page).toEqual([]);
    expect(finished.isDone).toBe(true);

    const dto = regionPage.find(
      (company) => company.id === taroudannt.companyId,
    );
    expect(dto).toMatchObject({
      city: "Taroudannt",
      serviceAreas: ["agadir"],
      coverageScopeKeys: ["P:09.541"],
    });
    expect(dto).not.toHaveProperty("legalName");
    expect(dto).not.toHaveProperty("phone");
    expect(dto).not.toHaveProperty("ice");
    expect(JSON.stringify(regionPage)).not.toMatch(
      /PRIVATE-LEGAL-NAME|PRIVATE-RC|PRIVATE-ADDRESS|PRIVATE-REPRESENTATIVE/,
    );
    expect(
      all.find((company) => company.id === malformed.companyId)
        ?.coverageScopeKeys,
    ).toEqual([]);
    expect(
      all.find((company) => company.id === stale.companyId)?.coverageScopeKeys,
    ).toEqual([]);
    expect(
      all.find((company) => company.id === keysOnly.companyId)
        ?.coverageScopeKeys,
    ).toEqual(["R:09"]);
    expect(
      all.find((company) => company.id === plain.companyId)?.coverageScopeKeys,
    ).toEqual([]);
    expect(
      all.find((company) => company.id === national.companyId)
        ?.coverageScopeKeys,
    ).toEqual(["MA"]);
    expect(
      all.find((company) => company.id === legacy.companyId)?.coverageScopeKeys,
    ).toEqual(["R:09"]);
    expect(
      all.find((company) => company.id === headquarters.companyId)
        ?.coverageScopeKeys,
    ).toEqual([]);
  });

  test.each([
    [{ provinceCode: "09.541" }, "COMPANY_DIRECTORY_REGION_REQUIRED"],
    [{ regionCode: "99" }, "INVALID_COMPANY_DIRECTORY_REGION"],
    [{ regionCode: "9" }, "INVALID_COMPANY_DIRECTORY_REGION"],
    [
      { regionCode: "09", provinceCode: "09.999" },
      "INVALID_COMPANY_DIRECTORY_PROVINCE",
    ],
    [
      { regionCode: "09", provinceCode: "01.511" },
      "COMPANY_DIRECTORY_PROVINCE_REGION_MISMATCH",
    ],
  ] as const)("rejects invalid geographic arguments %j", async (args, code) => {
    const t = convexTest(schema, modules);
    await expect(list(t, args)).rejects.toThrow(code);
  });

  test("replaces discovery when the Company saves a new explicit coverage selection", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, {
      name: "Editable Coverage",
      slug: "editable-coverage",
      city: "Agadir",
      serviceAreas: ["agadir"],
    });
    const owner = asUser(t, company.userId);
    expect(
      (await collect(t, { regionCode: "09" })).map((row) => row.id),
    ).not.toContain(company.companyId);
    expect((await collect(t, {})).map((row) => row.id)).toEqual([
      company.companyId,
    ]);

    await owner.mutation(api.companies.index.updateMyGeographicCoverage, {
      coverageScopeKeys: ["P:09.541"],
    });
    expect(
      (await collect(t, { regionCode: "09" })).map(
        (row) => row.coverageScopeKeys,
      ),
    ).toEqual([["P:09.541"]]);
    expect(
      (await collect(t, { regionCode: "09", provinceCode: "09.541" })).map(
        (row) => row.id,
      ),
    ).toEqual([company.companyId]);
    expect(
      await collect(t, { regionCode: "09", provinceCode: "09.001" }),
    ).toEqual([]);

    await owner.mutation(api.companies.index.updateMyGeographicCoverage, {
      coverageScopeKeys: ["P:09.541"],
    });
    expect(
      (await collect(t, { regionCode: "09" })).map((row) => row.id),
    ).toEqual([company.companyId]);

    await owner.mutation(api.companies.index.updateMyGeographicCoverage, {
      coverageScopeKeys: ["R:01"],
    });
    expect(await collect(t, { regionCode: "09" })).toEqual([]);
    expect(
      (await collect(t, { regionCode: "01" })).map(
        (row) => row.coverageScopeKeys,
      ),
    ).toEqual([["R:01"]]);
    expect((await collect(t, {})).map((row) => row.id)).toEqual([
      company.companyId,
    ]);

    await owner.mutation(api.companies.index.updateMyGeographicCoverage, {
      coverageScopeKeys: [],
    });
    expect(await collect(t, { regionCode: "01" })).toEqual([]);
    expect((await collect(t, {})).map((row) => row.id)).toEqual([
      company.companyId,
    ]);
  });

  test("paginates rare matches across 251 companies without duplicates or a candidate cap", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 251; index += 1) {
        const coverage =
          index < 130
            ? ["MA"]
            : index === 161
              ? ["R:09"]
              : index === 162
                ? ["P:09.541"]
                : index === 163
                  ? ["P:09.001"]
                  : index === 164
                    ? ["P:01.511"]
                    : index === 165
                      ? ["R:09", "P:09.541"]
                      : undefined;
        const city = index === 250 ? "Casablanca" : "Agadir";
        const serviceAreas =
          index === 250 ? ["casablanca" as const] : ["agadir" as const];
        const name = `Geo Company ${index}`;
        const now = 1_000 + index;
        await ctx.db.insert("users", {
          email: `geo-${index}@directory-geo.test`,
          accountType: "company",
          onboardingStatus: "completed",
          createdAt: now,
          updatedAt: now,
        });
        const companyId = await ctx.db.insert("companies", {
          name,
          legalName: "PRIVATE-LEGAL-NAME",
          slug: `geo-${index}`,
          phone: "0612345678",
          city,
          description: `${name} completes residential construction work.`,
          serviceAreas,
          onboardingStatus: "completed",
          verificationStatus:
            index === 0 || index === 162 ? "verified" : "draft",
          operationalStatus: "normal",
          directoryListed: true,
          directorySearchText: buildCompanyDirectorySearchText({
            name,
            city,
            services: ["renovation"],
            serviceAreas,
          }),
          ...(coverage === undefined ? {} : { coverageScopeKeys: coverage }),
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("companyServices", {
          companyId,
          service: "renovation",
          createdAt: now,
          updatedAt: now,
        });
        for (const areaKey of coverage ?? []) {
          await ctx.db.insert("companyCoverageIndex", { companyId, areaKey });
        }
      }
    });

    const all = await collect(t, { numItems: 40, sort: "newest" });
    expect(all).toHaveLength(251);
    expect(new Set(all.map((company) => company.slug)).size).toBe(251);
    expect(all[0]?.slug).toBe("geo-250");
    expect(all.at(-1)?.slug).toBe("geo-0");
    expect(
      all.find((company) => company.slug === "geo-140")?.coverageScopeKeys,
    ).toEqual([]);
    expect(all.find((company) => company.slug === "geo-250")?.city).toBe(
      "Casablanca",
    );

    const regionIds = new Set(
      all
        .filter(
          (company) =>
            company.slug === "geo-161" ||
            company.slug === "geo-162" ||
            company.slug === "geo-163" ||
            company.slug === "geo-165" ||
            Number(company.slug.slice(4)) < 130,
        )
        .map((company) => company.id),
    );
    expect(regionIds.size).toBe(134);
    const region = await collect(t, {
      regionCode: "09",
      numItems: 7,
      sort: "newest",
    });
    expect(region.map((company) => company.id)).toEqual(
      all
        .filter((company) => regionIds.has(company.id))
        .map((company) => company.id),
    );
    expect(region.map((company) => company.slug)).toContain("geo-0");
    expect(region.map((company) => company.slug)).not.toContain("geo-164");
    expect(region.map((company) => company.slug)).not.toContain("geo-250");
    expect(
      region.find((company) => company.slug === "geo-162")?.coverageScopeKeys,
    ).toEqual(["P:09.541"]);
    expect(
      region.find((company) => company.slug === "geo-165")?.coverageScopeKeys,
    ).toEqual(["R:09", "P:09.541"]);

    const province = await collect(t, {
      regionCode: "09",
      provinceCode: "09.541",
      numItems: 7,
      sort: "oldest",
    });
    const provinceIds = new Set(
      all
        .filter(
          (company) =>
            company.slug === "geo-161" ||
            company.slug === "geo-162" ||
            company.slug === "geo-165" ||
            Number(company.slug.slice(4)) < 130,
        )
        .map((company) => company.id),
    );
    expect(provinceIds.size).toBe(133);
    const oldest = await collect(t, { numItems: 40, sort: "oldest" });
    expect(province.map((company) => company.id)).toEqual(
      oldest
        .filter((company) => provinceIds.has(company.id))
        .map((company) => company.id),
    );
    expect(province.map((company) => company.slug)).not.toContain("geo-163");

    expect(
      (
        await collect(t, { regionCode: "09", verifiedOnly: true, numItems: 5 })
      ).map((company) => company.slug),
    ).toEqual(["geo-162", "geo-0"]);

    const first = await list(t, { regionCode: "09", numItems: 7 });
    const second = await list(t, {
      regionCode: "09",
      numItems: 7,
      cursor: first.continueCursor,
    });
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    expect(second.isDone).toBe(false);
    await expect(
      list(t, { regionCode: "09", numItems: 7, cursor: first.continueCursor }),
    ).resolves.toEqual(second);
    await expect(
      list(t, {
        regionCode: "09",
        verifiedOnly: true,
        numItems: 7,
        cursor: first.continueCursor,
      }),
    ).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");

    const searched = await collect(t, { search: "geo company", numItems: 25 });
    const searchedRegion = await collect(t, {
      search: "geo company",
      regionCode: "09",
      numItems: 5,
    });
    expect(searched).toHaveLength(251);
    expect(searchedRegion.map((company) => company.id)).toEqual(
      searched
        .filter((company) => regionIds.has(company.id))
        .map((company) => company.id),
    );
    expect(
      await collect(t, { city: "Casablanca", regionCode: "09", numItems: 10 }),
    ).toEqual([]);
    expect(
      (await collect(t, { city: "Casablanca", numItems: 10 })).map(
        (company) => company.slug,
      ),
    ).toEqual(["geo-250"]);
    const bounded = await list(t, { regionCode: "09", numItems: 500 });
    expect(bounded.page.length).toBeLessThanOrEqual(500);
    expect(bounded.page.map((company) => company.id)).toEqual(region.map((company) => company.id));
    expect(bounded.isDone).toBe(true);
  }, 60_000);

  test("orders geographic results by company creation time when coverage rows are written later", async () => {
    const t = convexTest(schema, modules);
    const early = await seedCompany(t, { name: "Early Company", slug: "early-company", coverage: ["R:09"], indexKeys: [] });
    const middle = await seedCompany(t, { name: "Middle Company", slug: "middle-company", coverage: ["MA"], indexKeys: [] });
    const late = await seedCompany(t, { name: "Late Company", slug: "late-company", coverage: ["P:09.541"], indexKeys: [] });
    await t.run(async (ctx) => {
      for (const companyId of [late.companyId, middle.companyId, early.companyId]) {
        const company = await ctx.db.get(companyId);
        for (const areaKey of company?.coverageScopeKeys ?? []) {
          await ctx.db.insert("companyCoverageIndex", { companyId, areaKey });
        }
      }
    });
    const stored = await t.run(async (ctx) => ({
      companies: (await Promise.all([early.companyId, middle.companyId, late.companyId].map((companyId) => ctx.db.get(companyId))))
        .filter((company) => company !== null),
      coverageRows: await ctx.db.query("companyCoverageIndex").order("desc").take(10),
    }));
    const byCreation = [...stored.companies].sort((left, right) => compareCompaniesByDirectoryOrder(left, right, "desc"));
    const byCoverageRow = stored.coverageRows.map((row) => row.companyId);
    const newest = await collect(t, { regionCode: "09", sort: "newest", numItems: 1 });
    const oldest = await collect(t, { regionCode: "09", sort: "oldest", numItems: 1 });
    expect(newest.map((company) => company.id)).toEqual(byCreation.map((company) => company._id));
    expect(oldest.map((company) => company.id)).toEqual([...byCreation].reverse().map((company) => company._id));
    expect(newest.map((company) => company.id)).not.toEqual(byCoverageRow);
    expect(newest.map((company) => company.slug)).toEqual(["late-company", "middle-company", "early-company"]);
  });

  test("keeps short geographic pages open and rejects malformed cursors", async () => {
    const t = convexTest(schema, modules);
    await seedCompany(t, { name: "Atlas Oldest Match", slug: "atlas-oldest-match", coverage: ["R:09"] });
    await seedCompany(t, { name: "Atlas Gap One", slug: "atlas-gap-one" });
    await seedCompany(t, { name: "Atlas Gap Two", slug: "atlas-gap-two" });
    const pages = [];
    let cursor: string | null = null;
    let sawEmptyUnfinished = false;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await list(t, { search: "Atlas", regionCode: "09", numItems: 1, cursor });
      if (page.page.length === 0 && !page.isDone) sawEmptyUnfinished = true;
      pages.push(...page.page);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(sawEmptyUnfinished).toBe(true);
    expect(pages.map((company) => company.slug)).toEqual(["atlas-oldest-match"]);
    const plain = await collect(t, { search: "Atlas", numItems: 1 });
    expect(pages.map((company) => company.id)).toEqual(
      plain.filter((company) => company.slug === "atlas-oldest-match").map((company) => company.id),
    );

    await expect(list(t, { regionCode: "09", cursor: "x".repeat(9_000) })).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");
    await expect(list(t, { regionCode: "09", cursor: "directory-v2:{" })).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");
    await expect(list(t, {
      regionCode: "09",
      cursor: `directory-v2:${JSON.stringify({ mode: "coverage", cursor: "done", coverage: "tampered" })}`,
    })).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");

    const split = await list(t, { regionCode: "09", numItems: 5, maximumRowsRead: 1 });
    expect(split.page.length).toBeLessThanOrEqual(1);
    if (split.splitCursor) {
      const resumed = await list(t, {
        regionCode: "09",
        numItems: 5,
        cursor: split.splitCursor,
        endCursor: split.continueCursor,
      });
      expect(resumed.page.length).toBeLessThanOrEqual(5);
    }
  });

  test("rechecks suspension on later geographic pages", async () => {
    const t = convexTest(schema, modules);
    const oldest = await seedCompany(t, { name: "Oldest Open", slug: "oldest-open", coverage: ["MA"] });
    const middle = await seedCompany(t, { name: "Middle Open", slug: "middle-open", coverage: ["MA"] });
    const newest = await seedCompany(t, { name: "Newest Open", slug: "newest-open", coverage: ["MA"] });
    const first = await list(t, { regionCode: "09", numItems: 1, sort: "newest" });
    expect(first.page.map((company) => company.id)).toEqual([newest.companyId]);
    expect(first.isDone).toBe(false);
    await t.run(async (ctx) => {
      await ctx.db.patch(middle.companyId, { operationalStatus: "suspended", directoryListed: false });
    });
    const rest = await collect(t, { regionCode: "09", numItems: 1, sort: "newest", cursor: first.continueCursor });
    expect(rest.map((company) => company.id)).toEqual([oldest.companyId]);
    expect(rest.map((company) => company.id)).not.toContain(middle.companyId);
    expect(rest.map((company) => company.id)).not.toContain(newest.companyId);
  });
});

describe("HQ3.1 headquarters-city filtering", () => {
  test.each([false, true])("matches only the actual city with legacy eligibility=%s", async (omitEligibility) => {
    const t = convexTest(schema, modules);
    await seedCompany(t, { name: "Local Builder", slug: "agadir-headquarters", city: "  Ａｇａｄｉｒ  ", omitEligibility });
    await seedCompany(t, { name: "Agadir Construction", slug: "agadir-name-only", city: "Rabat", serviceAreas: ["rabat"], omitEligibility });
    await seedCompany(t, { name: "Regional Builder", slug: "agadir-legacy-area-only", city: "Rabat", serviceAreas: ["agadir"], omitEligibility });
    for (const city of ["Agadir", "  AGADIR  ", "ａｇａｄｉｒ"]) {
      expect((await collect(t, { city, numItems: 1 })).map(row => row.slug)).toEqual(["agadir-headquarters"]);
    }
    // The main text search keeps its existing fields and normalization.
    expect((await collect(t, { search: "Agadir", numItems: 1 })).map(row => row.slug).sort()).toEqual([
      "agadir-headquarters", "agadir-legacy-area-only", "agadir-name-only",
    ]);
    expect((await collect(t, { search: "rénovation", numItems: 1 }))).toHaveLength(3);
  });

  test("finds city-only legacy Companies without directory search text or inferred coverage", async () => {
    const t = convexTest(schema, modules);
    await seedCompany(t, { name: "Local Builder", slug: "legacy-ait-melloul", city: "Aït   Melloul", omitEligibility: true, omitSearchText: true });
    const rows = await collect(t, { city: "  aït melloul  ", numItems: 1 });
    expect(rows.map(row => row.slug)).toEqual(["legacy-ait-melloul"]);
    expect(rows[0]?.coverageScopeKeys).toEqual([]);
    expect(await collect(t, { city: "Aït Melloul", regionCode: "09" })).toEqual([]);
    expect((await collect(t, { city: "   " })).map(row => row.slug)).toEqual(["legacy-ait-melloul"]);
  });

  test("combines headquarters with verified-only, service and explicit region/province coverage", async () => {
    const t = convexTest(schema, modules);
    const fixtures: SeedOptions[] = [
      { name: "Atlas Regional", slug: "regional", coverage: ["R:09"], verificationStatus: "verified" },
      { name: "Atlas Province", slug: "province", coverage: ["P:09.541"], verificationStatus: "verified" },
      { name: "Atlas Other Province", slug: "other-province", coverage: ["P:09.001"], verificationStatus: "verified" },
      { name: "Atlas Pending", slug: "pending", coverage: ["MA"] },
      { name: "Atlas Plumbing", slug: "plumbing", service: "plumbing", coverage: ["MA"], verificationStatus: "verified" },
      { name: "Atlas Agadir Construction", slug: "wrong-headquarters", city: "Rabat", coverage: ["MA"], verificationStatus: "verified" },
      { name: "Atlas Headquarters Only", slug: "no-coverage", verificationStatus: "verified" },
      { name: "Atlas Suspended", slug: "suspended", operationalStatus: "suspended", coverage: ["MA"], verificationStatus: "verified" },
      { name: "Atlas Unlisted", slug: "unlisted", directoryListed: false, coverage: ["MA"], verificationStatus: "verified" },
      { name: "Atlas Incomplete", slug: "incomplete", description: null, coverage: ["MA"], verificationStatus: "verified" },
    ];
    for (const fixture of fixtures) await seedCompany(t, fixture);
    const filters = { city: "Agadir", service: "renovation" as const, verifiedOnly: true, regionCode: "09", numItems: 1 };
    expect((await collect(t, filters)).map(row => row.slug).sort()).toEqual(["other-province", "province", "regional"]);
    expect((await collect(t, { ...filters, provinceCode: "09.541" })).map(row => row.slug).sort()).toEqual(["province", "regional"]);
    // City filtering is a stable subsequence of the text-search relevance order.
    for (const sort of ["relevance", "newest", "oldest"] as const) {
      const source = await collect(t, { search: "Atlas", sort, numItems: 2 });
      const filtered = await collect(t, { search: "Atlas", city: "Agadir", sort, numItems: 1 });
      expect(filtered.map(row => row.id)).toEqual(source.filter(row => row.city === "Agadir").map(row => row.id));
    }
  });

  test.each(["newest", "oldest"] as const)("preserves sparse %s city pagination beyond 200 candidates", async (sort) => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      for (let index = 0; index < 251; index += 1) {
        const city = [0, 25, 250].includes(index) ? "Agadir" : "Rabat";
        await ctx.db.insert("companies", {
          name: `Agadir Builder ${index}`, slug: `city-${index}`, city,
          description: "Construction and renovation services.", serviceAreas: ["agadir"],
          coverageScopeKeys: ["R:09"], onboardingStatus: "completed", verificationStatus: "verified",
          operationalStatus: "normal", directoryListed: true,
          // The oldest real match remains reachable before any search backfill.
          directorySearchText: index === 0 ? undefined : buildCompanyDirectorySearchText({ name: `Agadir Builder ${index}`, city, services: [], serviceAreas: ["agadir"] }),
          createdAt: index, updatedAt: index,
        });
      }
    });
    const filters = { city: "Agadir", regionCode: "09", provinceCode: "09.541", verifiedOnly: true, sort, numItems: 7 };
    const pages = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 60; guard += 1) {
      const page = await list(t, { ...filters, cursor });
      pages.push(page);
      expect(page.page.length).toBeLessThanOrEqual(7);
      if (page.isDone) break;
      expect(page.continueCursor).not.toBe(cursor);
      cursor = page.continueCursor;
    }
    expect(pages.some(page => page.page.length === 0 && !page.isDone)).toBe(true);
    expect(pages.at(-1)?.isDone).toBe(true);
    const rows = pages.flatMap(page => page.page);
    expect(rows.map(row => row.slug)).toEqual(sort === "newest" ? ["city-250", "city-25", "city-0"] : ["city-0", "city-25", "city-250"]);
    expect(new Set(rows.map(row => row.id)).size).toBe(3);
    const first = pages[0];
    await expect(list(t, { ...filters, cursor: first.continueCursor })).resolves.toEqual(pages[1]);
    await expect(list(t, { ...filters, city: "Rabat", cursor: first.continueCursor })).rejects.toThrow("INVALID_COMPANY_DIRECTORY_CURSOR");
    const bounded = await list(t, { ...filters, numItems: 10, maximumRowsRead: 1 });
    expect(bounded.page.length).toBeLessThanOrEqual(1);
    expect(bounded.isDone).toBe(false);
    const boundary = await list(t, { ...filters, cursor: null, endCursor: first.continueCursor });
    expect(boundary.page).toEqual(first.page);
  });

  test("rechecks current headquarters and suspension before returning later city matches", async () => {
    const t = convexTest(schema, modules);
    const oldest = await seedCompany(t, { name: "Oldest Builder", slug: "oldest-city" });
    const middle = await seedCompany(t, { name: "Middle Builder", slug: "middle-city" });
    await seedCompany(t, { name: "Newest Builder", slug: "newest-city" });
    const first = await list(t, { city: "Agadir", numItems: 1 });
    expect(first.page.map(row => row.slug)).toEqual(["newest-city"]);
    await t.run(async ctx => {
      await ctx.db.patch(middle.companyId, { city: "Rabat" });
      await ctx.db.patch(oldest.companyId, { operationalStatus: "suspended", directoryListed: false });
    });
    expect(await collect(t, { city: "Agadir", numItems: 1, cursor: first.continueCursor })).toEqual([]);
  });
});
