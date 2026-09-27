/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
type AccountType = "client" | "company" | "admin" | "seo_team";
const notificationPage = { paginationOpts: { numItems: 20, cursor: null } };

async function seedUser(t: Backend, accountType: AccountType) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@invitation.test`,
      firstName: accountType === "client" ? "Khadija" : "Youssef",
      lastName: "Test",
      accountType,
      onboardingStatus: "completed",
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function seedCompany(
  t: Backend,
  verificationStatus: "verified" | "pending" = "verified",
) {
  const userId = await seedUser(t, "company");
  const companyId = await t.run((ctx) =>
    ctx.db.insert("companies", {
      name: `Atlas ${crypto.randomUUID().slice(0, 5)}`,
      slug: `atlas-${crypto.randomUUID()}`,
      city: "Rabat",
      description:
        "A verified construction company serving clients across Morocco.",
      onboardingStatus: "completed",
      verificationStatus,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("companyMembers", {
      companyId,
      userId,
      role: "owner",
      status: "active",
      createdAt: 1,
    }),
  );
  return { userId, companyId };
}

async function seedProject(
  t: Backend,
  clientId: Id<"users">,
  status:
    | "draft"
    | "pending_review"
    | "needs_changes"
    | "published"
    | "in_discussion"
    | "company_selected"
    | "in_progress"
    | "completed"
    | "cancelled"
    | "archived" = "published",
  visibility: "marketplace" | "invite_only" = "invite_only",
) {
  return await t.run((ctx) =>
    ctx.db.insert("projects", {
      clientId,
      primaryCategory: "renovation",
      city: "rabat",
      countryCode: "MA",
      title: "Direct apartment renovation",
      propertyType: "apartment",
      surface: 100,
      surfaceUnknown: false,
      description:
        "A complete apartment renovation with plumbing and electrical work.",
      budgetRange: "100000_250000",
      budgetMin: 100_000,
      budgetMax: 250_000,
      budgetUnknown: false,
      timeline: "one_to_three_months",
      visibility,
      status,
      lastCompletedStep: 6,
      createdAt: 1,
      updatedAt: 1,
      submittedAt: 1,
      publishedAt: 1,
    }),
  );
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}

async function setup() {
  const t = convexTest(schema, modules);
  const clientId = await seedUser(t, "client");
  const otherClientId = await seedUser(t, "client");
  const company = await seedCompany(t);
  const otherCompany = await seedCompany(t);
  const projectId = await seedProject(t, clientId);
  return { t, clientId, otherClientId, company, otherCompany, projectId };
}

const validQuote = {
  message: "We can deliver this renovation with a dedicated site team.",
  estimatedPrice: 185_000,
  estimatedDuration: 75,
  availableStartDate: "2099-01-15",
  scope: "Demolition, plumbing, electrical work, finishes, and site cleanup.",
};

describe("direct company invitation authorization and creation", () => {
  test("only the owning client can invite an eligible company to an eligible project", async () => {
    const state = await setup();
    const activeStaffId = await seedUser(state.t, "company");
    const inactiveStaffId = await seedUser(state.t, "company");
    await state.t.run(async (ctx) => {
      await ctx.db.insert("companyMembers", {
        companyId: state.company.companyId,
        userId: activeStaffId,
        role: "staff",
        status: "active",
        createdAt: 1,
      });
      await ctx.db.insert("companyMembers", {
        companyId: state.company.companyId,
        userId: inactiveStaffId,
        role: "staff",
        status: "inactive",
        createdAt: 1,
      });
    });
    const adminId = await seedUser(state.t, "admin");
    const seoId = await seedUser(state.t, "seo_team");
    const args = {
      companyId: state.company.companyId,
      projectId: state.projectId,
      message: "Please review our renovation project.",
    };

    await expect(
      state.t.mutation(api.invitations.index.inviteCompanyToProject, args),
    ).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.invitations.index.inviteCompanyToProject,
        args,
      ),
    ).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    await expect(
      asUser(state.t, adminId).mutation(
        api.invitations.index.inviteCompanyToProject,
        args,
      ),
    ).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    await expect(
      asUser(state.t, seoId).mutation(
        api.invitations.index.inviteCompanyToProject,
        args,
      ),
    ).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    await expect(
      asUser(state.t, state.otherClientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        args,
      ),
    ).rejects.toThrow("PROJECT_NOT_FOUND");

    const result = await asUser(state.t, state.clientId).mutation(
      api.invitations.index.inviteCompanyToProject,
      args,
    );
    expect(result.status).toBe("pending");
    await expect(
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        args,
      ),
    ).rejects.toThrow("ACTIVE_INVITATION_ALREADY_EXISTS");

    const stored = await state.t.run(async (ctx) => ({
      invitation: await ctx.db.get(result.invitationId),
      history: await ctx.db
        .query("invitationStatusHistory")
        .withIndex("by_invitationId_and_createdAt", (q) =>
          q.eq("invitationId", result.invitationId),
        )
        .take(10),
      activity: await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_projectId_and_createdAt", (q) =>
          q.eq("projectId", state.projectId),
        )
        .take(10),
    }));
    expect(stored.invitation).toMatchObject({
      projectId: state.projectId,
      clientUserId: state.clientId,
      companyId: state.company.companyId,
      status: "pending",
      message: args.message,
    });
    expect(stored.history).toEqual([
      expect.objectContaining({
        toStatus: "pending",
        actorUserId: state.clientId,
      }),
    ]);
    expect(stored.activity).toEqual([
      expect.objectContaining({
        eventType: "company_invited",
        invitationId: result.invitationId,
      }),
    ]);
    for (const recipientUserId of [state.company.userId, activeStaffId]) {
      const notifications = await asUser(state.t, recipientUserId).query(
        api.notifications.index.listMyNotifications,
        notificationPage,
      );
      expect(notifications.page).toEqual([
        expect.objectContaining({
          type: "invitation_received",
          entity: { type: "invitation", id: result.invitationId },
          actorUserId: state.clientId,
          payload: {
            projectTitle: "Direct apartment renovation",
            companyName: expect.any(String),
          },
          readAt: null,
        }),
      ]);
      await expect(asUser(state.t, recipientUserId).query(
        api.notifications.index.getMyUnreadCount,
        {},
      )).resolves.toBe(1);
    }
    for (const excludedUserId of [
      inactiveStaffId,
      state.otherCompany.userId,
      state.clientId,
      state.otherClientId,
    ]) {
      expect((await asUser(state.t, excludedUserId).query(
        api.notifications.index.listMyNotifications,
        notificationPage,
      )).page).toEqual([]);
    }
    const receivedNotifications = await state.t.run((ctx) => ctx.db
      .query("notifications")
      .withIndex("by_recipientUserId_and_dedupeKey", (q) => q
        .eq("recipientUserId", state.company.userId)
        .eq("dedupeKey", `invitation:${result.invitationId}:received`))
      .take(2));
    expect(receivedNotifications).toHaveLength(1);
  });

  test("rejects unverified companies and selected or completed projects", async () => {
    const state = await setup();
    const pendingCompany = await seedCompany(state.t, "pending");
    await expect(
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        { companyId: pendingCompany.companyId, projectId: state.projectId },
      ),
    ).rejects.toThrow("COMPANY_NOT_ELIGIBLE_FOR_INVITATION");
    const inactiveCompany = await seedCompany(state.t);
    await state.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("companyMembers")
        .withIndex("by_companyId_and_userId", (q) =>
          q
            .eq("companyId", inactiveCompany.companyId)
            .eq("userId", inactiveCompany.userId),
        )
        .unique();
      if (membership)
        await ctx.db.patch(membership._id, { status: "inactive" });
    });
    await expect(
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        { companyId: inactiveCompany.companyId, projectId: state.projectId },
      ),
    ).rejects.toThrow("COMPANY_NOT_ELIGIBLE_FOR_INVITATION");
    for (const status of ["company_selected", "completed"] as const) {
      const projectId = await seedProject(state.t, state.clientId, status);
      await expect(
        asUser(state.t, state.clientId).mutation(
          api.invitations.index.inviteCompanyToProject,
          { companyId: state.company.companyId, projectId },
        ),
      ).rejects.toThrow("PROJECT_NOT_ELIGIBLE_FOR_INVITATION");
    }

    for (const status of [
      "draft",
      "pending_review",
      "needs_changes",
      "in_progress",
      "cancelled",
      "archived",
    ] as const) {
      const projectId = await seedProject(state.t, state.clientId, status);
      await expect(
        asUser(state.t, state.clientId).mutation(
          api.invitations.index.inviteCompanyToProject,
          { companyId: state.company.companyId, projectId },
        ),
      ).rejects.toThrow("PROJECT_NOT_ELIGIBLE_FOR_INVITATION");
    }
  });

  test("rejects missing companies and concurrent retries create one invitation", async () => {
    const state = await setup();
    const removedCompany = await seedCompany(state.t);
    await state.t.run((ctx) => ctx.db.delete(removedCompany.companyId));
    await expect(
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        {
          companyId: removedCompany.companyId,
          projectId: state.projectId,
        },
      ),
    ).rejects.toThrow("COMPANY_NOT_FOUND");

    const args = {
      companyId: state.company.companyId,
      projectId: state.projectId,
    };
    const attempts = await Promise.allSettled([
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        args,
      ),
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        args,
      ),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    const stored = await state.t.run((ctx) =>
      ctx.db
        .query("invitations")
        .withIndex("by_projectId_and_companyId", (q) =>
          q
            .eq("projectId", state.projectId)
            .eq("companyId", state.company.companyId),
        )
        .take(10),
    );
    expect(stored).toHaveLength(1);
  });

  test("notification recipient integrity failure rolls back Invitation creation atomically", async () => {
    const state = await setup();
    await state.t.run((ctx) => ctx.db.delete(state.company.userId));

    await expect(asUser(state.t, state.clientId).mutation(
      api.invitations.index.inviteCompanyToProject,
      { companyId: state.company.companyId, projectId: state.projectId },
    )).rejects.toThrow("NOTIFICATION_RECIPIENT_NOT_FOUND");

    const rolledBack = await state.t.run(async (ctx) => ({
      invitations: await ctx.db
        .query("invitations")
        .withIndex("by_projectId_and_companyId", (q) => q
          .eq("projectId", state.projectId)
          .eq("companyId", state.company.companyId))
        .take(10),
      activity: await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", state.projectId))
        .take(10),
    }));
    expect(rolledBack).toEqual({ invitations: [], activity: [] });
  });

  test("rejects a frontend-supplied Invitation notification recipient", async () => {
    const state = await setup();
    const forgedArgs = {
      companyId: state.company.companyId,
      projectId: state.projectId,
      recipientUserId: state.otherCompany.userId,
    } as unknown as FunctionArgs<typeof api.invitations.index.inviteCompanyToProject>;

    await expect(asUser(state.t, state.clientId).mutation(
      api.invitations.index.inviteCompanyToProject,
      forgedArgs,
    )).rejects.toThrow();
    for (const userId of [state.company.userId, state.otherCompany.userId]) {
      expect((await asUser(state.t, userId).query(
        api.notifications.index.listMyNotifications,
        notificationPage,
      )).page).toEqual([]);
    }
  });
});

describe("invitation decisions and isolation", () => {
  test("only the invited company can accept; acceptance is historical and idempotency fails closed", async () => {
    const state = await setup();
    const created = await asUser(state.t, state.clientId).mutation(
      api.invitations.index.inviteCompanyToProject,
      { companyId: state.company.companyId, projectId: state.projectId },
    );
    await expect(
      asUser(state.t, state.otherCompany.userId).mutation(
        api.invitations.index.acceptInvitation,
        { invitationId: created.invitationId },
      ),
    ).rejects.toThrow("INVITATION_NOT_FOUND");
    await expect(
      asUser(state.t, state.otherCompany.userId).mutation(
        api.invitations.index.declineInvitation,
        { invitationId: created.invitationId },
      ),
    ).rejects.toThrow("INVITATION_NOT_FOUND");
    await expect(
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.acceptInvitation,
        { invitationId: created.invitationId },
      ),
    ).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    await asUser(state.t, state.company.userId).mutation(
      api.invitations.index.acceptInvitation,
      { invitationId: created.invitationId },
    );
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.invitations.index.acceptInvitation,
        { invitationId: created.invitationId },
      ),
    ).rejects.toThrow("INVITATION_ALREADY_ACCEPTED");

    const clientNotifications = await asUser(state.t, state.clientId).query(
      api.notifications.index.listMyNotifications,
      notificationPage,
    );
    expect(clientNotifications.page).toEqual([
      expect.objectContaining({
        type: "invitation_accepted",
        entity: { type: "invitation", id: created.invitationId },
        actorUserId: state.company.userId,
        payload: {
          projectTitle: "Direct apartment renovation",
          companyName: expect.any(String),
        },
        readAt: null,
      }),
    ]);
    await expect(asUser(state.t, state.clientId).query(
      api.notifications.index.getMyUnreadCount,
      {},
    )).resolves.toBe(1);
    expect((await asUser(state.t, state.company.userId).query(
      api.notifications.index.listMyNotifications,
      notificationPage,
    )).page.map((notification) => notification.type)).toEqual(["invitation_received"]);
    expect((await asUser(state.t, state.otherCompany.userId).query(
      api.notifications.index.listMyNotifications,
      notificationPage,
    )).page).toEqual([]);
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.invitations.index.declineInvitation,
        { invitationId: created.invitationId },
      ),
    ).rejects.toThrow("INVITATION_ALREADY_ACCEPTED");

    const own = await asUser(state.t, state.company.userId).query(
      api.invitations.index.listMyCompanyInvitations,
      {},
    );
    const other = await asUser(state.t, state.otherCompany.userId).query(
      api.invitations.index.listMyCompanyInvitations,
      {},
    );
    const clientRows = await asUser(state.t, state.clientId).query(
      api.invitations.index.listProjectInvitations,
      { projectId: state.projectId },
    );
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({
      id: created.invitationId,
      status: "accepted",
      projectId: state.projectId,
    });
    expect(other).toEqual([]);
    expect(clientRows).toHaveLength(1);
    await expect(
      asUser(state.t, state.otherClientId).query(
        api.invitations.index.listProjectInvitations,
        { projectId: state.projectId },
      ),
    ).rejects.toThrow("PROJECT_NOT_FOUND");

    const stored = await state.t.run(async (ctx) => ({
      project: await ctx.db.get(state.projectId),
      invitation: await ctx.db.get(created.invitationId),
      history: await ctx.db
        .query("invitationStatusHistory")
        .withIndex("by_invitationId_and_createdAt", (q) =>
          q.eq("invitationId", created.invitationId),
        )
        .take(10),
      activity: await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_projectId_and_createdAt", (q) =>
          q.eq("projectId", state.projectId),
        )
        .take(10),
    }));
    expect(stored.project?.status).toBe("in_discussion");
    expect(stored.invitation).toMatchObject({
      status: "accepted",
      acceptedAt: expect.any(Number),
    });
    expect(stored.history).toEqual([
      expect.objectContaining({
        toStatus: "pending",
        actorUserId: state.clientId,
      }),
      expect.objectContaining({
        fromStatus: "pending",
        toStatus: "accepted",
        actorUserId: state.company.userId,
      }),
    ]);
    expect(stored.activity).toEqual([
      expect.objectContaining({ eventType: "company_invited" }),
      expect.objectContaining({
        eventType: "company_invitation_accepted",
        oldStatus: "pending",
        newStatus: "accepted",
      }),
    ]);
    await expect(
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        {
          companyId: state.company.companyId,
          projectId: state.projectId,
        },
      ),
    ).rejects.toThrow("INVITATION_ALREADY_ACCEPTED");
  });

  test("decline preserves the record, keeps messaging locked, and cannot be reversed", async () => {
    const state = await setup();
    const created = await asUser(state.t, state.clientId).mutation(
      api.invitations.index.inviteCompanyToProject,
      { companyId: state.company.companyId, projectId: state.projectId },
    );
    await asUser(state.t, state.company.userId).mutation(
      api.invitations.index.declineInvitation,
      { invitationId: created.invitationId },
    );
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.invitations.index.acceptInvitation,
        { invitationId: created.invitationId },
      ),
    ).rejects.toThrow("INVITATION_ALREADY_DECLINED");
    const clientNotifications = await asUser(state.t, state.clientId).query(
      api.notifications.index.listMyNotifications,
      notificationPage,
    );
    expect(clientNotifications.page).toEqual([
      expect.objectContaining({
        type: "invitation_declined",
        entity: { type: "invitation", id: created.invitationId },
        actorUserId: state.company.userId,
        payload: {
          projectTitle: "Direct apartment renovation",
          companyName: expect.any(String),
        },
      }),
    ]);
    await expect(asUser(state.t, state.clientId).query(
      api.notifications.index.getMyUnreadCount,
      {},
    )).resolves.toBe(1);
    expect((await asUser(state.t, state.company.userId).query(
      api.notifications.index.listMyNotifications,
      notificationPage,
    )).page.map((notification) => notification.type)).toEqual(["invitation_received"]);
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.invitations.index.declineInvitation,
        { invitationId: created.invitationId },
      ),
    ).rejects.toThrow("INVITATION_ALREADY_DECLINED");
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.quotes.index.submitInitialQuote,
        { projectId: state.projectId, ...validQuote },
      ),
    ).rejects.toThrow("PROJECT_NOT_ACCEPTING_QUOTES");
    const stored = await state.t.run(async (ctx) => ({
      invitation: await ctx.db.get(created.invitationId),
      history: await ctx.db
        .query("invitationStatusHistory")
        .withIndex("by_invitationId_and_createdAt", (q) =>
          q.eq("invitationId", created.invitationId),
        )
        .take(10),
      activity: await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_projectId_and_createdAt", (q) =>
          q.eq("projectId", state.projectId),
        )
        .take(10),
      conversations: await ctx.db
        .query("conversations")
        .withIndex("by_projectId_and_companyId", (q) =>
          q
            .eq("projectId", state.projectId)
            .eq("companyId", state.company.companyId),
        )
        .take(10),
    }));
    expect(stored.invitation).toMatchObject({
      status: "declined",
      declinedAt: expect.any(Number),
    });
    expect(stored.history).toEqual([
      expect.objectContaining({
        toStatus: "pending",
        actorUserId: state.clientId,
      }),
      expect.objectContaining({
        fromStatus: "pending",
        toStatus: "declined",
        actorUserId: state.company.userId,
      }),
    ]);
    expect(stored.activity).toEqual([
      expect.objectContaining({ eventType: "company_invited" }),
      expect.objectContaining({
        eventType: "company_invitation_declined",
        oldStatus: "pending",
        newStatus: "declined",
      }),
    ]);
    expect(stored.conversations).toEqual([]);
    await expect(
      asUser(state.t, state.clientId).mutation(
        api.invitations.index.inviteCompanyToProject,
        {
          companyId: state.company.companyId,
          projectId: state.projectId,
        },
      ),
    ).rejects.toThrow("INVITATION_ALREADY_DECLINED");
  });

  test("acceptance rechecks company membership, verification, and project state", async () => {
    const state = await setup();
    const membershipInvitation = await asUser(state.t, state.clientId).mutation(
      api.invitations.index.inviteCompanyToProject,
      { companyId: state.company.companyId, projectId: state.projectId },
    );
    await state.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("companyMembers")
        .withIndex("by_companyId_and_userId", (q) =>
          q
            .eq("companyId", state.company.companyId)
            .eq("userId", state.company.userId),
        )
        .unique();
      if (membership)
        await ctx.db.patch(membership._id, { status: "inactive" });
    });
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.invitations.index.acceptInvitation,
        { invitationId: membershipInvitation.invitationId },
      ),
    ).rejects.toThrow("COMPANY_MEMBERSHIP_REQUIRED");

    const verificationState = await setup();
    const verificationInvitation = await asUser(
      verificationState.t,
      verificationState.clientId,
    ).mutation(api.invitations.index.inviteCompanyToProject, {
      companyId: verificationState.company.companyId,
      projectId: verificationState.projectId,
    });
    await verificationState.t.run((ctx) =>
      ctx.db.patch(verificationState.company.companyId, {
        verificationStatus: "rejected",
      }),
    );
    await expect(
      asUser(verificationState.t, verificationState.company.userId).mutation(
        api.invitations.index.acceptInvitation,
        { invitationId: verificationInvitation.invitationId },
      ),
    ).rejects.toThrow("COMPANY_NOT_ELIGIBLE_FOR_INVITATION");

    const projectState = await setup();
    const projectInvitation = await asUser(
      projectState.t,
      projectState.clientId,
    ).mutation(api.invitations.index.inviteCompanyToProject, {
      companyId: projectState.company.companyId,
      projectId: projectState.projectId,
    });
    await projectState.t.run((ctx) =>
      ctx.db.patch(projectState.projectId, { status: "cancelled" }),
    );
    await expect(
      asUser(projectState.t, projectState.company.userId).mutation(
        api.invitations.index.acceptInvitation,
        { invitationId: projectInvitation.invitationId },
      ),
    ).rejects.toThrow("PROJECT_NOT_ELIGIBLE_FOR_INVITATION");
  });
});

describe("accepted invitation convergence", () => {
  test("pending and declined invitations lock the same company out of the open-project path", async () => {
    const state = await setup();
    const marketplaceProjectId = await seedProject(
      state.t,
      state.clientId,
      "published",
      "marketplace",
    );
    const created = await asUser(state.t, state.clientId).mutation(
      api.invitations.index.inviteCompanyToProject,
      { companyId: state.company.companyId, projectId: marketplaceProjectId },
    );

    await expect(
      asUser(state.t, state.company.userId).query(
        api.projects.marketplace.getCompanyMarketplaceProject,
        { projectId: marketplaceProjectId },
      ),
    ).resolves.toBeNull();
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.quotes.index.submitInitialQuote,
        { projectId: marketplaceProjectId, ...validQuote },
      ),
    ).rejects.toThrow("PROJECT_NOT_ACCEPTING_QUOTES");

    await expect(
      asUser(state.t, state.otherCompany.userId).query(
        api.projects.marketplace.getCompanyMarketplaceProject,
        { projectId: marketplaceProjectId },
      ),
    ).resolves.toMatchObject({
      id: marketplaceProjectId,
      canSubmitQuote: true,
    });

    await asUser(state.t, state.company.userId).mutation(
      api.invitations.index.declineInvitation,
      { invitationId: created.invitationId },
    );
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.quotes.index.submitInitialQuote,
        { projectId: marketplaceProjectId, ...validQuote },
      ),
    ).rejects.toThrow("PROJECT_NOT_ACCEPTING_QUOTES");
  });

  test("pending is locked; accepted direct proposal opens the existing conversation and quote pipeline", async () => {
    const state = await setup();
    const created = await asUser(state.t, state.clientId).mutation(
      api.invitations.index.inviteCompanyToProject,
      { companyId: state.company.companyId, projectId: state.projectId },
    );
    await expect(
      asUser(state.t, state.company.userId).query(
        api.quotes.index.getSubmissionContext,
        { projectId: state.projectId },
      ),
    ).resolves.toBeNull();
    await expect(
      asUser(state.t, state.company.userId).query(
        api.projects.marketplace.getCompanyMarketplaceProject,
        { projectId: state.projectId },
      ),
    ).resolves.toBeNull();
    await expect(
      asUser(state.t, state.company.userId).mutation(
        api.quotes.index.submitInitialQuote,
        { projectId: state.projectId, ...validQuote },
      ),
    ).rejects.toThrow("PROJECT_NOT_ACCEPTING_QUOTES");

    await asUser(state.t, state.company.userId).mutation(
      api.invitations.index.acceptInvitation,
      { invitationId: created.invitationId },
    );
    await expect(
      asUser(state.t, state.company.userId).query(
        api.quotes.index.getSubmissionContext,
        { projectId: state.projectId },
      ),
    ).resolves.toMatchObject({ project: { id: state.projectId } });
    await expect(
      asUser(state.t, state.company.userId).query(
        api.projects.marketplace.getCompanyMarketplaceProject,
        { projectId: state.projectId },
      ),
    ).resolves.toMatchObject({ id: state.projectId, canSubmitQuote: true });
    const submitted = await asUser(state.t, state.company.userId).mutation(
      api.quotes.index.submitInitialQuote,
      { projectId: state.projectId, ...validQuote },
    );
    expect(submitted).toMatchObject({
      status: "discussion_open",
      conversationId: expect.any(String),
    });
    if (!submitted.conversationId)
      throw new Error("Expected direct conversation");

    await expect(
      asUser(state.t, state.clientId).mutation(api.messages.index.sendMessage, {
        conversationId: submitted.conversationId,
        body: "Thank you for accepting our invitation.",
      }),
    ).resolves.toMatchObject({ duplicate: false });
    await expect(
      asUser(state.t, state.company.userId).query(
        api.messages.index.listMessages,
        {
          conversationId: submitted.conversationId,
          paginationOpts: { numItems: 10, cursor: null },
        },
      ),
    ).resolves.toMatchObject({
      page: [
        expect.objectContaining({
          body: "Thank you for accepting our invitation.",
        }),
      ],
    });
    await expect(
      asUser(state.t, state.otherCompany.userId).mutation(
        api.messages.index.sendMessage,
        {
          conversationId: submitted.conversationId,
          body: "Cross-company access",
        },
      ),
    ).rejects.toThrow("CONVERSATION_NOT_FOUND");

    const quotes = await asUser(state.t, state.clientId).query(
      api.quotes.index.listReceivedInitialQuotes,
      { projectId: state.projectId },
    );
    expect(quotes).toEqual([
      expect.objectContaining({
        id: submitted.quoteId,
        status: "discussion_open",
        companyId: state.company.companyId,
      }),
    ]);
  });
});
