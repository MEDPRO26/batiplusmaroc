/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { buildCompanyDirectorySearchText, companyServices } from "./companies/directory";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestBackend = ReturnType<typeof convexTest>;
type Service = "houseConstruction" | "renovation" | "structural" | "finishing" | "architecture" | "interior" | "electrical" | "plumbing" | "joinery" | "pool";

beforeAll(() => {
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

async function seedDirectoryCompany(t: TestBackend, options: {
  name: string;
  slug: string;
  city?: string;
  services?: Service[];
  onboardingStatus?: "pending" | "completed";
  verificationStatus?: "draft" | "pending" | "verified" | "rejected";
  publishedPortfolio?: number;
  draftPortfolio?: number;
  withSearchText?: boolean;
  /** `null` creates a legacy row whose missing status means normal. */
  operationalStatus?: "normal" | "needs_attention" | "suspended" | null;
}) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const city = options.city ?? "Casablanca";
    const services = options.services ?? ["houseConstruction"];
    const userId = await ctx.db.insert("users", {
      email: `${options.slug}@example.test`,
      accountType: "company",
      onboardingStatus: options.onboardingStatus ?? "completed",
      createdAt: now,
      updatedAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: options.name,
      legalName: `${options.name} SARL`,
      slug: options.slug,
      phone: "0612345678",
      city,
      description: `${options.name} réalise des chantiers résidentiels partout au Maroc.`,
      yearsExperience: 12,
      website: "https://private-contact.example/",
      directorySearchText: options.withSearchText === false
        ? undefined
        : buildCompanyDirectorySearchText({ name: options.name, city, services }),
      onboardingStatus: options.onboardingStatus ?? "completed",
      verificationStatus: options.verificationStatus ?? "draft",
      ...(options.operationalStatus === null
        ? {}
        : {
            operationalStatus: options.operationalStatus ?? "normal",
            directoryListed: options.operationalStatus !== "suspended",
          }),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("companyVerifications", {
      companyId,
      legalName: `${options.name} SARL`,
      ice: "001122334455667",
      rcNumber: "RC-PRIVATE",
      legalRepresentative: "Private Person",
      phone: "0600000000",
      address: "Private address",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    for (const service of services) {
      await ctx.db.insert("companyServices", { companyId, service, createdAt: now, updatedAt: now });
    }

    for (const [status, count] of [
      ["published", options.publishedPortfolio ?? 0],
      ["draft", options.draftPortfolio ?? 0],
    ] as const) {
      for (let index = 0; index < count; index += 1) {
        const projectId = await ctx.db.insert("portfolioProjects", {
          companyId,
          title: `${status} project ${index + 1}`,
          description: "A portfolio project used for company discovery tests.",
          city,
          projectType: "construction",
          status,
          createdAt: now + index,
          updatedAt: now + index,
        });
        // Seed an approved exact-file fixture; publication alone does not approve it.
        const storageId = await ctx.storage.store(new Blob(["image"], { type: "image/webp" }));
        const metadata = (await ctx.db.system.get("_storage", storageId))!;
        const imageId = await ctx.db.insert("portfolioImages", {
          companyId, portfolioProjectId: projectId, purpose: "cover", storageId,
          contentType: "image/webp", size: metadata.size, sha256: metadata.sha256,
          uploadedBy: userId, uploadedAt: now, moderationStatus: "approved",
        });
        await ctx.db.patch(projectId, { submittedImageId: imageId, approvedImageId: imageId });
      }
    }
    return { companyId, userId };
  });
}

function list(t: TestBackend, overrides: Partial<{
  search: string;
  city: string;
  service: Service;
  verifiedOnly: boolean;
  sort: "relevance" | "newest" | "oldest";
  cursor: string | null;
  endCursor: string;
  numItems: number;
  maximumRowsRead: number;
}> = {}) {
  return t.query(api.companies.directory.listPublicCompanies, {
    paginationOpts: {
      numItems: overrides.numItems ?? 8,
      cursor: overrides.cursor ?? null,
      ...(overrides.endCursor === undefined ? {} : { endCursor: overrides.endCursor }),
      ...(overrides.maximumRowsRead === undefined ? {} : { maximumRowsRead: overrides.maximumRowsRead }),
    },
    search: overrides.search,
    city: overrides.city,
    service: overrides.service,
    verifiedOnly: overrides.verifiedOnly ?? false,
    sort: overrides.sort ?? "newest",
  });
}

describe("public company discovery", () => {
  test("shows completed companies, hides incomplete companies, and reports verification accurately", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, { name: "Atlas Verified", slug: "atlas-verified", verificationStatus: "verified" });
    await seedDirectoryCompany(t, { name: "Rif Pending", slug: "rif-pending", verificationStatus: "pending" });
    await seedDirectoryCompany(t, { name: "Hidden Setup", slug: "hidden-setup", onboardingStatus: "pending", verificationStatus: "verified" });

    const result = await list(t);
    expect(result.page.map((company) => company.slug).sort()).toEqual(["atlas-verified", "rif-pending"]);
    expect(result.page.find((company) => company.slug === "atlas-verified")?.isVerified).toBe(true);
    expect(result.page.find((company) => company.slug === "rif-pending")?.isVerified).toBe(false);
  });

  test("verified-only returns only verified completed companies", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, { name: "Verified Build", slug: "verified-build", verificationStatus: "verified" });
    await seedDirectoryCompany(t, { name: "Draft Build", slug: "draft-build", verificationStatus: "draft" });
    const result = await list(t, { verifiedOnly: true });
    expect(result.page.map((company) => company.slug)).toEqual(["verified-build"]);
  });

  test("keeps legacy normal rows visible during the eligibility backfill", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, {
      name: "Legacy Visible",
      slug: "legacy-visible",
      verificationStatus: "verified",
      operationalStatus: null,
    });
    await seedDirectoryCompany(t, {
      name: "Legacy Suspended",
      slug: "legacy-suspended",
      verificationStatus: "verified",
      operationalStatus: "suspended",
    });

    await expect(list(t, { verifiedOnly: true })).resolves.toMatchObject({
      page: [expect.objectContaining({ slug: "legacy-visible" })],
    });
  });

  test("searches by company name, city, free-text service, and exact service filter", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, { name: "Atlas Habitat", slug: "atlas-habitat", city: "Marrakech", services: ["architecture"] });
    await seedDirectoryCompany(t, { name: "Casa Rénov", slug: "casa-renov", city: "Casablanca", services: ["renovation"] });

    expect((await list(t, { search: "Atlas" })).page.map((company) => company.slug)).toEqual(["atlas-habitat"]);
    expect((await list(t, { city: "Casablanca" })).page.map((company) => company.slug)).toEqual(["casa-renov"]);
    expect((await list(t, { search: "rénovation" })).page.map((company) => company.slug)).toEqual(["casa-renov"]);
    expect((await list(t, { service: "architecture" })).page.map((company) => company.slug)).toEqual(["atlas-habitat"]);
  });

  test.each(companyServices)("filters legacy %s selections before catalog mapping", async (service) => {
    const t = convexTest(schema, modules);
    const matching = await seedDirectoryCompany(t, { name: "Selected Service", slug: "selected-service", services: [service] });
    const otherService = service === "plumbing" ? "renovation" : "plumbing";
    await seedDirectoryCompany(t, { name: "Other Service", slug: "other-service", services: [otherService] });
    expect((await list(t, { service })).page.map(row => row.id)).toEqual([matching.companyId]);
  });

  test("paginates without loading every company", async () => {
    const t = convexTest(schema, modules);
    for (let index = 0; index < 5; index += 1) {
      await seedDirectoryCompany(t, { name: `Company ${index}`, slug: `company-${index}` });
    }
    const first = await list(t, { numItems: 2 });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    const second = await list(t, { numItems: 2, cursor: first.continueCursor });
    expect(second.page).toHaveLength(2);
    expect(second.isDone).toBe(false);
    const third = await list(t, { numItems: 2, cursor: second.continueCursor });
    expect(third.page).toHaveLength(1);
    expect(third.isDone).toBe(true);
    const companies = [...first.page, ...second.page, ...third.page];
    expect(new Set(companies.map((company) => company.id)).size).toBe(companies.length);
  });

  test("keeps a legacy cursor on its original index while eligibility is backfilled", async () => {
    const t = convexTest(schema, modules);
    const legacy = await seedDirectoryCompany(t, {
      name: "Legacy Oldest", slug: "legacy-oldest", operationalStatus: null,
    });
    await seedDirectoryCompany(t, { name: "Modern Middle", slug: "modern-middle" });
    await seedDirectoryCompany(t, { name: "Modern Newest", slug: "modern-newest" });

    const first = await list(t, { numItems: 1, sort: "newest" });
    expect(first.page.map((row) => row.slug)).toEqual(["modern-newest"]);
    expect(first.continueCursor).toContain('"mode":"legacy"');

    await t.run((ctx) => ctx.db.patch(legacy.companyId, {
      operationalStatus: "normal", directoryListed: true,
    }));
    const second = await list(t, { numItems: 1, sort: "newest", cursor: first.continueCursor });
    const third = await list(t, { numItems: 1, sort: "newest", cursor: second.continueCursor });
    expect([...first.page, ...second.page, ...third.page].map((row) => row.slug)).toEqual([
      "modern-newest", "modern-middle", "legacy-oldest",
    ]);
    expect(third.isDone).toBe(true);
  });

  test("uses exact directory eligibility after backfill without losing oldest/newest order", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, { name: "Indexed Oldest", slug: "indexed-oldest" });
    await seedDirectoryCompany(t, { name: "Indexed Newest", slug: "indexed-newest" });
    await seedDirectoryCompany(t, {
      name: "Indexed Suspended", slug: "indexed-suspended", operationalStatus: "suspended",
    });

    const newest = await list(t, { numItems: 1, sort: "newest" });
    expect(newest.continueCursor).toContain('"mode":"exact"');
    expect(newest.page.map((row) => row.slug)).toEqual(["indexed-newest"]);
    const next = await list(t, { numItems: 1, sort: "newest", cursor: newest.continueCursor });
    expect(next.page.map((row) => row.slug)).toEqual(["indexed-oldest"]);
    const oldest = await list(t, { sort: "oldest" });
    expect(oldest.page.map((row) => row.slug)).toEqual(["indexed-oldest", "indexed-newest"]);

    const searched = await list(t, { search: "Indexed", verifiedOnly: false });
    expect(searched.page.map((row) => row.slug).sort()).toEqual(["indexed-newest", "indexed-oldest"]);
  });

  test("filters incomplete profiles before the directory page limit", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, { name: "Complete Oldest", slug: "complete-oldest" });
    const incomplete = await seedDirectoryCompany(t, { name: "Incomplete Middle", slug: "incomplete-middle" });
    await seedDirectoryCompany(t, { name: "Complete Newest", slug: "complete-newest" });
    await t.run((ctx) => ctx.db.patch(incomplete.companyId, { description: undefined }));

    const first = await list(t, { numItems: 1 });
    const second = await list(t, { numItems: 1, cursor: first.continueCursor });
    expect([...first.page, ...second.page].map((row) => row.slug)).toEqual([
      "complete-newest", "complete-oldest",
    ]);
    expect(second.isDone).toBe(true);
  });

  test("accepts an in-flight Phase-1 search cursor on the original index", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, { name: "Compat One", slug: "compat-one" });
    await seedDirectoryCompany(t, { name: "Compat Two", slug: "compat-two" });
    const previousPage = await t.run((ctx) => ctx.db.query("companies")
      .withSearchIndex("search_directory", (q) =>
        q.search("directorySearchText", "compat").eq("onboardingStatus", "completed"))
      .filter((q) => q.neq(q.field("operationalStatus"), "suspended"))
      .paginate({ numItems: 1, cursor: null }));
    expect(previousPage.isDone).toBe(false);

    const continued = await list(t, {
      search: "Compat", numItems: 1, cursor: previousPage.continueCursor,
    });
    expect(continued.continueCursor).toContain('"mode":"previous"');
    expect(continued.page).toHaveLength(1);
    expect(continued.page[0].id).not.toBe(previousPage.page[0]._id);

    const bounded = await list(t, {
      search: "Compat", numItems: 8, endCursor: previousPage.continueCursor,
    });
    expect(bounded.page.map((row) => row.id)).toEqual([previousPage.page[0]._id]);
  });

  test.each(["exact", "legacy"] as const)("preserves %s query mode across reactive page splits", async (mode) => {
    const t = convexTest(schema, modules);
    for (let index = 0; index < 6; index += 1) {
      await seedDirectoryCompany(t, {
        name: `Split Company ${index}`,
        slug: `split-company-${index}`,
        operationalStatus: mode === "legacy" && index === 0 ? null : "normal",
      });
    }

    const original = await list(t, { numItems: 5, maximumRowsRead: 4 });
    expect(original.pageStatus).toBe("SplitRequired");
    expect(original.splitCursor).toContain(`\"mode\":\"${mode}\"`);
    expect(original.continueCursor).toContain(`\"mode\":\"${mode}\"`);

    const firstHalf = await list(t, {
      numItems: 5, maximumRowsRead: 4, endCursor: original.splitCursor!,
    });
    const secondHalf = await list(t, {
      numItems: 5, maximumRowsRead: 4,
      cursor: original.splitCursor!, endCursor: original.continueCursor,
    });
    const remainder = await list(t, { numItems: 5, cursor: original.continueCursor });
    const allSlugs = [...firstHalf.page, ...secondHalf.page, ...remainder.page].map((row) => row.slug);
    expect(allSlugs).toEqual(Array.from({ length: 6 }, (_, index) => `split-company-${5 - index}`));
    expect(new Set(allSlugs).size).toBe(allSlugs.length);
    expect(firstHalf.pageStatus).not.toBe("SplitRequired");
    expect(secondHalf.pageStatus).not.toBe("SplitRequired");
    expect(remainder.isDone).toBe(true);

    // The earlier Phase-2 response left splitCursor raw. A wrapped endCursor
    // still identifies its index mode when that split is already in flight.
    const rawSplitCursor = (JSON.parse(original.splitCursor!.slice("directory-v2:".length)) as { cursor: string }).cursor;
    const resumedSplit = await list(t, {
      numItems: 5, cursor: rawSplitCursor, endCursor: original.continueCursor,
    });
    expect(resumedSplit.page.map((row) => row.slug)).toEqual(secondHalf.page.map((row) => row.slug));
  });

  test.each([
    ["unfiltered index", {}],
    ["verified index", { verifiedOnly: true }],
    ["search index", { search: "pagination" }],
    ["city search", { city: "Casablanca" }],
    ["service search", { service: "houseConstruction" as const }],
    ["verified search", { search: "pagination", verifiedOnly: true }],
  ] as const)("filters suspended companies before paginating the %s path", async (_name, filters) => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, {
      name: "Pagination Eligible Oldest",
      slug: "pagination-eligible-oldest",
      verificationStatus: "verified",
      operationalStatus: "normal",
    });
    await seedDirectoryCompany(t, {
      name: "Pagination Eligible Newest",
      slug: "pagination-eligible-newest",
      verificationStatus: "verified",
      operationalStatus: "needs_attention",
    });
    await seedDirectoryCompany(t, {
      name: "Pagination Eligible Middle",
      slug: "pagination-eligible-middle",
      verificationStatus: "verified",
      operationalStatus: "normal",
    });
    await seedDirectoryCompany(t, {
      name: "Pagination Pagination Suspended One",
      slug: "pagination-suspended-one",
      verificationStatus: "verified",
      operationalStatus: "suspended",
    });
    await seedDirectoryCompany(t, {
      name: "Pagination Pagination Suspended Two",
      slug: "pagination-suspended-two",
      verificationStatus: "verified",
      operationalStatus: "suspended",
    });

    const first = await list(t, { ...filters, numItems: 2 });
    expect(first.page).toHaveLength(2);
    expect(first.page.every((row) => !row.slug.includes("suspended"))).toBe(true);
    expect(first.isDone).toBe(false);

    const pages = [first];
    let cursor = first.continueCursor;
    for (let pageNumber = 0; pageNumber < 10 && !pages.at(-1)!.isDone; pageNumber += 1) {
      const page = await list(t, { ...filters, numItems: 2, cursor });
      if (!page.isDone) expect(page.page.length).toBeGreaterThan(0);
      pages.push(page);
      cursor = page.continueCursor;
    }
    expect(pages.at(-1)?.isDone).toBe(true);
    const visible = pages.flatMap((page) => page.page);
    expect(visible.every((company) => !company.slug.includes("suspended"))).toBe(true);
    expect(new Set(visible.map((company) => company.slug))).toEqual(
      new Set(["pagination-eligible-oldest", "pagination-eligible-newest", "pagination-eligible-middle"]),
    );
  });

  test("keeps legacy directory pages filled when suspended rows lead the index", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, {
      name: "Legacy Eligible Oldest", slug: "legacy-eligible-oldest", operationalStatus: null,
    });
    await seedDirectoryCompany(t, { name: "Legacy Eligible Middle", slug: "legacy-eligible-middle" });
    await seedDirectoryCompany(t, { name: "Legacy Eligible Newest", slug: "legacy-eligible-newest" });
    await seedDirectoryCompany(t, {
      name: "Legacy Suspended One", slug: "legacy-suspended-one", operationalStatus: "suspended",
    });
    await seedDirectoryCompany(t, {
      name: "Legacy Suspended Two", slug: "legacy-suspended-two", operationalStatus: "suspended",
    });

    const first = await list(t, { numItems: 2 });
    expect(first.continueCursor).toContain('"mode":"legacy"');
    expect(first.page.map((row) => row.slug)).toEqual(["legacy-eligible-newest", "legacy-eligible-middle"]);
    const second = await list(t, { numItems: 2, cursor: first.continueCursor });
    expect(second.page.map((row) => row.slug)).toEqual(["legacy-eligible-oldest"]);
    expect(second.isDone).toBe(true);
  });

  test("advances through split-required legacy pages containing only suspended rows", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, {
      name: "Split Eligible Oldest", slug: "split-eligible-oldest", operationalStatus: null,
    });
    await seedDirectoryCompany(t, { name: "Split Eligible Newest", slug: "split-eligible-newest" });
    for (let index = 0; index < 4; index += 1) {
      await seedDirectoryCompany(t, {
        name: `Split Suspended ${index}`, slug: `split-suspended-${index}`,
        operationalStatus: "suspended",
      });
    }

    const first = await list(t, { numItems: 2, maximumRowsRead: 3 });
    expect(first).toMatchObject({ page: [], pageStatus: "SplitRequired", isDone: false });
    expect(first.splitCursor).toContain('"mode":"legacy"');
    let cursor = first.continueCursor;
    const seen: string[] = [];
    const cursors = new Set([cursor]);
    let done = false;
    for (let pageNumber = 0; pageNumber < 5 && !done; pageNumber += 1) {
      const page = await list(t, { numItems: 2, maximumRowsRead: 3, cursor });
      seen.push(...page.page.map((row) => row.slug));
      done = page.isDone;
      cursor = page.continueCursor;
      if (!done) {
        expect(cursors.has(cursor)).toBe(false);
        cursors.add(cursor);
      }
    }
    expect(done).toBe(true);
    expect(seen).toEqual(["split-eligible-newest", "split-eligible-oldest"]);
  });

  test("returns only the dedicated public shape and only published portfolio previews", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, {
      name: "Safe Construction",
      slug: "safe-construction",
      services: ["structural", "finishing"],
      publishedPortfolio: 2,
      draftPortfolio: 1,
    });
    const result = await list(t);
    const company = result.page[0];
    expect(company.portfolio).toHaveLength(2);
    expect(company.portfolio.every((item) => item.title.startsWith("published"))).toBe(true);
    expect(company.coverImageUrl).toBeNull();
    expect(company).not.toHaveProperty("legalName");
    expect(company).not.toHaveProperty("phone");
    expect(company).not.toHaveProperty("website");
    expect(company).not.toHaveProperty("ice");
    expect(company).not.toHaveProperty("rcNumber");
    expect(company).not.toHaveProperty("verificationDocuments");
    expect(Object.keys(company).sort()).toEqual([
      "city", "coverImageUrl", "description", "id", "isVerified", "logoUrl", "name",
      "portfolio", "rating", "reviewCount", "serviceAreas", "serviceNames", "services", "slug", "yearsExperience",
    ].sort());
  });

  test("backfills searchable text for previously completed companies", async () => {
    const t = convexTest(schema, modules);
    const { companyId } = await seedDirectoryCompany(t, {
      name: "Legacy Atlas",
      slug: "legacy-atlas",
      city: "Agadir",
      services: ["structural"],
      withSearchText: false,
    });
    expect((await t.run((ctx) => ctx.db.get(companyId)))?.directorySearchText).toBeUndefined();

    const migration = await t.mutation(
      internal.companies.directory.backfillDirectorySearchText,
      { paginationOpts: { numItems: 50, cursor: null } },
    );
    expect(migration).toMatchObject({ updated: 1, isDone: true });
    expect((await list(t, { search: "Legacy Atlas" })).page.map((company) => company.slug)).toEqual(["legacy-atlas"]);
  });
});
