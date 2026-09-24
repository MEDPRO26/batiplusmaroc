/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
});

type TestBackend = ReturnType<typeof convexTest>;

async function seedCompany(
  t: TestBackend,
  options?: {
    accountType?: "client" | "company";
    role?: "owner" | "staff";
    status?: "active" | "inactive";
    withMembership?: boolean;
    verificationStatus?: "draft" | "pending" | "verified" | "rejected";
  },
) {
  return await t.run(async (ctx) => {
    const now = 123;
    const accountType = options?.accountType ?? "company";
    const userId = await ctx.db.insert("users", {
      email: `${accountType}@example.test`,
      firstName: "Existing",
      lastName: "Owner",
      accountType,
      countryCode: "MA",
      acceptedTerms: true,
      termsAcceptedAt: now,
      marketingOptIn: false,
      onboardingStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Existing Company",
      legalName: "Existing Company SARL",
      phone: "0611111111",
      city: "Rabat",
      description: "An existing construction company profile.",
      yearsExperience: 8,
      website: "https://existing.example/",
      onboardingStatus: "pending",
      verificationStatus: options?.verificationStatus ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
    let membershipId: Id<"companyMembers"> | null = null;
    if (options?.withMembership !== false) {
      membershipId = await ctx.db.insert("companyMembers", {
        companyId,
        userId,
        role: options?.role ?? "owner",
        status: options?.status ?? "active",
        createdAt: now,
      });
    }
    await ctx.db.insert("companyServices", {
      companyId,
      service: "structural",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, companyId, membershipId };
  });
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
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
      expectedSize: 100,
      objectKey: `companies/${companyId}/${purpose === "companyLogo" ? "logo" : "cover"}/${crypto.randomUUID()}.webp`,
      token: uploadToken,
      expiresAt: Date.now() + 60_000,
      verifiedAt: Date.now(),
      createdAt: Date.now(),
    });
    return uploadToken;
  });
}

type CompleteOnboardingArgs = FunctionArgs<typeof api.companies.index.completeOnboarding>;

const validInput: CompleteOnboardingArgs = {
  name: "Atlas Construction",
  legalName: "Atlas Construction SARL",
  phone: "+212 6 12 34 56 78",
  city: "Casablanca",
  description: "Construction and renovation services for residential projects.",
  services: ["houseConstruction", "renovation"],
  yearsExperience: 12,
  website: "atlas-construction.ma",
};

describe("company onboarding", () => {
  test("loads owner, company, and selected services for prefilling", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t);

    const profile = await asUser(t, userId).query(api.companies.index.getOnboardingProfile, {});
    expect(profile).toMatchObject({
      ownerFirstName: "Existing",
      ownerLastName: "Owner",
      name: "Existing Company",
      legalName: "Existing Company SARL",
      phone: "0611111111",
      city: "Rabat",
      description: "An existing construction company profile.",
      yearsExperience: 8,
      website: "https://existing.example/",
      services: ["structural"],
      onboardingStatus: "pending",
      verificationStatus: "draft",
    });
    expect(profile?.serviceOptions).toContain("houseConstruction");
  });

  test("rejects unauthenticated and client callers", async () => {
    const t = convexTest(schema, modules);
    const { userId: clientId } = await seedCompany(t, { accountType: "client" });

    await expect(t.mutation(api.companies.index.completeOnboarding, validInput)).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
    await expect(
      asUser(t, clientId).mutation(api.companies.index.completeOnboarding, validInput),
    ).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
  });

  test("requires one active owner membership", async () => {
    for (const options of [
      { role: "staff" as const },
      { status: "inactive" as const },
      { withMembership: false as const },
    ]) {
      const t = convexTest(schema, modules);
      const { userId } = await seedCompany(t, options);
      await expect(
        asUser(t, userId).mutation(api.companies.index.completeOnboarding, validInput),
      ).rejects.toThrow(
        options.withMembership === false ? "COMPANY_MEMBERSHIP_REQUIRED" : "COMPANY_OWNER_REQUIRED",
      );
    }
  });

  test("saves company fields and services while keeping verification draft", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);

    await expect(
      asUser(t, userId).mutation(api.companies.index.completeOnboarding, validInput),
    ).resolves.toEqual({ onboardingStatus: "completed" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      company: await ctx.db.get(companyId),
      services: await ctx.db
        .query("companyServices")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .take(20),
      memberships: await ctx.db
        .query("companyMembers")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(2),
    }));

    expect(state.user).toMatchObject({ onboardingStatus: "completed" });
    expect(state.user?.updatedAt).toEqual(expect.any(Number));
    expect(state.company).toMatchObject({
      name: "Atlas Construction",
      legalName: "Atlas Construction SARL",
      phone: "+212612345678",
      city: "Casablanca",
      description: "Construction and renovation services for residential projects.",
      yearsExperience: 12,
      website: "https://atlas-construction.ma/",
      onboardingStatus: "completed",
      verificationStatus: "draft",
    });
    expect(state.company?.updatedAt).toEqual(expect.any(Number));
    expect(state.company?.directorySearchText).toContain("atlas construction");
    expect(state.company?.directorySearchText).toContain("casablanca");
    expect(state.company?.directorySearchText).toContain("servicerenovation");
    expect(state.services.map((item) => item.service).sort()).toEqual([
      "houseConstruction",
      "renovation",
    ]);
    expect(state.memberships).toHaveLength(1);
  });

  test("stores new logos and company covers as R2 metadata", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    const owner = asUser(t, userId);
    const logoUploadToken = await uploadedCompanyImage(t, userId, companyId, "companyLogo");
    await owner.mutation(api.companies.index.completeOnboarding, {
      ...validInput,
      logoUploadToken,
    });
    const coverUploadToken = await uploadedCompanyImage(t, userId, companyId, "companyCover");
    await owner.mutation(api.companies.index.setCompanyPublicImage, {
      kind: "cover",
      uploadToken: coverUploadToken,
    });

    const state = await t.run(async (ctx) => {
      const company = await ctx.db.get(companyId);
      return {
        company,
        logo: company?.logoMediaId ? await ctx.db.get(company.logoMediaId) : null,
        cover: company?.coverMediaId ? await ctx.db.get(company.coverMediaId) : null,
      };
    });
    expect(state.company?.logoStorageId).toBeUndefined();
    expect(state.logo).toMatchObject({ storageProvider: "r2", purpose: "companyLogo", uploadedBy: userId });
    expect(state.cover).toMatchObject({ storageProvider: "r2", purpose: "companyCover", uploadedBy: userId });
    const profile = await owner.query(api.companies.index.getOnboardingProfile, {});
    expect(profile?.logoUrl).toContain("https://media.example.test/companies/");
  });

  test("re-submission updates the same company and relationship rows", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    const owner = asUser(t, userId);

    await owner.mutation(api.companies.index.completeOnboarding, validInput);
    await owner.mutation(api.companies.index.completeOnboarding, {
      ...validInput,
      name: "Atlas Bâtiment",
      city: "Agadir",
      services: ["architecture", "interior"],
    });

    const state = await t.run(async (ctx) => ({
      companies: [await ctx.db.get(companyId)].filter(Boolean),
      allCompanies: await ctx.db.query("companies").take(10),
      memberships: await ctx.db
        .query("companyMembers")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(2),
      services: await ctx.db
        .query("companyServices")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .take(20),
    }));

    expect(state.companies).toHaveLength(1);
    expect(state.allCompanies).toHaveLength(1);
    expect(state.companies[0]).toMatchObject({ name: "Atlas Bâtiment", city: "Agadir" });
    expect(state.memberships).toHaveLength(1);
    expect(state.services.map((item) => item.service).sort()).toEqual([
      "architecture",
      "interior",
    ]);
  });

  test("fails closed for duplicate memberships", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    await t.run((ctx) =>
      ctx.db.insert("companyMembers", {
        companyId,
        userId,
        role: "owner",
        status: "active",
        createdAt: 456,
      }),
    );

    await expect(
      asUser(t, userId).mutation(api.companies.index.completeOnboarding, validInput),
    ).rejects.toThrow("DUPLICATE_ACCOUNT_FOUNDATION");
  });

  test("does not allow onboarding to change a non-draft verification state", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, { verificationStatus: "pending" });

    await expect(
      asUser(t, userId).mutation(api.companies.index.completeOnboarding, validInput),
    ).rejects.toThrow("INVALID_VERIFICATION_STATUS");
    const company = await t.run((ctx) => ctx.db.get(companyId));
    expect(company?.verificationStatus).toBe("pending");
    expect(company?.onboardingStatus).toBe("pending");
  });

  test("validates phone, city, services, description, website, and experience", async () => {
    const cases: Array<[CompleteOnboardingArgs, string]> = [
      [{ ...validInput, phone: "123" }, "INVALID_PHONE"],
      [{ ...validInput, city: "!" }, "INVALID_CITY"],
      [{ ...validInput, services: [] }, "INVALID_SERVICES"],
      [{ ...validInput, services: ["renovation", "renovation"] }, "INVALID_SERVICES"],
      [{ ...validInput, description: "Too short" }, "INVALID_DESCRIPTION"],
      [{ ...validInput, website: "javascript:alert(1)" }, "INVALID_WEBSITE"],
      [{ ...validInput, yearsExperience: 2.5 }, "INVALID_YEARS_EXPERIENCE"],
    ];

    for (const [input, error] of cases) {
      const t = convexTest(schema, modules);
      const { userId } = await seedCompany(t);
      await expect(
        asUser(t, userId).mutation(api.companies.index.completeOnboarding, input),
      ).rejects.toThrow(error);
    }

    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t);
    await expect(
      asUser(t, userId).mutation(api.companies.index.completeOnboarding, {
        ...validInput,
        services: ["not-a-service"],
      } as never),
    ).rejects.toThrow();
  });
});
