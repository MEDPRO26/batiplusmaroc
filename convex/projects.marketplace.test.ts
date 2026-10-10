/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildProjectMarketplaceSearchText } from "./projects/marketplaceSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestBackend = ReturnType<typeof convexTest>;
type ProjectStatus = "draft" | "pending_review" | "needs_changes" | "published" | "cancelled" | "archived";

async function seedUser(t: TestBackend, accountType: "client" | "company", suffix: string, onboardingStatus: "pending" | "completed" = "completed") {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${suffix}@private.test`,
    phone: "+212600000000",
    firstName: accountType === "client" ? "Samir" : "Sara",
    lastName: accountType === "client" ? "Client" : "Company",
    accountType,
    onboardingStatus,
    countryCode: "MA",
    createdAt: 10,
    updatedAt: 10,
  }));
}

async function seedCompany(
  t: TestBackend,
  verificationStatus: "draft" | "pending" | "verified" = "verified",
  onboardingStatus: "pending" | "completed" = "completed",
  operationalStatus?: "normal" | "needs_attention" | "suspended",
) {
  const userId = await seedUser(t, "company", crypto.randomUUID(), onboardingStatus);
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name: "Atlas Build",
    city: "rabat",
    description: "A completed construction company profile.",
    onboardingStatus,
    verificationStatus,
    operationalStatus,
    createdAt: 10,
    updatedAt: 10,
  }));
  await t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId,
    userId,
    role: "owner",
    status: "active",
    createdAt: 10,
  }));
  return { userId, companyId };
}

async function seedProject(t: TestBackend, clientId: Id<"users">, options?: {
  title?: string;
  status?: ProjectStatus;
  visibility?: "marketplace" | "invite_only";
  city?: "rabat" | "agadir";
  category?: "renovation" | "architecture";
  timeline?: "asap" | "one_to_three_months" | "flexible";
  propertyType?: "apartment" | "house" | "building";
  surface?: number;
  surfaceUnknown?: boolean;
  publishedAt?: number;
}) {
  const project = {
    clientId,
    primaryCategory: options?.category ?? "renovation" as const,
    city: options?.city ?? "rabat" as const,
    neighborhood: "Agdal",
    countryCode: "MA" as const,
    title: options?.title ?? "Renovation appartement Agdal",
    propertyType: options?.propertyType ?? "apartment" as const,
    surface: options?.surfaceUnknown ? undefined : (options?.surface ?? 95),
    surfaceUnknown: options?.surfaceUnknown ?? false,
    description: "Renovation complete with electrical and plumbing work.",
    timeline: options?.timeline ?? "one_to_three_months" as const,
    visibility: options?.visibility ?? "marketplace" as const,
    status: options?.status ?? "published" as ProjectStatus,
    lastCompletedStep: 5,
    createdAt: options?.publishedAt ?? 100,
    updatedAt: options?.publishedAt ?? 100,
    submittedAt: 50,
    publishedAt: options?.publishedAt ?? 100,
  };
  return await t.run((ctx) => ctx.db.insert("projects", {
    ...project,
    marketplaceSearchText: buildProjectMarketplaceSearchText(project),
  }));
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

describe("company project marketplace authorization and visibility", () => {
  test("allows completed companies while blocking unauthenticated, client, and incomplete company callers", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client");
    const company = await seedCompany(t);
    const incomplete = await seedCompany(t, "draft", "pending");

    await expect(t.query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage)).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(t, clientId).query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage)).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    await expect(asUser(t, incomplete.userId).query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage)).rejects.toThrow("COMPANY_ONBOARDING_REQUIRED");
    await expect(asUser(t, company.userId).query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage)).resolves.toMatchObject({ page: [] });
  });

  test("returns only published marketplace projects and reacts when eligibility changes", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client");
    const company = await seedCompany(t);
    const visibleId = await seedProject(t, clientId, { title: "Visible project", status: "published" });
    for (const status of ["draft", "pending_review", "needs_changes", "cancelled", "archived"] as const) {
      await seedProject(t, clientId, { title: `Hidden ${status}`, status });
    }
    await seedProject(t, clientId, { title: "Private invitation", visibility: "invite_only" });

    const caller = asUser(t, company.userId);
    const before = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage);
    expect(before.page.map((project) => project.id)).toEqual([visibleId]);

    await t.run((ctx) => ctx.db.patch(visibleId, { status: "cancelled" }));
    const after = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage);
    expect(after.page).toEqual([]);
  });
});

describe("company project marketplace discovery", () => {
  test("discovers and opens a published Project", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "no-budget-client");
    const company = await seedCompany(t);
    const projectId = await seedProject(t, clientId, {
      title: "No-budget renovation",
      publishedAt: 400,
    });
    const caller = asUser(t, company.userId);

    const listing = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage);
    expect(listing.page).toEqual([expect.objectContaining({ id: projectId })]);
    const detail = await caller.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId });
    expect(detail).toMatchObject({ id: projectId, canSubmitQuote: true });
  });

  test("filters by city, category and search", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client");
    const company = await seedCompany(t);
    const rabatId = await seedProject(t, clientId, { title: "Rabat modern renovation", city: "rabat", category: "renovation", publishedAt: 300 });
    const agadirId = await seedProject(t, clientId, { title: "Agadir villa plans", city: "agadir", category: "architecture", publishedAt: 200 });
    const caller = asUser(t, company.userId);

    const all = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, firstPage);
    expect(all.page.map((project) => project.id)).toEqual([rabatId, agadirId]);
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, city: "agadir" })).resolves.toMatchObject({ page: [expect.objectContaining({ id: agadirId })] });
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, category: "renovation" })).resolves.toMatchObject({ page: [expect.objectContaining({ id: rabatId })] });
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, cities: ["agadir"] })).resolves.toMatchObject({ page: [expect.objectContaining({ id: agadirId })] });
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, cities: [] })).resolves.toMatchObject({ page: [] });
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, categories: ["renovation", "architecture"] })).resolves.toMatchObject({ page: [expect.objectContaining({ id: rabatId }), expect.objectContaining({ id: agadirId })] });
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, search: "villa", categories: ["renovation", "architecture"] })).resolves.toMatchObject({ page: [expect.objectContaining({ id: agadirId })] });
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, search: "villa" })).resolves.toMatchObject({ page: [expect.objectContaining({ id: agadirId })] });
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, search: "architecture" })).resolves.toMatchObject({ page: [expect.objectContaining({ id: agadirId })] });
    await expect(caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { ...firstPage, search: "rabat" })).resolves.toMatchObject({ page: [expect.objectContaining({ id: rabatId })] });
  });

  test("paginates without duplicates", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client");
    const company = await seedCompany(t);
    for (let index = 0; index < 5; index += 1) {
      await seedProject(t, clientId, { title: `Project ${index}`, publishedAt: 100 + index });
    }
    const caller = asUser(t, company.userId);
    const first = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { paginationOpts: { numItems: 2, cursor: null } });
    const second = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, { paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect(first.page).toHaveLength(2);
    expect(second.page).toHaveLength(2);
    const ids = [...first.page, ...second.page].map((project) => project.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.isDone).toBe(false);
  });

  test("filters by timeline, property type, surface, posted date and combines filters", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client");
    const company = await seedCompany(t);
    const now = 1_700_000_000_000;
    const matchId = await seedProject(t, clientId, {
      title: "Agadir renovation match",
      city: "agadir",
      category: "renovation",
      timeline: "one_to_three_months",
      propertyType: "house",
      surface: 150,
      publishedAt: now - 2 * 24 * 60 * 60 * 1000,
    });
    await seedProject(t, clientId, {
      title: "Wrong timeline",
      city: "agadir",
      category: "renovation",
      timeline: "asap",
      propertyType: "house",
      surface: 150,
      publishedAt: now - 2 * 24 * 60 * 60 * 1000,
    });
    await seedProject(t, clientId, {
      title: "Wrong property",
      city: "agadir",
      category: "renovation",
      timeline: "one_to_three_months",
      propertyType: "apartment",
      surface: 150,
      publishedAt: now - 2 * 24 * 60 * 60 * 1000,
    });
    await seedProject(t, clientId, {
      title: "Wrong surface",
      city: "agadir",
      category: "renovation",
      timeline: "one_to_three_months",
      propertyType: "house",
      surface: 80,
      publishedAt: now - 2 * 24 * 60 * 60 * 1000,
    });
    await seedProject(t, clientId, {
      title: "Too old",
      city: "agadir",
      category: "renovation",
      timeline: "one_to_three_months",
      propertyType: "house",
      surface: 150,
      publishedAt: now - 40 * 24 * 60 * 60 * 1000,
    });
    const caller = asUser(t, company.userId);

    await expect(
      caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        ...firstPage,
        timelines: ["one_to_three_months"],
      }),
    ).resolves.toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ id: matchId })]),
    });
    await expect(
      caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        ...firstPage,
        propertyTypes: ["house"],
      }),
    ).resolves.toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ id: matchId })]),
    });
    await expect(
      caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        ...firstPage,
        surfaceRanges: ["100_200"],
      }),
    ).resolves.toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ id: matchId })]),
    });
    await expect(
      caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        ...firstPage,
        surfaceRanges: ["unknown"],
      }),
    ).resolves.toMatchObject({ page: [] });
    await expect(
      caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        ...firstPage,
        postedWindows: ["last_7d"],
        now,
      }),
    ).resolves.toMatchObject({
      page: expect.arrayContaining([expect.objectContaining({ id: matchId })]),
    });
    await expect(
      caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        ...firstPage,
        postedWindows: ["last_24h"],
        now,
      }),
    ).resolves.toMatchObject({ page: [] });

    const combined = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      ...firstPage,
      cities: ["agadir"],
      categories: ["renovation"],
      timelines: ["one_to_three_months"],
      propertyTypes: ["house"],
      surfaceRanges: ["100_200"],
      postedWindows: ["last_7d"],
      now,
    });
    expect(combined.page.map((project) => project.id)).toEqual([matchId]);
  });

  test("sorts by newest and oldest", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client");
    const company = await seedCompany(t);
    const oldestId = await seedProject(t, clientId, {
      title: "Oldest project",
      publishedAt: 100,
    });
    const newestId = await seedProject(t, clientId, {
      title: "Newest project",
      publishedAt: 200,
    });
    const middleId = await seedProject(t, clientId, {
      title: "Middle project",
      publishedAt: 150,
    });
    const caller = asUser(t, company.userId);

    await expect(
      caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        ...firstPage,
        sortBy: "newest",
      }),
    ).resolves.toMatchObject({
      page: [
        expect.objectContaining({ id: newestId }),
        expect.objectContaining({ id: middleId }),
        expect.objectContaining({ id: oldestId }),
      ],
    });
    await expect(
      caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        ...firstPage,
        sortBy: "oldest",
      }),
    ).resolves.toMatchObject({
      page: [
        expect.objectContaining({ id: oldestId }),
        expect.objectContaining({ id: middleId }),
        expect.objectContaining({ id: newestId }),
      ],
    });
  });
});

describe("company project marketplace safe details", () => {
  test.each([
    ["verified", true],
    ["pending", false],
  ] as const)("returns safe detail and quote eligibility for a %s company", async (verificationStatus, canSubmitQuote) => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", `client-${verificationStatus}`);
    const company = await seedCompany(t, verificationStatus);
    const projectId = await seedProject(t, clientId);
    const detail = await asUser(t, company.userId).query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId });

    expect(detail).toMatchObject({
      id: projectId,
      client: {
        displayName: "Samir C.",
        firstName: "Samir",
        lastInitial: "C",
        joinedAt: 10,
        projectsPostedCount: expect.any(Number),
        projectsCompletedCount: expect.any(Number),
        emailVerified: false,
        phoneVerified: false,
      },
      canSubmitQuote,
      myQuoteId: null,
    });
    expect(detail).not.toHaveProperty("neighborhood");
    expect(detail?.location).not.toHaveProperty("neighborhood");
    expect(detail?.location).not.toHaveProperty("localityName");
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("@private.test");
    expect(serialized).not.toContain("+212600000000");
    expect(serialized).not.toContain("attachments");
    expect(serialized).not.toContain('"email"');
    expect(serialized).not.toContain('"phone"');
  });

  test.each([
    ["normal", true],
    ["needs_attention", true],
    ["suspended", false],
  ] as const)("returns quote eligibility for a verified %s company", async (operationalStatus, canSubmitQuote) => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", `client-${operationalStatus}`);
    const company = await seedCompany(t, "verified", "completed", operationalStatus);
    const projectId = await seedProject(t, clientId);

    await expect(asUser(t, company.userId).query(
      api.projects.marketplace.getCompanyMarketplaceProject,
      { projectId },
    )).resolves.toMatchObject({ canSubmitQuote });
  });

  test("hides missing, non-published, and invite-only project details", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client");
    const company = await seedCompany(t);
    const caller = asUser(t, company.userId);
    const pendingId = await seedProject(t, clientId, { status: "pending_review" });
    const privateId = await seedProject(t, clientId, { visibility: "invite_only" });
    await expect(caller.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: pendingId })).resolves.toBeNull();
    await expect(caller.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: privateId })).resolves.toBeNull();
    await expect(caller.query(api.projects.marketplace.getCompanyMarketplaceProject, { projectId: "not-an-id" })).resolves.toBeNull();
  });
});
