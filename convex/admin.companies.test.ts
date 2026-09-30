/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
type ProjectsDealsPage = FunctionReturnType<
  typeof api.admin.companies.listCompanyProjectsDeals
>;

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

  test("includes legacy and explicit normal Companies across Admin filter paths", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    await seedCompany(t, "Legacy Atlas");
    const explicitNormal = await seedCompany(t, "Explicit Atlas");
    await seedCompany(t, "Legacy Review", "pending");
    await seedCompany(t, "Legacy Draft", "draft", "pending");
    const attention = await seedCompany(t, "Attention Atlas");
    const suspended = await seedCompany(t, "Suspended Atlas");
    await t.run(async (ctx) => {
      await ctx.db.patch(explicitNormal, { operationalStatus: "normal" });
      await ctx.db.patch(attention, { operationalStatus: "needs_attention" });
      await ctx.db.patch(suspended, { operationalStatus: "suspended" });
    });

    const admin = asUser(t, adminId);
    const names = async (filters: Record<string, string>) =>
      (await admin.query(api.admin.companies.listCompanies, { ...listArgs(), ...filters }))
        .page.map((row) => row.name).sort();

    expect(await names({ operationalStatus: "normal" })).toEqual([
      "Explicit Atlas", "Legacy Atlas", "Legacy Draft", "Legacy Review",
    ]);
    expect(await names({ operationalStatus: "normal", search: "atlas" })).toEqual([
      "Explicit Atlas", "Legacy Atlas",
    ]);
    expect(await names({ operationalStatus: "normal", onboardingStatus: "completed" })).toEqual([
      "Explicit Atlas", "Legacy Atlas", "Legacy Review",
    ]);
    expect(await names({ operationalStatus: "normal", verificationStatus: "verified" })).toEqual([
      "Explicit Atlas", "Legacy Atlas",
    ]);
    expect(await names({ operationalStatus: "normal", onboardingStatus: "completed", verificationStatus: "verified" })).toEqual([
      "Explicit Atlas", "Legacy Atlas",
    ]);
    expect(await names({ operationalStatus: "normal", search: "review", onboardingStatus: "completed", verificationStatus: "pending" })).toEqual([
      "Legacy Review",
    ]);
    expect(await names({ operationalStatus: "needs_attention" })).toEqual(["Attention Atlas"]);
    expect(await names({ operationalStatus: "suspended" })).toEqual(["Suspended Atlas"]);
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

  test("advances past filtered invitations without starving older eligible project history", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const clientId = await seedUser(t, "client", "Client");
    const companyUserId = await seedUser(t, "company", "Member");
    const companyId = await seedCompany(t, "Cursor Company");
    const seeded = await t.run(async (ctx) => {
      const quoteProjectIds: Id<"projects">[] = [];
      const quoteIds: Id<"projectQuotes">[] = [];
      for (let index = 0; index < 2; index += 1) {
        const quoteCreatedAt = 30_000 - index * 20_000;
        const projectId = await ctx.db.insert("projects", {
          clientId,
          title: `Quoted project ${index}`,
          countryCode: "MA",
          surfaceUnknown: true,
          visibility: "marketplace",
          status: "published",
          lastCompletedStep: 6,
          createdAt: quoteCreatedAt,
          updatedAt: quoteCreatedAt,
        });
        quoteProjectIds.push(projectId);
        quoteIds.push(await ctx.db.insert("projectQuotes", {
          projectId,
          companyId,
          submittedByUserId: companyUserId,
          message: `Private proposal ${index}`,
          estimatedPrice: 100_000 + index,
          currency: "MAD",
          estimatedDuration: 30,
          availableStartDate: "2099-01-01",
          scope: `Private scope ${index}`,
          quoteType: "initial",
          status: "submitted",
          createdAt: quoteCreatedAt,
          updatedAt: quoteCreatedAt,
          submittedAt: quoteCreatedAt,
        }));
      }

      const filteredInvitationIds: Id<"invitations">[] = [];
      for (let index = 0; index < 125; index += 1) {
        filteredInvitationIds.push(await ctx.db.insert("invitations", {
          projectId: quoteProjectIds[index % quoteProjectIds.length],
          clientUserId: clientId,
          companyId,
          message: `Private duplicate invitation ${index}`,
          status: "pending",
          createdAt: 20_000 - index,
          updatedAt: 20_000 - index,
        }));
      }

      const invitationOnlyProjectId = await ctx.db.insert("projects", {
        clientId,
        title: "Older invitation-only project",
        countryCode: "MA",
        surfaceUnknown: true,
        visibility: "marketplace",
        status: "published",
        lastCompletedStep: 6,
        createdAt: 15_000,
        updatedAt: 15_000,
      });
      const eligibleInvitationId = await ctx.db.insert("invitations", {
        projectId: invitationOnlyProjectId,
        clientUserId: clientId,
        companyId,
        message: "Private eligible invitation",
        status: "pending",
        createdAt: 15_000,
        updatedAt: 15_000,
      });
      return {
        eligibleInvitationId,
        filteredInvitationIds,
        invitationOnlyProjectId,
        quoteIds,
        quoteProjectIds,
      };
    });

    const pages: ProjectsDealsPage[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page: ProjectsDealsPage = await asUser(t, adminId).query(
        api.admin.companies.listCompanyProjectsDeals,
        { companyId, ...listArgs(2, cursor) },
      );
      pages.push(page);
      if (page.isDone) break;
      expect(page.continueCursor).not.toBe(cursor);
      expect(seenCursors.has(page.continueCursor)).toBe(false);
      seenCursors.add(page.continueCursor);
      cursor = page.continueCursor;
    }

    expect(pages.at(-1)?.isDone).toBe(true);
    const firstCursor = JSON.parse(pages[0].continueCursor) as {
      invitations: { beforeAt: number | null };
    };
    expect(firstCursor.invitations.beforeAt).not.toBeNull();

    const rows = pages.flatMap((page) => page.page);
    expect(rows.map((row) => row.createdAt)).toEqual([30_000, 15_000, 10_000]);
    expect(rows.map((row) => row.projectId)).toEqual([
      seeded.quoteProjectIds[0],
      seeded.invitationOnlyProjectId,
      seeded.quoteProjectIds[1],
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows.filter((row) => row.initialQuoteStatus !== null).map((row) => row.id))
      .toEqual(seeded.quoteIds.map((quoteId) => `quote:${quoteId}`));
    expect(rows.filter((row) => row.initialQuoteStatus === null).map((row) => row.id))
      .toEqual([`invitation:${seeded.eligibleInvitationId}`]);
    for (const invitationId of seeded.filteredInvitationIds) {
      expect(rows.map((row) => row.id)).not.toContain(`invitation:${invitationId}`);
    }
    expect(JSON.stringify(rows)).not.toContain("Private duplicate invitation");
    expect(JSON.stringify(rows)).not.toContain("Private eligible invitation");
  });

  test("carries eligible invitations while advancing the raw cursor past filtered rows", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const clientId = await seedUser(t, "client", "Client");
    const companyUserId = await seedUser(t, "company", "Member");
    const companyId = await seedCompany(t, "Pending Cursor Company");
    const seeded = await t.run(async (ctx) => {
      const quoteProjectId = await ctx.db.insert("projects", {
        clientId,
        title: "Newest quoted project",
        countryCode: "MA",
        surfaceUnknown: true,
        visibility: "marketplace",
        status: "published",
        lastCompletedStep: 6,
        createdAt: 300,
        updatedAt: 300,
      });
      const quoteId = await ctx.db.insert("projectQuotes", {
        projectId: quoteProjectId,
        companyId,
        submittedByUserId: companyUserId,
        message: "Private proposal",
        estimatedPrice: 100_000,
        currency: "MAD",
        estimatedDuration: 30,
        availableStartDate: "2099-01-01",
        scope: "Private scope",
        quoteType: "initial",
        status: "submitted",
        createdAt: 300,
        updatedAt: 300,
        submittedAt: 300,
      });
      const invitationIds: Id<"invitations">[] = [];
      for (const [index, createdAt] of [250, 230].entries()) {
        const projectId = await ctx.db.insert("projects", {
          clientId,
          title: `Invitation-only project ${index}`,
          countryCode: "MA",
          surfaceUnknown: true,
          visibility: "marketplace",
          status: "published",
          lastCompletedStep: 6,
          createdAt,
          updatedAt: createdAt,
        });
        invitationIds.push(await ctx.db.insert("invitations", {
          projectId,
          clientUserId: clientId,
          companyId,
          message: `Private eligible invitation ${index}`,
          status: "pending",
          createdAt,
          updatedAt: createdAt,
        }));
      }
      const filteredInvitationId = await ctx.db.insert("invitations", {
        projectId: quoteProjectId,
        clientUserId: clientId,
        companyId,
        message: "Private filtered invitation",
        status: "pending",
        createdAt: 240,
        updatedAt: 240,
      });
      return { filteredInvitationId, invitationIds, quoteId };
    });

    const pages: ProjectsDealsPage[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const page: ProjectsDealsPage = await asUser(t, adminId).query(
        api.admin.companies.listCompanyProjectsDeals,
        { companyId, ...listArgs(1, cursor) },
      );
      pages.push(page);
      if (page.isDone) break;
      expect(page.continueCursor).not.toBe(cursor);
      expect(seenCursors.has(page.continueCursor)).toBe(false);
      seenCursors.add(page.continueCursor);
      cursor = page.continueCursor;
    }

    const firstCursor = JSON.parse(pages[0].continueCursor) as {
      invitations: { done: boolean };
      pendingInvitationIds: string[];
    };
    expect(firstCursor.invitations.done).toBe(true);
    expect(firstCursor.pendingInvitationIds).toEqual(seeded.invitationIds);
    expect(pages.at(-1)?.isDone).toBe(true);

    const rows = pages.flatMap((page) => page.page);
    expect(rows.map((row) => row.createdAt)).toEqual([300, 250, 230]);
    expect(rows.map((row) => row.id)).toEqual([
      `quote:${seeded.quoteId}`,
      ...seeded.invitationIds.map((id) => `invitation:${id}`),
    ]);
    expect(rows.map((row) => row.id)).not.toContain(
      `invitation:${seeded.filteredInvitationId}`,
    );
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  test("rejects pending invitation cursor IDs from another company", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const clientId = await seedUser(t, "client", "Client");
    const companyA = await seedCompany(t, "Cursor Company A");
    const companyB = await seedCompany(t, "Cursor Company B");
    const projectId = await t.run((ctx) => ctx.db.insert("projects", {
      clientId,
      title: "Foreign pending invitation",
      countryCode: "MA",
      surfaceUnknown: true,
      visibility: "marketplace",
      status: "published",
      lastCompletedStep: 6,
      createdAt: 1,
      updatedAt: 1,
    }));
    const foreignInvitationId = await t.run((ctx) => ctx.db.insert("invitations", {
      projectId,
      clientUserId: clientId,
      companyId: companyB,
      status: "pending",
      createdAt: 1,
      updatedAt: 1,
    }));
    const sourceCursor = {
      beforeAt: null,
      beforeCreationTime: null,
      beforeId: null,
      done: true,
    };
    const forgedCursor = JSON.stringify({
      version: 2,
      quotes: sourceCursor,
      invitations: sourceCursor,
      pendingInvitationIds: [foreignInvitationId],
    });

    await expect(asUser(t, adminId).query(
      api.admin.companies.listCompanyProjectsDeals,
      { companyId: companyA, ...listArgs(1, forgedCursor) },
    )).rejects.toThrow("INVALID_ADMIN_COMPANY_PROJECT_CURSOR");
  });

  test("accepts in-flight version-one project history cursors", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const companyId = await seedCompany(t, "Legacy Cursor Company");
    const sourceCursor = {
      beforeAt: null,
      beforeCreationTime: null,
      beforeId: null,
      done: false,
    };
    const legacyCursor = JSON.stringify({
      version: 1,
      quotes: sourceCursor,
      invitations: sourceCursor,
    });

    const page = await asUser(t, adminId).query(
      api.admin.companies.listCompanyProjectsDeals,
      { companyId, ...listArgs(1, legacyCursor) },
    );
    expect(page).toMatchObject({ page: [], isDone: true });
    expect(JSON.parse(page.continueCursor)).toMatchObject({
      version: 2,
      pendingInvitationIds: [],
    });
  });
});
