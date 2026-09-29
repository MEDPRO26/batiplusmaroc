/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

async function seedUser(t: Backend, accountType: "admin" | "client" | "company" | "seo_team", name: string) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${name.toLowerCase()}-${crypto.randomUUID()}@companies.test`,
    firstName: name,
    lastName: "Test",
    accountType,
    onboardingStatus: "completed",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function seedCompany(
  t: Backend,
  name: string,
  verificationStatus: "draft" | "pending" | "verified" | "rejected" = "verified",
  onboardingStatus: "pending" | "completed" = "completed",
  updatedAt = 1,
) {
  return await t.run((ctx) => ctx.db.insert("companies", {
    name,
    legalName: `${name} SARL`,
    city: "Rabat",
    description: `${name} description`,
    directorySearchText: `${name.toLowerCase()} rabat renovation`,
    onboardingStatus,
    verificationStatus,
    createdAt: 1,
    updatedAt,
  }));
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

function listArgs(numItems = 20, cursor: string | null = null) {
  return { paginationOpts: { numItems, cursor } };
}

describe("admin company operations authorization", () => {
  test("allows Admin and denies anonymous, Client, Company and SEO users", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompany(t, "Atlas");
    const admin = await seedUser(t, "admin", "Admin");
    const denied = await Promise.all([
      seedUser(t, "client", "Client"),
      seedUser(t, "company", "Company"),
      seedUser(t, "seo_team", "SEO"),
    ]);

    await expect(t.query(api.admin.companies.listCompanies, listArgs())).rejects.toThrow("NOT_AUTHENTICATED");
    for (const userId of denied) {
      await expect(asUser(t, userId).query(api.admin.companies.getCompanySummary, { companyId })).rejects.toThrow("ADMIN_REQUIRED");
      await expect(asUser(t, userId).query(api.admin.companies.listCompanyProjectsDeals, { companyId, ...listArgs() })).rejects.toThrow("ADMIN_REQUIRED");
      await expect(asUser(t, userId).query(api.admin.companies.listCompanyReviews, { companyId, ...listArgs() })).rejects.toThrow("ADMIN_REQUIRED");
    }
    await expect(asUser(t, admin).query(api.admin.companies.getCompanySummary, { companyId })).resolves.toMatchObject({ companyId, name: "Atlas" });
  });
});

describe("admin company list and summary", () => {
  test("rejects invalid and unbounded Company and review page sizes", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const companyId = await seedCompany(t, "Atlas");
    const admin = asUser(t, adminId);

    for (const numItems of [0, 51, 1.5, Number.NaN]) {
      await expect(admin.query(api.admin.companies.listCompanies, listArgs(numItems)))
        .rejects.toThrow("INVALID_ADMIN_COMPANY_PAGE_SIZE");
    }
    for (const numItems of [0, 31, 1.5, Number.NaN]) {
      await expect(admin.query(api.admin.companies.listCompanyReviews, {
        companyId,
        ...listArgs(numItems),
      })).rejects.toThrow("INVALID_ADMIN_COMPANY_REVIEW_PAGE_SIZE");
    }
  });

  test("paginates, searches and filters every verification/onboarding state", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedUser(t, "admin", "Admin");
    await seedCompany(t, "Draft Works", "draft", "pending", 10);
    await seedCompany(t, "Pending Works", "pending", "completed", 20);
    await seedCompany(t, "Verified Atlas", "verified", "completed", 30);
    await seedCompany(t, "Rejected Works", "rejected", "pending", 40);

    const first = await asUser(t, admin).query(api.admin.companies.listCompanies, listArgs(2));
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    const second = await asUser(t, admin).query(api.admin.companies.listCompanies, listArgs(2, first.continueCursor));
    expect(new Set([...first.page, ...second.page].map((row) => row.name)).size).toBe(4);

    const verified = await asUser(t, admin).query(api.admin.companies.listCompanies, {
      ...listArgs(), verificationStatus: "verified", onboardingStatus: "completed",
    });
    expect(verified.page.map((row) => row.name)).toEqual(["Verified Atlas"]);
    const search = await asUser(t, admin).query(api.admin.companies.listCompanies, { ...listArgs(), search: "atlas" });
    expect(search.page.map((row) => row.name)).toEqual(["Verified Atlas"]);
  });

  test("exposes and filters marketplace operational status, treating a missing value as normal", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedUser(t, "admin", "Admin");
    await seedCompany(t, "Normal Works", "verified");
    const flagged = await seedCompany(t, "Flagged Atlas", "pending");
    const suspended = await seedCompany(t, "Suspended Works", "verified");
    await t.run(async (ctx) => {
      await ctx.db.patch(flagged, { operationalStatus: "needs_attention" });
      await ctx.db.patch(suspended, { operationalStatus: "suspended" });
    });
    const query = (extra: Record<string, unknown>) =>
      asUser(t, admin).query(api.admin.companies.listCompanies, { ...listArgs(), ...extra });

    const all = await query({});
    expect(Object.fromEntries(all.page.map((row) => [row.name, row.operationalStatus]))).toEqual({
      "Normal Works": "normal",
      "Flagged Atlas": "needs_attention",
      "Suspended Works": "suspended",
    });
    expect((await query({ operationalStatus: "needs_attention" })).page.map((row) => row.name)).toEqual(["Flagged Atlas"]);
    expect((await query({ operationalStatus: "suspended", verificationStatus: "pending" })).page).toEqual([]);
    expect((await query({ operationalStatus: "needs_attention", search: "atlas" })).page.map((row) => row.name)).toEqual(["Flagged Atlas"]);
    await expect(t.query(api.admin.companies.listCompanies, { ...listArgs(), operationalStatus: "suspended" }))
      .rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("loads draft, pending, verified and rejected companies and returns a safe missing result", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedUser(t, "admin", "Admin");
    const ids = await Promise.all(([
      ["Draft", "draft"], ["Pending", "pending"], ["Verified", "verified"], ["Rejected", "rejected"],
    ] as const).map(([name, status]) => seedCompany(t, name, status)));
    for (const [index, companyId] of ids.entries()) {
      const summary = await asUser(t, admin).query(api.admin.companies.getCompanySummary, { companyId });
      expect(summary?.verificationStatus).toBe(["draft", "pending", "verified", "rejected"][index]);
      expect(JSON.stringify(summary)).not.toContain("@companies.test");
    }
    const removed = await seedCompany(t, "Removed");
    await t.run((ctx) => ctx.db.delete(removed));
    await expect(asUser(t, admin).query(api.admin.companies.getCompanySummary, { companyId: removed })).resolves.toBeNull();
    await expect(asUser(t, admin).query(api.admin.companies.listCompanyProjectsDeals, {
      companyId: removed,
      ...listArgs(),
    })).rejects.toThrow("COMPANY_NOT_FOUND");
    await expect(asUser(t, admin).query(api.admin.companies.listCompanyReviews, {
      companyId: removed,
      ...listArgs(),
    })).rejects.toThrow("COMPANY_NOT_FOUND");

    const wrongTableId = await seedUser(t, "client", "WrongTable");
    await expect(asUser(t, admin).query(api.admin.companies.getCompanySummary, {
      companyId: wrongTableId as unknown as Id<"companies">,
    })).rejects.toThrow();
  });
});

describe("admin company marketplace isolation", () => {
  test("returns only the selected company's project relationships without private quote or invitation copy", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedUser(t, "admin", "Admin");
    const client = await seedUser(t, "client", "Client");
    const companyUser = await seedUser(t, "company", "Member");
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");
    const projectIds = await Promise.all(["A project", "B project"].map((title, index) => t.run((ctx) => ctx.db.insert("projects", {
      clientId: client, primaryCategory: "renovation", city: "rabat", countryCode: "MA", title,
      propertyType: "apartment", surface: 90, surfaceUnknown: false, description: `${title} description`,
      timeline: "one_to_three_months", visibility: "marketplace", status: "published", lastCompletedStep: 6,
      createdAt: index + 1, updatedAt: index + 1, submittedAt: index + 1, publishedAt: index + 1,
    }))));
    await t.run(async (ctx) => {
      await ctx.db.insert("projectQuotes", {
        projectId: projectIds[0], companyId: companyA, submittedByUserId: companyUser,
        message: "private proposal message", estimatedPrice: 1000, currency: "MAD", estimatedDuration: 10,
        availableStartDate: "2026-10-01", scope: "private scope", quoteType: "initial", status: "submitted",
        createdAt: 20, updatedAt: 20, submittedAt: 20,
      });
      await ctx.db.insert("invitations", {
        projectId: projectIds[1], clientUserId: client, companyId: companyB,
        message: "private invitation message", status: "pending", createdAt: 30, updatedAt: 30,
      });
    });

    const result = await asUser(t, admin).query(api.admin.companies.listCompanyProjectsDeals, { companyId: companyA, ...listArgs() });
    expect(result.page).toHaveLength(1);
    expect(result.page[0]).toMatchObject({ companyId: companyA, projectTitle: "A project", source: "proposal" });
    expect(JSON.stringify(result.page)).not.toContain("private proposal message");
    expect(JSON.stringify(result.page)).not.toContain("private scope");
    expect(JSON.stringify(result.page)).not.toContain("private invitation message");
    expect(result.page.every((row) => row.companyId === companyA)).toBe(true);
  });
});
