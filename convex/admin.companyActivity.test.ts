/// <reference types="vite/client" />

import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
type ActivityArgs = FunctionArgs<typeof api.admin.companyActivity.listCompanyActivity>;
type ActivityPage = FunctionReturnType<typeof api.admin.companyActivity.listCompanyActivity>;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

async function seedUser(
  t: Backend,
  accountType: "client" | "company" | "admin" | "seo_team",
  name: string,
) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${name.toLocaleLowerCase()}-${crypto.randomUUID()}@activity.test`,
    firstName: name,
    lastName: "Test",
    accountType,
    onboardingStatus: "completed",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function seedCompany(t: Backend, name: string) {
  return await t.run((ctx) => ctx.db.insert("companies", {
    name,
    city: "Rabat",
    onboardingStatus: "completed",
    verificationStatus: "verified",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function seedProject(t: Backend, clientId: Id<"users">, title: string) {
  return await t.run((ctx) => ctx.db.insert("projects", {
    clientId,
    primaryCategory: "renovation",
    city: "rabat",
    countryCode: "MA",
    title,
    propertyType: "apartment",
    surface: 90,
    surfaceUnknown: false,
    description: "A complete renovation project for the activity timeline test.",
    timeline: "one_to_three_months",
    visibility: "marketplace",
    status: "published",
    lastCompletedStep: 6,
    createdAt: 1,
    updatedAt: 1,
    submittedAt: 1,
    publishedAt: 1,
  }));
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}

function firstPage(companyId: Id<"companies">, numItems = 20): ActivityArgs {
  return { companyId, paginationOpts: { numItems, cursor: null } };
}

async function collectPages(
  t: Backend,
  adminId: Id<"users">,
  companyId: Id<"companies">,
  numItems: number,
) {
  const pages: ActivityPage[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
    const page: ActivityPage = await asUser(t, adminId).query(
      api.admin.companyActivity.listCompanyActivity,
      { companyId, paginationOpts: { numItems, cursor } },
    );
    pages.push(page);
    if (page.isDone) return pages;
    expect(page.continueCursor).not.toBe(cursor);
    expect(seenCursors.has(page.continueCursor)).toBe(false);
    seenCursors.add(page.continueCursor);
    cursor = page.continueCursor;
  }
  throw new Error("Company activity pagination did not terminate");
}

describe("admin Company activity authorization", () => {
  test("allows Admin and denies anonymous, Company, Client, and SEO callers", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompany(t, "Atlas Build");
    const adminId = await seedUser(t, "admin", "Admin");
    const denied = await Promise.all([
      seedUser(t, "company", "Company"),
      seedUser(t, "client", "Client"),
      seedUser(t, "seo_team", "SEO"),
    ]);

    await expect(t.query(api.admin.companyActivity.listCompanyActivity, firstPage(companyId)))
      .rejects.toThrow("NOT_AUTHENTICATED");
    for (const userId of denied) {
      await expect(asUser(t, userId).query(
        api.admin.companyActivity.listCompanyActivity,
        firstPage(companyId),
      )).rejects.toThrow("ADMIN_REQUIRED");
    }
    await expect(asUser(t, adminId).query(
      api.admin.companyActivity.listCompanyActivity,
      firstPage(companyId),
    )).resolves.toMatchObject({ page: [], isDone: true });
  });
});

describe("Phase-1 Company activity", () => {
  test("contains no marketplaceActivity query while the Company index is staged", () => {
    const source = readFileSync(
      new URL("./admin/companyActivity.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/\.query\(["']marketplaceActivity["']\)/);
    expect(source).not.toMatch(/\.withIndex\(["']by_eventType_and_createdAt["']/);
  });

  test("does not scan global activity for a sparse Company and keeps safe sources isolated", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const clientId = await seedUser(t, "client", "Client");
    const companyUserId = await seedUser(t, "company", "Company");
    const sparseCompanyId = await seedCompany(t, "Sparse Company");
    const busyCompanyId = await seedCompany(t, "Busy Company");
    const projectId = await seedProject(t, clientId, "Busy marketplace project");

    await t.run(async (ctx) => {
      for (let index = 0; index < 1_200; index += 1) {
        await ctx.db.insert("marketplaceActivity", {
          projectId,
          companyId: busyCompanyId,
          actorUserId: companyUserId,
          actorType: "company",
          eventType: "discussion_opened",
          createdAt: 10_000 - index,
        });
      }
      await ctx.db.insert("marketplaceActivity", {
        projectId,
        companyId: sparseCompanyId,
        actorUserId: companyUserId,
        actorType: "company",
        eventType: "discussion_opened",
        createdAt: 20_000,
      });
      await ctx.db.insert("companyVerificationHistory", {
        companyId: sparseCompanyId,
        oldStatus: "draft",
        newStatus: "pending",
        changedBy: companyUserId,
        changedAt: 300,
      });
      await ctx.db.insert("companyOperationalStatusHistory", {
        companyId: sparseCompanyId,
        fromStatus: "normal",
        toStatus: "needs_attention",
        reason: "Operational review requested.",
        changedByAdminUserId: adminId,
        createdAt: 200,
      });
      await ctx.db.insert("companyVerificationHistory", {
        companyId: busyCompanyId,
        oldStatus: "draft",
        newStatus: "pending",
        changedBy: companyUserId,
        changedAt: 400,
      });
    });

    const page = await asUser(t, adminId).query(
      api.admin.companyActivity.listCompanyActivity,
      firstPage(sparseCompanyId, 5),
    );
    expect(page.page.map((row) => [row.source, row.occurredAt])).toEqual([
      ["verification_history", 300],
      ["operational_status_history", 200],
    ]);
    expect(page.page.every((row) => row.companyId === sparseCompanyId)).toBe(true);
    expect(page.page.some((row) => row.source === "marketplace_activity")).toBe(false);
    expect(page.isDone).toBe(true);
  });

  test("paginates safe sources with forward progress, stable ordering, and no gaps or duplicates", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const companyUserId = await seedUser(t, "company", "Company");
    const companyId = await seedCompany(t, "Paged Company");

    await t.run(async (ctx) => {
      for (let index = 0; index < 57; index += 1) {
        await ctx.db.insert("companyVerificationHistory", {
          companyId,
          oldStatus: index % 2 === 0 ? "rejected" : "pending",
          newStatus: index % 2 === 0 ? "pending" : "verified",
          changedBy: companyUserId,
          changedAt: 10_000 - index,
        });
      }
      for (let index = 0; index < 18; index += 1) {
        await ctx.db.insert("companyOperationalStatusHistory", {
          companyId,
          fromStatus: index % 2 === 0 ? "normal" : "needs_attention",
          toStatus: index % 2 === 0 ? "needs_attention" : "normal",
          reason: `Operational timeline reason ${index}`,
          changedByAdminUserId: adminId,
          createdAt: 9_975 - index,
        });
      }
    });

    const pages = await collectPages(t, adminId, companyId, 7);
    const rows = pages.flatMap((page) => page.page);
    expect(rows).toHaveLength(75);
    expect(new Set(rows.map((row) => row.id))).toHaveLength(75);
    expect(rows.map((row) => row.occurredAt)).toEqual(
      [...rows.map((row) => row.occurredAt)].sort((left, right) => right - left),
    );
    expect(pages.at(-1)?.isDone).toBe(true);

    await expect(asUser(t, adminId).query(
      api.admin.companyActivity.listCompanyActivity,
      { companyId, paginationOpts: { numItems: 20, cursor: "forged" } },
    )).rejects.toThrow("INVALID_COMPANY_ACTIVITY_CURSOR");
  });

  test("returns only the allowlisted DTO while marketplace details are deferred", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const clientId = await seedUser(t, "client", "Client");
    const companyId = await seedCompany(t, "Private Boundary Company");
    const projectId = await seedProject(t, clientId, "Private boundary project");

    await t.run(async (ctx) => {
      await ctx.db.insert("marketplaceActivity", {
        projectId,
        companyId,
        actorUserId: clientId,
        actorType: "client",
        eventType: "discussion_opened",
        reason: "PRIVATE_ACTIVITY_REASON_SENTINEL",
        createdAt: 3,
      });
      await ctx.db.insert("companyVerificationHistory", {
        companyId,
        oldStatus: "pending",
        newStatus: "rejected",
        changedBy: adminId,
        changedAt: 4,
        rejectionReason: "PRIVATE_REJECTION_REASON_SENTINEL",
      });
    });

    const pages = await collectPages(t, adminId, companyId, 20);
    const rows = pages.flatMap((page) => page.page);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "verification_history",
      eventType: "verification_rejected",
      companyId,
    });
    expect(JSON.stringify(rows)).not.toContain("PRIVATE_");
    expect(Object.keys(rows[0]).sort()).toEqual([
      "id",
      "source",
      "eventType",
      "category",
      "companyId",
      "project",
      "entity",
      "actor",
      "occurredAt",
      "oldStatus",
      "newStatus",
      "context",
    ].sort());
  });
});
