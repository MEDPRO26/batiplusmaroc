/// <reference types="vite/client" />

import { convexTest } from "convex-test";
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
});

async function seedUser(t: TestBackend, accountType: "client" | "company" | "admin", email: string) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email,
    firstName: accountType === "admin" ? "Ada" : "Samir",
    lastName: accountType === "admin" ? "Admin" : "Client",
    accountType,
    onboardingStatus: "completed",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function seedProject(
  t: TestBackend,
  clientId: Id<"users">,
  options?: { title?: string; city?: "rabat" | "agadir"; status?: "pending_review" | "published" | "needs_changes" | "cancelled"; submittedAt?: number },
) {
  return await t.run((ctx) => ctx.db.insert("projects", {
    clientId,
    primaryCategory: "renovation",
    city: options?.city ?? "rabat",
    neighborhood: "Agdal",
    countryCode: "MA",
    title: options?.title ?? "Renovation appartement Agdal",
    propertyType: "apartment",
    surface: 95,
    surfaceUnknown: false,
    description: "Renovation complete with electrical and plumbing work.",
    budgetRange: "100000_250000",
    budgetMin: 100_000,
    budgetMax: 250_000,
    budgetUnknown: false,
    timeline: "one_to_three_months",
    visibility: "marketplace",
    status: options?.status ?? "pending_review",
    lastCompletedStep: 6,
    createdAt: 100,
    updatedAt: 100,
    submittedAt: options?.submittedAt ?? 200,
    ...(options?.status === "published" ? { publishedAt: 300 } : {}),
  }));
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

describe("admin project review authorization", () => {
  test("blocks unauthenticated, client, and company callers from queries and mutations", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client@example.test");
    const companyId = await seedUser(t, "company", "company@example.test");
    const projectId = await seedProject(t, clientId);

    await expect(t.query(api.admin.projects.listProjects, { status: "pending_review" })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(t, clientId).query(api.admin.projects.getProjectReview, { projectId })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(t.query(api.admin.projects.listProjectActivity, { projectId })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(t, clientId).query(api.admin.projects.listProjectActivity, { projectId })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(asUser(t, companyId).mutation(api.admin.projects.approveProject, { projectId })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(asUser(t, clientId).mutation(api.admin.projects.requestProjectChanges, { projectId, reason: "Add measurements" })).rejects.toThrow("ADMIN_REQUIRED");
    expect((await t.run((ctx) => ctx.db.get(projectId)))?.status).toBe("pending_review");
  });
});

describe("marketplace project backfill", () => {
  test("requires an admin and continues across every migration page", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "admin@example.test");
    const clientId = await seedUser(t, "client", "client@example.test");
    const projectIds = await Promise.all(
      Array.from({ length: 55 }, (_, index) =>
        seedProject(t, clientId, {
          title: `Legacy marketplace project ${index}`,
          status: "published",
        }),
      ),
    );
    const pendingProjectId = await seedProject(t, clientId, {
      title: "Pending project",
      status: "pending_review",
    });

    await expect(
      t.mutation(api.admin.projects.startMarketplaceBackfill, {}),
    ).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(
      asUser(t, clientId).mutation(api.admin.projects.startMarketplaceBackfill, {}),
    ).rejects.toThrow("ADMIN_REQUIRED");
    await expect(
      asUser(t, adminId).mutation(api.admin.projects.startMarketplaceBackfill, {}),
    ).resolves.toEqual({ scheduled: true });

    await t.finishAllScheduledFunctions(() => {});

    const migrated = await t.run(async (ctx) =>
      Promise.all(projectIds.map((projectId) => ctx.db.get(projectId))),
    );
    expect(migrated).toHaveLength(55);
    for (const project of migrated) {
      expect(project).toMatchObject({
        marketplaceSearchText: expect.stringContaining("renovation"),
        marketplaceBudgetRank: 3,
      });
    }
    expect(await t.run((ctx) => ctx.db.get(pendingProjectId))).not.toHaveProperty(
      "marketplaceSearchText",
    );

    await expect(
      asUser(t, adminId).mutation(api.admin.projects.startMarketplaceBackfill, {}),
    ).resolves.toEqual({ scheduled: true });
    await t.finishAllScheduledFunctions(() => {});
    expect(
      await t.run(async (ctx) =>
        (await Promise.all(projectIds.map((projectId) => ctx.db.get(projectId)))).filter(
          (project) => project?.marketplaceBudgetRank !== 3,
        ).length,
      ),
    ).toBe(0);
  });
});

describe("admin project list and review", () => {
  test("lists real projects by tab, title, city, and status without client contact data", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "admin@example.test");
    const clientId = await seedUser(t, "client", "private-client@example.test");
    await seedProject(t, clientId, { title: "Rabat apartment", city: "rabat", status: "pending_review", submittedAt: 500 });
    await seedProject(t, clientId, { title: "Agadir villa", city: "agadir", status: "published", submittedAt: 400 });
    const admin = asUser(t, adminId);

    await expect(admin.query(api.admin.projects.listProjects, { status: "pending_review" })).resolves.toEqual([
      expect.objectContaining({ title: "Rabat apartment", clientName: "Samir Client", city: "rabat", status: "pending_review" }),
    ]);
    await expect(admin.query(api.admin.projects.listProjects, { status: "all", search: "villa", city: "agadir" })).resolves.toEqual([
      expect.objectContaining({ title: "Agadir villa", status: "published" }),
    ]);

    const row = (await admin.query(api.admin.projects.listProjects, { status: "all" }))[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("phone");
  });

  test("returns project details and immutable actor history using safe client info", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "admin@example.test");
    const clientId = await seedUser(t, "client", "private-client@example.test");
    const projectId = await seedProject(t, clientId);
    await t.run((ctx) => ctx.db.insert("projectStatusHistory", {
      projectId,
      oldStatus: "draft",
      newStatus: "pending_review",
      changedBy: clientId,
      changedAt: 200,
    }));

    const review = await asUser(t, adminId).query(api.admin.projects.getProjectReview, { projectId });
    expect(review).toMatchObject({
      projectId,
      client: { displayName: "Samir Client" },
      neighborhood: "Agdal",
      propertyType: "apartment",
      status: "pending_review",
      history: [expect.objectContaining({ oldStatus: "draft", newStatus: "pending_review", changedBy: { userId: clientId, displayName: "Samir Client", role: "client" } })],
    });
    expect(review?.client).not.toHaveProperty("email");
  });
});

describe("admin project decisions", () => {
  test("approves only pending review, publishes atomically, and exposes the project publicly", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "admin@example.test");
    const clientId = await seedUser(t, "client", "client@example.test");
    const projectId = await seedProject(t, clientId);
    const admin = asUser(t, adminId);

    await expect(admin.mutation(api.admin.projects.approveProject, { projectId })).resolves.toEqual({ status: "published" });
    const state = await t.run(async (ctx) => ({ project: await ctx.db.get(projectId), history: await ctx.db.query("projectStatusHistory").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(), activity: await ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", projectId)).take(10) }));
    expect(state.project).toMatchObject({ status: "published", publishedAt: expect.any(Number), updatedAt: expect.any(Number), marketplaceSearchText: expect.stringContaining("renovation") });
    expect(state.history).toEqual([expect.objectContaining({ oldStatus: "pending_review", newStatus: "published", changedBy: adminId, changedAt: expect.any(Number) })]);
    expect(state.activity).toEqual([expect.objectContaining({ eventType: "project_approved", actorUserId: adminId, actorType: "admin", oldStatus: "pending_review", newStatus: "published" })]);
    await expect(admin.query(api.admin.projects.listProjectActivity, { projectId })).resolves.toEqual([
      expect.objectContaining({ eventType: "project_approved", actor: { userId: adminId, displayName: "Ada Admin", type: "admin" } }),
    ]);
    await expect(t.query(api.projects.index.getPublicProject, { projectId })).resolves.toMatchObject({ title: "Renovation appartement Agdal" });
    await expect(admin.mutation(api.admin.projects.approveProject, { projectId })).rejects.toThrow("PROJECT_NOT_PENDING_REVIEW");
  });

  test("lets the owner edit and resubmit a project after changes are requested", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "admin@example.test");
    const clientId = await seedUser(t, "client", "client@example.test");
    const otherClientId = await seedUser(t, "client", "other-client@example.test");
    const projectId = await seedProject(t, clientId);
    const admin = asUser(t, adminId);
    const client = asUser(t, clientId);

    await expect(admin.mutation(api.admin.projects.requestProjectChanges, { projectId, reason: "  " })).rejects.toThrow("PROJECT_REVIEW_REASON_REQUIRED");
    await expect(admin.mutation(api.admin.projects.requestProjectChanges, { projectId, reason: "  Add the exact surface area.  " })).resolves.toEqual({ status: "needs_changes" });

    const clientView = await client.query(api.projects.index.getMyProject, { projectId });
    expect(clientView).toMatchObject({ status: "needs_changes", canResume: true, history: [expect.objectContaining({ oldStatus: "pending_review", newStatus: "needs_changes", actor: "staff", reason: "Add the exact surface area." })] });
    expect(await t.query(api.projects.index.getPublicProject, { projectId })).toBeNull();

    await expect(client.query(api.projects.index.getWizard, { projectId })).resolves.toMatchObject({
      draft: { id: projectId, surface: 95, lastCompletedStep: 6 },
    });
    await expect(asUser(t, otherClientId).query(api.projects.index.getWizard, { projectId })).rejects.toThrow("PROJECT_NOT_FOUND");

    await client.mutation(api.projects.index.saveDetails, {
      projectId,
      title: "Renovation appartement Agdal",
      propertyType: "apartment",
      surface: 110,
      surfaceUnknown: false,
      description: "Renovation complete with updated measurements and plumbing work.",
    });
    await expect(client.mutation(api.projects.index.publishProject, { projectId })).resolves.toEqual({
      status: "pending_review",
      alreadySubmitted: false,
    });

    const resubmitted = await client.query(api.projects.index.getMyProject, { projectId });
    expect(resubmitted).toMatchObject({ status: "pending_review", canResume: false, surface: 110 });
    expect(resubmitted?.submittedAt).toBeGreaterThan(200);
    await expect(client.query(api.projects.index.getWizard, { projectId })).resolves.toMatchObject({ draft: null });
    expect(resubmitted?.history).toEqual([
      expect.objectContaining({ oldStatus: "pending_review", newStatus: "needs_changes", actor: "staff" }),
      expect.objectContaining({ oldStatus: "needs_changes", newStatus: "pending_review", actor: "client" }),
    ]);
    await expect(admin.mutation(api.admin.projects.approveProject, { projectId })).resolves.toEqual({ status: "published" });
  });

  test("cancels only a pending project with an immutable reason", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "admin@example.test");
    const clientId = await seedUser(t, "client", "client@example.test");
    const projectId = await seedProject(t, clientId);

    await expect(asUser(t, adminId).mutation(api.admin.projects.cancelProject, { projectId, reason: "Duplicate submission" })).resolves.toEqual({ status: "cancelled" });
    const history = await t.run((ctx) => ctx.db.query("projectStatusHistory").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect());
    expect(history).toEqual([expect.objectContaining({ oldStatus: "pending_review", newStatus: "cancelled", changedBy: adminId, reason: "Duplicate submission" })]);
  });
});
