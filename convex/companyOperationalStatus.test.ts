/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

async function user(t: Backend, accountType: "admin" | "client" | "company", name: string) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${name}-${crypto.randomUUID()}@status.test`,
    firstName: name,
    lastName: "Test",
    accountType,
    onboardingStatus: "completed",
    countryCode: "MA",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function company(t: Backend, name: string, operationalStatus?: "normal" | "needs_attention" | "suspended") {
  const userId = await user(t, "company", name);
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name,
    slug: `${name.toLowerCase()}-${crypto.randomUUID()}`,
    city: "Rabat",
    description: "Verified construction company ready for marketplace projects.",
    directorySearchText: `${name.toLowerCase()} rabat renovation`,
    onboardingStatus: "completed",
    verificationStatus: "verified",
    operationalStatus,
    createdAt: 1,
    updatedAt: 1,
  }));
  await t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId,
    userId,
    role: "owner",
    status: "active",
    createdAt: 1,
  }));
  return { companyId, userId };
}

async function project(t: Backend, clientId: Id<"users">, visibility: "marketplace" | "invite_only") {
  return await t.run((ctx) => ctx.db.insert("projects", {
    clientId,
    primaryCategory: "renovation",
    city: "rabat",
    countryCode: "MA",
    title: "Operational boundary project",
    propertyType: "apartment",
    surface: 100,
    surfaceUnknown: false,
    description: "A complete apartment renovation requiring a verified Company.",
    timeline: "one_to_three_months",
    visibility,
    status: "published",
    lastCompletedStep: 6,
    submittedAt: 1,
    publishedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  }));
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test`, tokenIdentifier: `test|${userId}` });
}

const quote = {
  message: "We can deliver this renovation with a dedicated site team.",
  estimatedPrice: 185_000,
  estimatedDuration: 75,
  availableStartDate: "2099-01-15",
  scope: "Demolition, plumbing, electrical work, finishes, and site cleanup.",
};

describe("Company operational status administration", () => {
  test("treats legacy rows as normal and records atomic Admin-only transitions", async () => {
    const t = convexTest(schema, modules);
    const adminId = await user(t, "admin", "Admin");
    const clientId = await user(t, "client", "Client");
    const target = await company(t, "Atlas");

    await expect(asUser(t, adminId).query(api.admin.companyOperationalStatus.get, { companyId: target.companyId }))
      .resolves.toEqual({ status: "normal" });
    await expect(asUser(t, clientId).mutation(api.admin.companyOperationalStatus.change, {
      companyId: target.companyId,
      toStatus: "suspended",
      reason: "Repeated marketplace policy violations.",
    })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(asUser(t, adminId).mutation(api.admin.companyOperationalStatus.change, {
      companyId: target.companyId,
      toStatus: "normal",
      reason: "This is a valid but unchanged status.",
    })).rejects.toThrow("COMPANY_OPERATIONAL_STATUS_UNCHANGED");
    await expect(asUser(t, adminId).mutation(api.admin.companyOperationalStatus.change, {
      companyId: target.companyId,
      toStatus: "suspended",
      reason: "too short",
    })).rejects.toThrow("INVALID_COMPANY_OPERATIONAL_STATUS_REASON");

    await asUser(t, adminId).mutation(api.admin.companyOperationalStatus.change, {
      companyId: target.companyId,
      toStatus: "suspended",
      reason: "  Repeated   marketplace policy violations.  ",
    });
    const stored = await t.run(async (ctx) => ({
      company: await ctx.db.get(target.companyId),
      history: await ctx.db.query("companyOperationalStatusHistory")
        .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", target.companyId))
        .collect(),
    }));
    expect(stored.company?.operationalStatus).toBe("suspended");
    expect(stored.history).toEqual([expect.objectContaining({
      fromStatus: "normal",
      toStatus: "suspended",
      reason: "Repeated marketplace policy violations.",
      changedByAdminUserId: adminId,
    })]);
    const activity = await asUser(t, adminId).query(api.admin.companyActivity.listCompanyActivity, {
      companyId: target.companyId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(activity.page).toContainEqual(expect.objectContaining({
      source: "operational_status_history",
      eventType: "operational_status_changed",
      oldStatus: "normal",
      newStatus: "suspended",
      actor: expect.objectContaining({ type: "admin" }),
    }));
    expect(JSON.stringify(activity.page)).not.toContain("Repeated marketplace policy violations");
  });

  test("allows every distinct status transition and emits no notifications", async () => {
    const t = convexTest(schema, modules);
    const adminId = await user(t, "admin", "Admin");
    const target = await company(t, "Atlas", "normal");
    const transitions = [
      "needs_attention",
      "suspended",
      "normal",
      "suspended",
      "needs_attention",
      "normal",
    ] as const;
    for (const toStatus of transitions) {
      await asUser(t, adminId).mutation(api.admin.companyOperationalStatus.change, {
        companyId: target.companyId,
        toStatus,
        reason: `Administrative transition to ${toStatus}.`,
      });
    }
    const history = await t.run((ctx) => ctx.db.query("companyOperationalStatusHistory")
      .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", target.companyId))
      .collect());
    expect(history.map((row) => [row.fromStatus, row.toStatus])).toEqual([
      ["normal", "needs_attention"],
      ["needs_attention", "suspended"],
      ["suspended", "normal"],
      ["normal", "suspended"],
      ["suspended", "needs_attention"],
      ["needs_attention", "normal"],
    ]);
    const notifications = await asUser(t, target.userId).query(api.notifications.index.listMyNotifications, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(notifications.page).toEqual([]);
  });
});

describe("Company operational marketplace boundary", () => {
  test("blocks suspended acquisition from both sides while needs_attention and unrelated Companies remain eligible", async () => {
    const t = convexTest(schema, modules);
    const clientId = await user(t, "client", "Client");
    const suspended = await company(t, "Suspended", "suspended");
    const attention = await company(t, "Attention", "needs_attention");
    const normal = await company(t, "Normal", "normal");
    const inviteOnly = await project(t, clientId, "invite_only");
    const openForAttention = await project(t, clientId, "marketplace");
    const openForNormal = await project(t, clientId, "marketplace");

    await expect(asUser(t, clientId).mutation(api.invitations.index.inviteCompanyToProject, {
      companyId: suspended.companyId,
      projectId: inviteOnly,
    })).rejects.toThrow("COMPANY_MARKETPLACE_SUSPENDED");
    await expect(asUser(t, suspended.userId).mutation(api.quotes.index.submitInitialQuote, {
      projectId: openForAttention,
      ...quote,
    })).rejects.toThrow("COMPANY_MARKETPLACE_SUSPENDED");

    await expect(asUser(t, attention.userId).mutation(api.quotes.index.submitInitialQuote, {
      projectId: openForAttention,
      ...quote,
    })).resolves.toMatchObject({ status: "submitted" });
    await expect(asUser(t, normal.userId).mutation(api.quotes.index.submitInitialQuote, {
      projectId: openForNormal,
      ...quote,
    })).resolves.toMatchObject({ status: "submitted" });
  });

  test("keeps a suspended public profile readable but removes it from discovery and exposes no internal state", async () => {
    const t = convexTest(schema, modules);
    const suspended = await company(t, "Hidden", "suspended");
    const normal = await company(t, "Visible", "normal");
    const suspendedDoc = await t.run((ctx) => ctx.db.get(suspended.companyId));
    const normalDoc = await t.run((ctx) => ctx.db.get(normal.companyId));

    const page = await t.query(api.companies.directory.listPublicCompanies, {
      paginationOpts: { numItems: 20, cursor: null },
      verifiedOnly: false,
      sort: "newest",
    });
    expect(page.page.map((row) => row.id)).toContain(normal.companyId);
    expect(page.page.map((row) => row.id)).not.toContain(suspended.companyId);

    const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: suspendedDoc!.slug! });
    expect(profile).toMatchObject({ id: suspended.companyId, marketplaceAvailable: false });
    expect(JSON.stringify(profile)).not.toContain("suspended");
    expect(JSON.stringify(profile)).not.toContain("needs_attention");
    await expect(t.query(api.portfolio.index.getPublicCompanyProfile, { slug: normalDoc!.slug! }))
      .resolves.toMatchObject({ marketplaceAvailable: true });
  });
});
