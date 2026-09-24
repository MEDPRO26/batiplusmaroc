/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { buildCompanyDirectorySearchText } from "./companies/directory";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestBackend = ReturnType<typeof convexTest>;
type Service = "houseConstruction" | "renovation" | "structural" | "finishing" | "architecture" | "interior" | "electrical" | "plumbing" | "joinery" | "pool";

beforeAll(() => {
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
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
        const mediaId = await ctx.db.insert("publicMedia", {
          storageProvider: "r2",
          companyId,
          portfolioProjectId: projectId,
          purpose: "portfolioCover",
          objectKey: `companies/${companyId}/${status}-${index}.webp`,
          mimeType: "image/webp",
          size: 100,
          uploadedBy: userId,
          createdAt: now,
        });
        await ctx.db.patch(projectId, { coverMediaId: mediaId });
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
  numItems: number;
}> = {}) {
  return t.query(api.companies.directory.listPublicCompanies, {
    paginationOpts: { numItems: overrides.numItems ?? 8, cursor: overrides.cursor ?? null },
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

  test("searches by company name, city, free-text service, and exact service filter", async () => {
    const t = convexTest(schema, modules);
    await seedDirectoryCompany(t, { name: "Atlas Habitat", slug: "atlas-habitat", city: "Marrakech", services: ["architecture"] });
    await seedDirectoryCompany(t, { name: "Casa Rénov", slug: "casa-renov", city: "Casablanca", services: ["renovation"] });

    expect((await list(t, { search: "Atlas" })).page.map((company) => company.slug)).toEqual(["atlas-habitat"]);
    expect((await list(t, { city: "Casablanca" })).page.map((company) => company.slug)).toEqual(["casa-renov"]);
    expect((await list(t, { search: "rénovation" })).page.map((company) => company.slug)).toEqual(["casa-renov"]);
    expect((await list(t, { service: "architecture" })).page.map((company) => company.slug)).toEqual(["atlas-habitat"]);
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
    expect(company.coverImageUrl).toMatch(/^https:\/\/media\.example\.test\//);
    expect(company).not.toHaveProperty("legalName");
    expect(company).not.toHaveProperty("phone");
    expect(company).not.toHaveProperty("website");
    expect(company).not.toHaveProperty("ice");
    expect(company).not.toHaveProperty("rcNumber");
    expect(company).not.toHaveProperty("verificationDocuments");
    expect(Object.keys(company).sort()).toEqual([
      "city", "coverImageUrl", "description", "id", "isVerified", "logoUrl", "name",
      "portfolio", "rating", "reviewCount", "serviceAreas", "services", "slug", "yearsExperience",
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
