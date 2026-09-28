/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

async function user(t: Backend, accountType: "admin" | "client" | "company" | "seo_team", name: string) {
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
    const seoId = await user(t, "seo_team", "SEO");
    const target = await company(t, "Atlas");
    const inactiveMemberId = await user(t, "company", "Inactive");
    await t.run((ctx) => ctx.db.insert("companyMembers", {
      companyId: target.companyId,
      userId: inactiveMemberId,
      role: "staff",
      status: "inactive",
      createdAt: 1,
    }));

    await expect(asUser(t, adminId).query(api.admin.companyOperationalStatus.get, { companyId: target.companyId }))
      .resolves.toEqual({ status: "normal" });
    const changeArgs = {
      companyId: target.companyId,
      toStatus: "suspended" as const,
      reason: "Repeated marketplace policy violations.",
    };
    await expect(t.query(api.admin.companyOperationalStatus.get, {
      companyId: target.companyId,
    })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(t.query(api.admin.companyOperationalStatus.listHistory, {
      companyId: target.companyId,
      paginationOpts: { numItems: 20, cursor: null },
    })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(t.mutation(api.admin.companyOperationalStatus.change, changeArgs))
      .rejects.toThrow("NOT_AUTHENTICATED");
    for (const deniedUserId of [clientId, target.userId, inactiveMemberId, seoId]) {
      const denied = asUser(t, deniedUserId);
      await expect(denied.query(api.admin.companyOperationalStatus.get, {
        companyId: target.companyId,
      })).rejects.toThrow("ADMIN_REQUIRED");
      await expect(denied.query(api.admin.companyOperationalStatus.listHistory, {
        companyId: target.companyId,
        paginationOpts: { numItems: 20, cursor: null },
      })).rejects.toThrow("ADMIN_REQUIRED");
      await expect(denied.mutation(api.admin.companyOperationalStatus.change, changeArgs))
        .rejects.toThrow("ADMIN_REQUIRED");
    }
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

    const privateReason = "PRIVATE-SUSPENSION-REASON-XYZ policy violations.";
    await asUser(t, adminId).mutation(api.admin.companyOperationalStatus.change, {
      companyId: target.companyId,
      toStatus: "suspended",
      reason: `  ${privateReason}  `,
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
      reason: privateReason,
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
    expect(JSON.stringify(activity.page)).not.toContain(privateReason);
    const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipientUserId).not.toBe(inactiveMemberId);
    expect(notifications[0]).toMatchObject({
      recipientUserId: target.userId,
      type: "company_suspended",
      entity: { type: "company_operational_status", id: stored.history[0]._id },
      payload: { companyId: target.companyId, companyName: "Atlas" },
      actorUserId: adminId,
    });
    expect(JSON.stringify(notifications)).not.toContain(privateReason);
    expect(JSON.stringify(notifications)).not.toContain("fromStatus");
    expect(JSON.stringify(notifications)).not.toContain("toStatus");
    expect(Object.keys(notifications[0].payload).sort()).toEqual(["companyId", "companyName"]);
  });

  test("notifies only crossings into and out of suspension", async () => {
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
    expect(notifications.page.map((row) => row.type)).toEqual([
      "company_reactivated",
      "company_suspended",
      "company_reactivated",
      "company_suspended",
    ]);
    expect(notifications.page.every((row) => row.entity.type === "company_operational_status")).toBe(true);
    expect(notifications.page.every((row) => row.payload.companyId === target.companyId)).toBe(true);
  });

  test("bounds private status history and serializes concurrent transitions", async () => {
    const t = convexTest(schema, modules);
    const adminA = await user(t, "admin", "AdminA");
    const adminB = await user(t, "admin", "AdminB");
    const target = await company(t, "Atlas", "normal");
    const admin = asUser(t, adminA);

    for (const numItems of [0, 31, 1.5, Number.NaN]) {
      await expect(admin.query(api.admin.companyOperationalStatus.listHistory, {
        companyId: target.companyId,
        paginationOpts: { numItems, cursor: null },
      })).rejects.toThrow("INVALID_COMPANY_OPERATIONAL_STATUS_PAGE_SIZE");
    }

    await Promise.all([
      asUser(t, adminA).mutation(api.admin.companyOperationalStatus.change, {
        companyId: target.companyId,
        toStatus: "suspended",
        reason: "Concurrent administrative suspension decision.",
      }),
      asUser(t, adminB).mutation(api.admin.companyOperationalStatus.change, {
        companyId: target.companyId,
        toStatus: "needs_attention",
        reason: "Concurrent administrative attention decision.",
      }),
    ]);

    const stored = await t.run(async (ctx) => ({
      company: await ctx.db.get(target.companyId),
      history: await ctx.db.query("companyOperationalStatusHistory")
        .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", target.companyId))
        .collect(),
    }));
    expect(stored.history).toHaveLength(2);
    const first = stored.history[0];
    const second = stored.history[1];
    expect(first.fromStatus).toBe("normal");
    expect(second.fromStatus).toBe(first.toStatus);
    expect(stored.company?.operationalStatus).toBe(second.toStatus);
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

  test("keeps operational support read, send, and read-state available while suspended", async () => {
    const t = convexTest(schema, modules);
    const adminId = await user(t, "admin", "Admin");
    const suspended = await company(t, "SuspendedSupport", "suspended");
    const first = await asUser(t, adminId).mutation(
      api.adminCompanyMessaging.sendAdminMessage,
      {
        companyId: suspended.companyId,
        body: "Contact Batiplus to resolve the restriction.",
        idempotencyKey: "suspended-support-admin",
      },
    );

    await expect(asUser(t, suspended.userId).query(
      api.adminCompanyMessaging.listMyMessages,
      {
        conversationId: first.conversationId,
        paginationOpts: { numItems: 20, cursor: null },
      },
    )).resolves.toMatchObject({
      page: [expect.objectContaining({ body: "Contact Batiplus to resolve the restriction." })],
    });
    await expect(asUser(t, suspended.userId).mutation(
      api.adminCompanyMessaging.markMyConversationRead,
      {
        conversationId: first.conversationId,
        readThroughMessageId: first.messageId,
      },
    )).resolves.toMatchObject({ unreadCount: 0 });
    await expect(asUser(t, suspended.userId).mutation(
      api.adminCompanyMessaging.sendCompanyMessage,
      {
        body: "We are providing the requested remediation details.",
        idempotencyKey: "suspended-support-company",
      },
    )).resolves.toMatchObject({ conversationId: first.conversationId, duplicate: false });
  });
});
