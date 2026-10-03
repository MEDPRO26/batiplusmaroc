/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestBackend = ReturnType<typeof convexTest>;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
});

async function seedCompany(
  t: TestBackend,
  label: string,
  options?: { accountType?: "client" | "company"; role?: "owner" | "staff" },
) {
  return await t.run(async (ctx) => {
    const now = 100;
    for (const [index, slug] of ["houseConstruction", "renovation", "structural", "finishing", "architecture", "interior", "electrical", "plumbing", "joinery", "pool"].entries()) {
      if (!(await ctx.db.query("serviceCatalog").take(20)).some(row => row.slug === slug)) await ctx.db.insert("serviceCatalog", { slug, nameFr: slug, nameEn: slug, isActive: true, sortOrder: index * 10, createdAt: now, updatedAt: now });
    }
    const userId = await ctx.db.insert("users", {
      email: `${label}@example.test`,
      accountType: options?.accountType ?? "company",
      onboardingStatus: "completed",
      createdAt: now,
      updatedAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: `${label} Company`,
      legalName: `${label} Company SARL`,
      slug: `${label}-company`,
      phone: "0611111111",
      city: "Rabat",
      description: "A completed company profile ready for public profile management.",
      yearsExperience: 5,
      website: "https://old.example/",
      directorySearchText: `${label} company rabat servicestructural structural work gros oeuvre gros œuvre`,
      onboardingStatus: "completed",
      verificationStatus: "verified",
      operationalStatus: "normal",
      directoryListed: true,
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
      service: "structural",
      createdAt: now,
      updatedAt: now,
    });
    const verificationId = await ctx.db.insert("companyVerifications", {
      companyId,
      legalName: `${label} Verified SARL`,
      ice: "001122334455667",
      rcNumber: "RC-PRIVATE",
      legalRepresentative: "Protected Representative",
      phone: "0522000000",
      address: "Protected legal address",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, companyId, verificationId };
  });
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function uploadedCompanyImage(
  t: TestBackend,
  userId: Id<"users">,
  companyId: Id<"companies">,
  purpose: "companyLogo" | "companyCover",
) {
  return await t.run(async (ctx) => {
    const uploadToken = crypto.randomUUID();
    await ctx.db.insert("publicMediaUploadIntents", {
      companyId,
      userId,
      purpose,
      expectedContentType: "image/webp",
      expectedSize: 256,
      objectKey: `companies/${companyId}/${purpose === "companyLogo" ? "logo" : "cover"}/${crypto.randomUUID()}.webp`,
      token: uploadToken,
      expiresAt: Date.now() + 60_000,
      verifiedAt: Date.now(),
      createdAt: Date.now(),
    });
    return uploadToken;
  });
}

type UpdateArgs = FunctionArgs<typeof api.companies.index.updatePublicProfile>;

const validUpdate: UpdateArgs = {
  name: "Atlas Public Construction",
  description: "Updated public construction services for residential and commercial clients.",
  city: "Casablanca",
  phone: "+212 6 12 34 56 78",
  website: "atlas-public.ma",
  yearsExperience: 14,
  foundedYear: 2010,
  companySize: "11to50",
  languages: ["arabic", "french", "english"],
  services: ["houseConstruction", "renovation"],
  serviceAreas: ["casablanca", "agadir", "marrakech"],
};

describe("company public profile management", () => {
  test("an active company owner edits the existing company profile", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, "owner-edit");

    await expect(
      asUser(t, userId).mutation(api.companies.index.updatePublicProfile, validUpdate),
    ).resolves.toEqual({ slug: "owner-edit-company" });

    const state = await t.run(async (ctx) => ({
      company: await ctx.db.get(companyId),
      companies: await ctx.db.query("companies").take(10),
      services: await ctx.db
        .query("companyServices")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .take(20),
    }));
    expect(state.companies).toHaveLength(1);
    expect(state.company).toMatchObject({
      name: "Atlas Public Construction",
      city: "Casablanca",
      phone: "+212612345678",
      yearsExperience: 14,
      foundedYear: 2010,
      companySize: "11to50",
      languages: ["arabic", "french", "english"],
      serviceAreas: ["casablanca", "agadir", "marrakech"],
      website: "https://atlas-public.ma/",
      verificationStatus: "verified",
    });
    expect(state.services.map((row) => row.service).sort()).toEqual([
      "houseConstruction",
      "renovation",
    ]);
  });

  test("a delayed image save preserves newer text and every unrelated profile field", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, "delayed-image");
    const logoUploadToken = await uploadedCompanyImage(t, userId, companyId, "companyLogo");

    await asUser(t, userId).mutation(api.companies.index.updatePublicProfile, {
      description: "This newer profile description must survive a delayed image upload completion.",
    });
    await asUser(t, userId).mutation(api.companies.index.setCompanyPublicImage, {
      kind: "logo",
      uploadToken: logoUploadToken,
    });

    const state = await t.run(async (ctx) => ({
      company: await ctx.db.get(companyId),
      services: await ctx.db
        .query("companyServices")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .collect(),
    }));
    expect(state.company).toMatchObject({
      name: "delayed-image Company",
      description: "This newer profile description must survive a delayed image upload completion.",
      city: "Rabat",
      phone: "0611111111",
      website: "https://old.example/",
      yearsExperience: 5,
      directorySearchText: "delayed-image company rabat servicestructural structural work gros oeuvre gros œuvre",
    });
    expect(state.company?.logoMediaId).toBeDefined();
    expect(state.services.map((row) => row.service)).toEqual(["structural"]);
  });

  test("a focused text patch preserves a newer image and untouched profile sections", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, "newer-image");
    const logoUploadToken = await uploadedCompanyImage(t, userId, companyId, "companyLogo");
    await asUser(t, userId).mutation(api.companies.index.setCompanyPublicImage, {
      kind: "logo",
      uploadToken: logoUploadToken,
    });
    const imageBeforeTextSave = await t.run(async (ctx) =>
      (await ctx.db.get(companyId))?.logoMediaId,
    );

    await asUser(t, userId).mutation(api.companies.index.updatePublicProfile, {
      name: "Newer Image Construction",
      city: "Casablanca",
    });

    const state = await t.run(async (ctx) => ({
      company: await ctx.db.get(companyId),
      services: await ctx.db
        .query("companyServices")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .collect(),
    }));
    expect(state.company).toMatchObject({
      name: "Newer Image Construction",
      city: "Casablanca",
      description: "A completed company profile ready for public profile management.",
      phone: "0611111111",
      website: "https://old.example/",
      yearsExperience: 5,
      logoMediaId: imageBeforeTextSave,
    });
    expect(state.company?.directorySearchText).toContain("newer image construction");
    expect(state.company?.directorySearchText).toContain("casablanca");
    expect(state.services.map((row) => row.service)).toEqual(["structural"]);
  });

  test("nullable numeric patches clear only the requested optional field", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, "clear-years");

    await asUser(t, userId).mutation(api.companies.index.updatePublicProfile, {
      yearsExperience: null,
    });

    const company = await t.run((ctx) => ctx.db.get(companyId));
    expect(company?.yearsExperience).toBeUndefined();
    expect(company).toMatchObject({
      name: "clear-years Company",
      description: "A completed company profile ready for public profile management.",
      city: "Rabat",
      phone: "0611111111",
      website: "https://old.example/",
    });
  });

  test("rejects unauthenticated users, clients, and non-owner company members", async () => {
    const t = convexTest(schema, modules);
    const client = await seedCompany(t, "client-edit", { accountType: "client" });
    const staff = await seedCompany(t, "staff-edit", { role: "staff" });

    await expect(t.mutation(api.companies.index.updatePublicProfile, validUpdate)).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
    await expect(
      asUser(t, client.userId).mutation(api.companies.index.updatePublicProfile, validUpdate),
    ).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    await expect(
      asUser(t, staff.userId).mutation(api.companies.index.updatePublicProfile, validUpdate),
    ).rejects.toThrow("COMPANY_OWNER_REQUIRED");
  });

  test("company A cannot claim company B media or mutate company B", async () => {
    const t = convexTest(schema, modules);
    const companyA = await seedCompany(t, "company-a");
    const companyB = await seedCompany(t, "company-b");
    const companyBLogo = await uploadedCompanyImage(
      t,
      companyB.userId,
      companyB.companyId,
      "companyLogo",
    );

    await expect(
      asUser(t, companyA.userId).mutation(api.companies.index.setCompanyPublicImage, {
        kind: "logo",
        uploadToken: companyBLogo,
      }),
    ).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");

    const state = await t.run(async (ctx) => ({
      companyA: await ctx.db.get(companyA.companyId),
      companyB: await ctx.db.get(companyB.companyId),
    }));
    expect(state.companyA?.name).toBe("company-a Company");
    expect(state.companyB?.name).toBe("company-b Company");
  });

  test("uploads and replaces both logo and cover through verified R2 intents", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, "branding");
    const oldMedia = await t.run(async (ctx) => {
      const logoMediaId = await ctx.db.insert("publicMedia", {
        storageProvider: "r2",
        companyId,
        purpose: "companyLogo",
        objectKey: `companies/${companyId}/logo/old.webp`,
        mimeType: "image/webp",
        size: 100,
        uploadedBy: userId,
        createdAt: 1,
      });
      const coverMediaId = await ctx.db.insert("publicMedia", {
        storageProvider: "r2",
        companyId,
        purpose: "companyCover",
        objectKey: `companies/${companyId}/cover/old.webp`,
        mimeType: "image/webp",
        size: 100,
        uploadedBy: userId,
        createdAt: 1,
      });
      await ctx.db.patch(companyId, { logoMediaId, coverMediaId });
      return { logoMediaId, coverMediaId };
    });
    const logoUploadToken = await uploadedCompanyImage(t, userId, companyId, "companyLogo");
    const coverUploadToken = await uploadedCompanyImage(t, userId, companyId, "companyCover");

    await asUser(t, userId).mutation(api.companies.index.setCompanyPublicImage, {
      kind: "logo",
      uploadToken: logoUploadToken,
    });
    await asUser(t, userId).mutation(api.companies.index.setCompanyPublicImage, {
      kind: "cover",
      uploadToken: coverUploadToken,
    });

    const state = await t.run(async (ctx) => {
      const company = await ctx.db.get(companyId);
      return {
        company,
        logo: company?.logoMediaId ? await ctx.db.get(company.logoMediaId) : null,
        cover: company?.coverMediaId ? await ctx.db.get(company.coverMediaId) : null,
        oldLogo: await ctx.db.get(oldMedia.logoMediaId),
        oldCover: await ctx.db.get(oldMedia.coverMediaId),
      };
    });
    expect(state.logo).toMatchObject({ purpose: "companyLogo", uploadedBy: userId });
    expect(state.cover).toMatchObject({ purpose: "companyCover", uploadedBy: userId });
    expect(state.oldLogo).toBeNull();
    expect(state.oldCover).toBeNull();

    const manager = await asUser(t, userId).query(api.companies.index.getProfileManager, {});
    expect(manager.logoUrl).toContain(`/companies/${companyId}/logo/`);
    expect(manager.coverImageUrl).toContain(`/companies/${companyId}/cover/`);
  });

  test("updates services and service areas without duplicate companyServices", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, "services");
    await t.run((ctx) =>
      ctx.db.insert("companyServices", {
        companyId,
        service: "structural",
        createdAt: 101,
        updatedAt: 101,
      }),
    );

    await asUser(t, userId).mutation(api.companies.index.updatePublicProfile, validUpdate);
    const rows = await t.run((ctx) =>
      ctx.db
        .query("companyServices")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .take(20),
    );
    expect(rows.map((row) => row.service).sort()).toEqual(["houseConstruction", "renovation"]);
    expect(new Set(rows.map((row) => row.service)).size).toBe(rows.length);

    await expect(
      asUser(t, userId).mutation(api.companies.index.updatePublicProfile, {
        ...validUpdate,
        services: ["renovation", "renovation"],
      }),
    ).rejects.toThrow("INVALID_SERVICES");
    await expect(
      asUser(t, userId).mutation(api.companies.index.updatePublicProfile, {
        ...validUpdate,
        serviceAreas: ["agadir", "agadir"],
      }),
    ).rejects.toThrow("INVALID_SERVICE_AREAS");
  });

  test("keeps legal and verification data read-only", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId, verificationId } = await seedCompany(t, "legal-data");
    await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(["private verification document"], { type: "application/pdf" }),
      );
      await ctx.db.insert("companyVerificationDocuments", {
        verificationId,
        companyId,
        documentType: "rc",
        storageId,
        fileName: "registre-commerce.pdf",
        contentType: "application/pdf",
        size: 29,
        createdAt: 100,
        updatedAt: 100,
      });
    });

    await asUser(t, userId).mutation(api.companies.index.updatePublicProfile, validUpdate);
    const beforeAttempt = await t.run(async (ctx) => ({
      company: await ctx.db.get(companyId),
      verification: await ctx.db.get(verificationId),
    }));
    expect(beforeAttempt.company?.legalName).toBe("legal-data Company SARL");
    expect(beforeAttempt.company?.verificationStatus).toBe("verified");
    expect(beforeAttempt.verification).toMatchObject({
      ice: "001122334455667",
      rcNumber: "RC-PRIVATE",
      legalRepresentative: "Protected Representative",
    });
    const manager = await asUser(t, userId).query(api.companies.index.getProfileManager, {});
    expect(manager.legal.documents).toEqual([
      { documentType: "rc", fileName: "registre-commerce.pdf" },
    ]);

    await expect(
      asUser(t, userId).mutation(api.companies.index.updatePublicProfile, {
        ...validUpdate,
        legalName: "Attempted overwrite",
        verificationStatus: "draft",
        documents: [],
      } as never),
    ).rejects.toThrow();
  });

  test("saved changes immediately feed the public profile and company directory", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t, "public-sync");
    await asUser(t, userId).mutation(api.companies.index.updatePublicProfile, validUpdate);
    expect((await asUser(t, userId).query(api.companies.index.getProfileManager, {})).name).toBe("Atlas Public Construction");

    const publicProfile = await t.query(api.portfolio.index.getPublicCompanyProfile, {
      slug: "public-sync-company",
    });
    expect(publicProfile).toMatchObject({
      name: "At*** Pu**** Co**********",
      city: "Casablanca",
      foundedYear: 2010,
      companySize: "11to50",
      languages: ["arabic", "french", "english"],
      serviceAreas: ["casablanca", "agadir", "marrakech"],
      services: ["houseConstruction", "renovation"],
    });
    expect(publicProfile).not.toHaveProperty("phone");
    expect(publicProfile).not.toHaveProperty("email");

    const directory = await t.query(api.companies.directory.listPublicCompanies, {
      paginationOpts: { numItems: 12, cursor: null },
      search: "Agadir",
      city: undefined,
      service: undefined,
      verifiedOnly: false,
      sort: "relevance",
    });
    expect(directory.page).toHaveLength(1);
    expect(directory.page[0]).toMatchObject({
      slug: "public-sync-company",
      name: "At*** Pu**** Co**********",
      city: "Casablanca",
      services: ["houseConstruction", "renovation"],
      serviceAreas: ["casablanca", "agadir", "marrakech"],
    });
  });
});
