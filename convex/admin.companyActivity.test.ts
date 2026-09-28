/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MarketplaceActivityEventType } from "./marketplaceActivity/constants";
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

async function insertActivity(
  t: Backend,
  args: {
    projectId: Id<"projects">;
    companyId: Id<"companies">;
    actorUserId: Id<"users">;
    eventType: MarketplaceActivityEventType;
    createdAt: number;
    metadata?: Record<string, string | number | boolean>;
  },
) {
  return await t.run((ctx) => ctx.db.insert("marketplaceActivity", {
    projectId: args.projectId,
    companyId: args.companyId,
    actorUserId: args.actorUserId,
    actorType: "company",
    eventType: args.eventType,
    createdAt: args.createdAt,
    metadata: args.metadata,
  }));
}

async function collectAll(
  t: Backend,
  adminId: Id<"users">,
  companyId: Id<"companies">,
  numItems = 20,
) {
  const rows = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 30; pageNumber += 1) {
    const result: ActivityPage = await asUser(t, adminId).query(
      api.admin.companyActivity.listCompanyActivity,
      { companyId, paginationOpts: { numItems, cursor } },
    );
    rows.push(...result.page);
    if (result.isDone) return rows;
    cursor = result.continueCursor;
  }
  throw new Error("Company activity pagination did not terminate");
}

describe("admin Company activity authorization", () => {
  test("allows Admin and denies anonymous, Company, Client, and SEO callers", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompany(t, "Atlas Build");
    const adminId = await seedUser(t, "admin", "Admin");
    const companyUserId = await seedUser(t, "company", "Company");
    const clientId = await seedUser(t, "client", "Client");
    const seoId = await seedUser(t, "seo_team", "SEO");

    await expect(t.query(api.admin.companyActivity.listCompanyActivity, firstPage(companyId)))
      .rejects.toThrow("NOT_AUTHENTICATED");
    for (const userId of [companyUserId, clientId, seoId]) {
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

describe("admin Company activity projection", () => {
  test("isolates Companies and orders marketplace and verification sources newest first", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Ada");
    const clientId = await seedUser(t, "client", "Khadija");
    const companyUserId = await seedUser(t, "company", "Youssef");
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");
    const projectA = await seedProject(t, clientId, "Company A project");
    const projectB = await seedProject(t, clientId, "Company B project");

    await insertActivity(t, {
      projectId: projectA,
      companyId: companyA,
      actorUserId: companyUserId,
      eventType: "initial_quote_submitted",
      createdAt: 300,
    });
    await t.run((ctx) => ctx.db.insert("companyVerificationHistory", {
      companyId: companyA,
      oldStatus: "draft",
      newStatus: "pending",
      changedBy: companyUserId,
      changedAt: 200,
      rejectionReason: "This must never be projected",
    }));
    await insertActivity(t, {
      projectId: projectA,
      companyId: companyA,
      actorUserId: companyUserId,
      eventType: "discussion_opened",
      createdAt: 100,
    });
    await insertActivity(t, {
      projectId: projectB,
      companyId: companyB,
      actorUserId: companyUserId,
      eventType: "review_created",
      createdAt: 400,
      metadata: { rating: 1 },
    });

    const result = await asUser(t, adminId).query(
      api.admin.companyActivity.listCompanyActivity,
      firstPage(companyA),
    );
    expect(result.page.map((row) => row.eventType)).toEqual([
      "initial_quote_submitted",
      "verification_submitted",
      "discussion_opened",
    ]);
    expect(result.page.every((row) => row.companyId === companyA)).toBe(true);
    expect(result.page.map((row) => row.occurredAt)).toEqual([300, 200, 100]);
    expect(JSON.stringify(result.page)).not.toContain("This must never be projected");
  });

  test("maps every included V1 marketplace event and excludes noisy quote triage", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const clientId = await seedUser(t, "client", "Client");
    const companyUserId = await seedUser(t, "company", "Company");
    const companyId = await seedCompany(t, "Coverage Company");
    const projectId = await seedProject(t, clientId, "Coverage project");
    const included: MarketplaceActivityEventType[] = [
      "company_invited",
      "company_invitation_accepted",
      "company_invitation_declined",
      "initial_quote_submitted",
      "discussion_opened",
      "site_assessment_invited",
      "site_assessment_accepted",
      "site_assessment_declined",
      "site_assessment_cancelled",
      "site_visit_scheduled",
      "site_visit_proposed",
      "site_visit_rescheduled",
      "site_visit_confirmed",
      "site_visit_declined",
      "site_visit_completed",
      "site_visit_cancelled",
      "final_quote_requested",
      "final_quote_submitted",
      "final_quote_changes_requested",
      "final_quote_revised",
      "final_quote_declined",
      "final_quote_withdrawn",
      "final_quote_accepted",
      "company_selected",
      "deal_created",
      "commission_due",
      "commission_paid",
      "deal_completed",
      "review_created",
      "review_hidden",
      "review_restored",
    ];
    const excluded: MarketplaceActivityEventType[] = [
      "project_created",
      "project_submitted",
      "project_approved",
      "project_needs_changes",
      "quote_viewed",
      "quote_shortlisted",
      "quote_declined",
    ];
    for (const [index, eventType] of [...included, ...excluded].entries()) {
      await insertActivity(t, {
        projectId,
        companyId,
        actorUserId: companyUserId,
        eventType,
        createdAt: 1_000 + index,
        metadata: eventType === "review_created" ? { rating: 5 } : undefined,
      });
    }

    const rows = await collectAll(t, adminId, companyId, 7);
    expect(rows).toHaveLength(included.length);
    expect(new Set(rows.map((row) => row.eventType))).toEqual(new Set(
      included.map((eventType) => eventType === "review_created" ? "review_received" : eventType),
    ));
    expect(rows.find((row) => row.eventType === "review_received")?.context.rating).toBe(5);
  });

  test("paginates a dense shared timestamp without repeated or missing rows and rejects forged cursors", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const clientId = await seedUser(t, "client", "Client");
    const companyUserId = await seedUser(t, "company", "Company");
    const companyId = await seedCompany(t, "Paged Company");
    const projectId = await seedProject(t, clientId, "Paged project");
    for (let index = 0; index < 57; index += 1) {
      await insertActivity(t, {
        projectId,
        companyId,
        actorUserId: companyUserId,
        eventType: index % 2 === 0 ? "initial_quote_submitted" : "discussion_opened",
        createdAt: 10_000,
      });
    }
    for (let index = 0; index < 8; index += 1) {
      await t.run((ctx) => ctx.db.insert("companyVerificationHistory", {
        companyId,
        oldStatus: "rejected",
        newStatus: "pending",
        changedBy: companyUserId,
        changedAt: 10_000,
      }));
    }

    const rows = await collectAll(t, adminId, companyId, 9);
    expect(rows).toHaveLength(65);
    expect(new Set(rows.map((row) => row.id))).toHaveLength(65);
    expect(rows.map((row) => row.occurredAt)).toEqual(
      [...rows.map((row) => row.occurredAt)].sort((left, right) => right - left),
    );
    const clamped = await asUser(t, adminId).query(
      api.admin.companyActivity.listCompanyActivity,
      { companyId, paginationOpts: { numItems: 100, cursor: null } },
    );
    expect(clamped.page).toHaveLength(30);
    expect(clamped.isDone).toBe(false);
    await expect(asUser(t, adminId).query(
      api.admin.companyActivity.listCompanyActivity,
      { companyId, paginationOpts: { numItems: 20, cursor: "forged" } },
    )).rejects.toThrow("INVALID_COMPANY_ACTIVITY_CURSOR");
  });

  test("uses marketplace activity precedence and never projects private adjacent records", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "Admin");
    const clientId = await seedUser(t, "client", "Client");
    const companyUserId = await seedUser(t, "company", "Company");
    const companyId = await seedCompany(t, "Private Boundary Company");
    const projectId = await seedProject(t, clientId, "Private boundary project");
    const quoteId = await t.run((ctx) => ctx.db.insert("projectQuotes", {
      projectId,
      companyId,
      submittedByUserId: companyUserId,
      message: "Private initial quote text",
      estimatedPrice: 120_000,
      currency: "MAD",
      estimatedDuration: 45,
      availableStartDate: "2099-01-01",
      scope: "Private quote scope that must not be returned by the timeline.",
      quoteType: "initial",
      status: "discussion_open",
      createdAt: 1,
      updatedAt: 1,
      submittedAt: 1,
    }));
    const conversationId = await t.run((ctx) => ctx.db.insert("conversations", {
      projectId,
      quoteId,
      clientId,
      companyId,
      status: "active",
      createdBy: clientId,
      createdAt: 1,
      updatedAt: 1,
      lastMessagePreview: "Private preview",
    }));
    await t.run((ctx) => ctx.db.insert("messages", {
      conversationId,
      senderUserId: clientId,
      senderType: "client",
      body: "PRIVATE_MESSAGE_BODY_SENTINEL",
      createdAt: 2,
    }));
    await t.run((ctx) => ctx.db.insert("pushSubscriptions", {
      userId: companyUserId,
      endpoint: "https://push.example/PRIVATE_ENDPOINT_SENTINEL",
      p256dh: "PRIVATE_P256DH_SENTINEL",
      auth: "PRIVATE_AUTH_SENTINEL",
      createdAt: 1,
      updatedAt: 1,
    }));
    await t.run((ctx) => ctx.db.insert("companyVerificationHistory", {
      companyId,
      oldStatus: "pending",
      newStatus: "rejected",
      changedBy: adminId,
      changedAt: 4,
      rejectionReason: "PRIVATE_REJECTION_REASON_SENTINEL",
    }));
    const activityId = await t.run((ctx) => ctx.db.insert("marketplaceActivity", {
      projectId,
      companyId,
      actorUserId: clientId,
      actorType: "client",
      quoteId,
      conversationId,
      eventType: "discussion_opened",
      newStatus: "active",
      createdAt: 3,
    }));
    await t.run((ctx) => ctx.db.insert("quoteStatusHistory", {
      quoteId,
      oldStatus: "submitted",
      newStatus: "discussion_open",
      changedBy: clientId,
      reason: "PRIVATE_DUPLICATE_HISTORY_SENTINEL",
      changedAt: 3,
    }));

    const rows = await collectAll(t, adminId, companyId);
    expect(rows.filter((row) => row.id === `activity:${activityId}`)).toHaveLength(1);
    const serialized = JSON.stringify(rows);
    for (const sentinel of [
      "PRIVATE_MESSAGE_BODY_SENTINEL",
      "PRIVATE_ENDPOINT_SENTINEL",
      "PRIVATE_P256DH_SENTINEL",
      "PRIVATE_AUTH_SENTINEL",
      "PRIVATE_REJECTION_REASON_SENTINEL",
      "PRIVATE_DUPLICATE_HISTORY_SENTINEL",
      "Private initial quote text",
      "Private quote scope",
      "Private preview",
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
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
