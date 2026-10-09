/// <reference types="vite/client" />

import { convexTest, type TestConvexForDataModel } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

vi.mock("./storage/r2Client", () => ({
  createPresignedPutUrl: vi.fn(async () => "https://upload.example.test/presigned"),
  headPublicMediaObject: vi.fn(async () => ({
    ContentType: "image/jpeg",
    ContentLength: 10,
    ETag: '"test-etag"',
  })),
  readPublicMediaSignature: vi.fn(async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
  deletePublicMediaObject: vi.fn(async () => undefined),
}));

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "batiplus-test";
  process.env.R2_ENDPOINT = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
});

type TestBackend = TestConvexForDataModel<DataModel>;

async function seedCompany(t: TestBackend, options?: {
  accountType?: "client" | "company";
  role?: "owner" | "staff";
  onboardingStatus?: "pending" | "completed";
  verificationStatus?: "draft" | "pending" | "verified" | "rejected";
  slug?: string;
}) {
  return await t.run(async (ctx) => {
    const now = 100;
    const userId = await ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@example.test`,
      accountType: options?.accountType ?? "company",
      onboardingStatus: options?.onboardingStatus ?? "completed",
      createdAt: now,
      updatedAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Atlas Bâtiment",
      legalName: "Atlas Bâtiment SARL",
      slug: options?.slug ?? `atlas-${crypto.randomUUID().slice(0, 8)}`,
      phone: "0612345678",
      city: "Agadir",
      description: "Entreprise spécialisée dans les travaux de construction et de rénovation.",
      yearsExperience: 12,
      website: "https://atlas.example/",
      onboardingStatus: options?.onboardingStatus ?? "completed",
      verificationStatus: options?.verificationStatus ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("companyMembers", {
      companyId,
      userId,
      role: options?.role ?? "owner",
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("companyServices", {
      companyId,
      service: "renovation",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, companyId };
  });
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

const fields = {
  title: "Villa contemporaine à Agadir",
  description: "Construction complète avec finitions intérieures et aménagement des espaces extérieurs.",
  city: "Agadir", projectType: "construction" as const, surface: 280, durationMonths: 14, year: 2025,
};

describe("public company profile", () => {
  test.each([
    ["national", ["MA"], ["MA"]],
    ["region", ["R:09"], ["R:09"]],
    ["province only", ["P:09.541"], ["P:09.541"]],
    ["overlap", ["MA", "R:09", "P:09.541"], ["MA", "R:09", "P:09.541"]],
    ["empty", [], []],
    ["legacy absent", undefined, []],
    ["malformed", ["MA", "P:99.999"], []],
    ["duplicate", ["MA", "MA"], []],
  ] as const)("HQ3.1 projects validated %s coverage without private fields or inference", async (_label, keys, expected) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, { slug: "coverage-profile" });
    const before = await t.run(async ctx => {
      await ctx.db.patch(company.companyId, {
        coverageScopeKeys: keys === undefined ? undefined : [...keys],
        serviceAreas: ["agadir"], headquartersRegionCode: "09", headquartersProvinceCode: "09.001",
        headquartersCommune: "PRIVATE-COMMUNE", headquartersPolicyVersion: "structured_v1",
      });
      await ctx.db.insert("companyVerifications", {
        companyId: company.companyId, legalName: "PRIVATE-LEGAL-NAME", ice: "001122334455667",
        rcNumber: "PRIVATE-RC", legalRepresentative: "PRIVATE-REP", phone: "0600000000",
        address: "PRIVATE-ADDRESS", submittedAt: 1, createdAt: 1, updatedAt: 1,
      });
      // Stale derived rows never supply public declarations.
      await ctx.db.insert("companyCoverageIndex", { companyId: company.companyId, areaKey: "MA" });
      return ctx.db.get(company.companyId);
    });
    const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "coverage-profile" });
    expect(profile?.coverageScopeKeys).toEqual(expected);
    expect(profile?.serviceAreas).toEqual(["agadir"]);
    expect(Object.keys(profile!).sort()).toEqual([
      "id", "slug", "name", "logoUrl", "coverImageUrl", "isVerified", "marketplaceAvailable", "invitationEligible",
      "city", "headquarters", "description", "services", "serviceNames", "serviceAreas", "coverageScopeKeys",
      "yearsExperience", "foundedYear", "companySize", "languages", "website", "portfolio", "rating", "reviewCount", "reviews",
    ].sort());
    expect(Object.keys(profile!.headquarters).sort()).toEqual(["provinceCode", "regionCode"]);
    expect(JSON.stringify(profile)).not.toMatch(/PRIVATE-|0612345678|001122334455667|userId|companyMembers|headquartersPolicyVersion|companyVerifications/);
    expect(await t.run(ctx => ctx.db.get(company.companyId))).toEqual(before);
  });

  test("completed profiles keep name masking and verification independent from images", async () => {
    for (const verificationStatus of ["draft", "verified", "pending", "rejected"] as const) {
      const t = convexTest(schema, modules);
      const slug = `profile-${verificationStatus}`;
      await seedCompany(t, { slug, verificationStatus });
      const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug });
      expect(profile).toMatchObject({ slug, name: "At*** Bâ******", isVerified: verificationStatus === "verified" });
      expect(profile).not.toHaveProperty("phone");
      expect(profile).not.toHaveProperty("email");
    }
    const t = convexTest(schema, modules);
    await seedCompany(t, { slug: "incomplete", onboardingStatus: "pending" });
    expect(await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "missing" })).toBeNull();
    expect(await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "incomplete" })).toBeNull();
  });
});

describe("portfolio metadata management", () => {
  test("owner creates, edits and publishes metadata without approving or requiring an image", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t, { slug: "atlas-public" });
    const owner = asUser(t, userId);
    const projectId = await owner.mutation(api.portfolio.index.createPortfolioProject, fields);
    await owner.mutation(api.portfolio.index.updatePortfolioProject, { ...fields, projectId, title: "Villa contemporaine livrée" });
    await owner.mutation(api.portfolio.index.publishPortfolioProject, { projectId });
    const manager = await owner.query(api.portfolio.index.getPortfolioManager, {});
    expect(manager.projects[0]).toMatchObject({ title: "Villa contemporaine livrée", status: "published", coverImageUrl: null, media: [] });
    const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "atlas-public" });
    expect(profile?.portfolio[0]).toMatchObject({ id: projectId, coverImageUrl: null, media: [] });
    expect(await t.run(ctx => ctx.db.query("portfolioImages").collect())).toEqual([]);
  });

  test("client, staff, visitor and another company cannot manage the portfolio", async () => {
    const t = convexTest(schema, modules);
    const first = await seedCompany(t);
    const other = await seedCompany(t);
    const client = await seedCompany(t, { accountType: "client" });
    const staff = await seedCompany(t, { role: "staff" });
    const projectId = await asUser(t, first.userId).mutation(api.portfolio.index.createPortfolioProject, fields);
    await expect(asUser(t, other.userId).mutation(api.portfolio.index.publishPortfolioProject, { projectId })).rejects.toThrow("PORTFOLIO_PROJECT_NOT_FOUND");
    for (const caller of [t, asUser(t, client.userId), asUser(t, staff.userId)]) {
      await expect(caller.query(api.portfolio.index.getPortfolioManager, {})).rejects.toThrow();
      await expect(caller.mutation(api.portfolio.index.createPortfolioProject, fields)).rejects.toThrow();
    }
  });

  test("metadata validation and onboarding gates remain enforced", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    for (const invalid of [{ title: " " }, { description: "short" }, { city: "123" }, { surface: 0 }, { durationMonths: 1.5 }, { year: 1899 }]) {
      await expect(owner.mutation(api.portfolio.index.createPortfolioProject, { ...fields, ...invalid })).rejects.toThrow();
    }
    const incomplete = await seedCompany(t, { onboardingStatus: "pending" });
    await expect(asUser(t, incomplete.userId).mutation(api.portfolio.index.createPortfolioProject, fields)).rejects.toThrow("COMPANY_ONBOARDING_REQUIRED");
  });

  test("legacy cover replacement is rejected without deleting any legacy file or reference", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, { slug: "legacy-storage" });
    const owner = asUser(t, company.userId);
    const legacy = await t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob(["legacy"], { type: "image/jpeg" }));
      const mediaId = await ctx.db.insert("publicMedia", { companyId: company.companyId, storageProvider: "r2", purpose: "portfolioCover",
        objectKey: "legacy/cover.jpg", mimeType: "image/jpeg", size: 6, uploadedBy: company.userId, createdAt: 1 });
      const projectId = await ctx.db.insert("portfolioProjects", { ...fields, companyId: company.companyId, coverImageStorageId: storageId, coverMediaId: mediaId,
        status: "published", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("portfolioMedia", { portfolioProjectId: projectId, storageId, sortOrder: 0, createdAt: 1 });
      return { storageId, mediaId, projectId };
    });
    await expect(owner.mutation(api.portfolio.index.updatePortfolioProject, { ...fields, projectId: legacy.projectId, coverImage: { uploadToken: "old" } })).rejects.toThrow("PORTFOLIO_PRIVATE_UPLOAD_REQUIRED");
    await expect(owner.mutation(api.portfolio.index.createPortfolioProject, { ...fields, extraImages: [{ uploadToken: "old" }] })).rejects.toThrow("PORTFOLIO_PRIVATE_UPLOAD_REQUIRED");
    const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "legacy-storage" });
    expect(profile?.portfolio[0]).toMatchObject({ coverImageUrl: null, media: [] });
    const state = await t.run(async ctx => ({ project: await ctx.db.get(legacy.projectId), media: await ctx.db.get(legacy.mediaId), file: (await ctx.storage.get(legacy.storageId)) !== null,
      scheduled: await ctx.db.system.query("_scheduled_functions").collect() }));
    expect(state.project).toMatchObject({ coverImageStorageId: legacy.storageId, coverMediaId: legacy.mediaId });
    expect(state.media).not.toBeNull(); expect(state.file).toBe(true); expect(state.scheduled).toEqual([]);
  });

  test("draft and archived realizations retain their existing public visibility rules", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, { slug: "private-work" });
    const owner = asUser(t, company.userId);
    const projectId = await owner.mutation(api.portfolio.index.createPortfolioProject, fields);
    const profile = () => t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "private-work" });
    expect((await profile())?.portfolio).toEqual([]);
    await owner.mutation(api.portfolio.index.publishPortfolioProject, { projectId });
    expect((await profile())?.portfolio).toHaveLength(1);
    await owner.mutation(api.portfolio.index.archivePortfolioProject, { projectId });
    expect((await profile())?.portfolio).toEqual([]);
  });
});
