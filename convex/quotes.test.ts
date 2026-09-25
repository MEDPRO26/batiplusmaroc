/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestBackend = ReturnType<typeof convexTest>;
type ProjectStatus = "draft" | "pending_review" | "published" | "cancelled";

async function seedUser(
  t: TestBackend,
  accountType: "client" | "company",
  onboardingStatus: "pending" | "completed" = "completed",
) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@quote.test`,
      firstName: accountType === "client" ? "Khadija" : "Youssef",
      lastName: accountType === "client" ? "Client" : "Company",
      accountType,
      onboardingStatus,
      countryCode: "MA",
      createdAt: 100,
      updatedAt: 100,
    }),
  );
}

async function seedCompany(
  t: TestBackend,
  verificationStatus: "draft" | "pending" | "verified" | "rejected" = "verified",
  onboardingStatus: "pending" | "completed" = "completed",
) {
  const userId = await seedUser(t, "company", onboardingStatus);
  const companyId = await t.run((ctx) =>
    ctx.db.insert("companies", {
      name: `Atlas ${crypto.randomUUID().slice(0, 5)}`,
      slug: `atlas-${crypto.randomUUID()}`,
      city: "Rabat",
      description: "A public construction company profile.",
      onboardingStatus,
      verificationStatus,
      createdAt: 100,
      updatedAt: 100,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("companyMembers", {
      companyId,
      userId,
      role: "owner",
      status: "active",
      createdAt: 100,
    }),
  );
  return { userId, companyId };
}

async function seedProject(
  t: TestBackend,
  clientId: Id<"users">,
  status: ProjectStatus = "published",
  visibility: "marketplace" | "invite_only" = "marketplace",
) {
  return await t.run((ctx) =>
    ctx.db.insert("projects", {
      clientId,
      primaryCategory: "renovation",
      city: "rabat",
      countryCode: "MA",
      title: "Renovation of a family apartment",
      propertyType: "apartment",
      surface: 120,
      surfaceUnknown: false,
      description: "Complete apartment renovation with plumbing and electrical work.",
      budgetRange: "100000_250000",
      budgetMin: 100_000,
      budgetMax: 250_000,
      budgetUnknown: false,
      timeline: "one_to_three_months",
      visibility,
      status,
      lastCompletedStep: 6,
      createdAt: 100,
      updatedAt: 100,
      submittedAt: 100,
      publishedAt: status === "published" ? 100 : undefined,
    }),
  );
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}

const validQuote = {
  message: "We can deliver this renovation with a dedicated site team.",
  estimatedPrice: 185_000,
  estimatedDuration: 75,
  availableStartDate: "2099-01-15",
  scope: "Demolition, plumbing, electrical work, finishes, and site cleanup.",
} satisfies Omit<
  FunctionArgs<typeof api.quotes.index.submitInitialQuote>,
  "projectId"
>;

async function setup(status: ProjectStatus = "published") {
  const t = convexTest(schema, modules);
  const clientId = await seedUser(t, "client");
  const projectId = await seedProject(t, clientId, status);
  const company = await seedCompany(t);
  return { t, clientId, projectId, company };
}

describe("initial quote submission", () => {
  test("verified company submits once and creates immutable submission history", async () => {
    const { t, projectId, company } = await setup();
    const result = await asUser(t, company.userId).mutation(
      api.quotes.index.submitInitialQuote,
      { projectId, ...validQuote },
    );
    expect(result.status).toBe("submitted");
    const state = await t.run(async (ctx) => ({
      quote: await ctx.db.get(result.quoteId),
      history: await ctx.db
        .query("quoteStatusHistory")
        .withIndex("by_quoteId", (q) => q.eq("quoteId", result.quoteId))
        .take(10),
      activity: await ctx.db
        .query("marketplaceActivity")
        .withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", projectId))
        .take(10),
    }));
    expect(state.quote?.estimatedPrice).toBe(185_000);
    expect(state.quote).toMatchObject({
      projectId,
      companyId: company.companyId,
      submittedByUserId: company.userId,
      currency: "MAD",
      quoteType: "initial",
      status: "submitted",
    });
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({
      oldStatus: "draft",
      newStatus: "submitted",
      changedBy: company.userId,
    });
    expect(state.activity).toEqual([
      expect.objectContaining({
        eventType: "initial_quote_submitted",
        actorUserId: company.userId,
        actorType: "company",
        companyId: company.companyId,
        quoteId: result.quoteId,
      }),
    ]);
  });

  test("rejects unauthenticated users, clients, incomplete companies, and unverified companies", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client");
    const projectId = await seedProject(t, clientId);
    await expect(
      t.mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote }),
    ).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(
      asUser(t, clientId).mutation(api.quotes.index.submitInitialQuote, {
        projectId,
        ...validQuote,
      }),
    ).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");

    const incomplete = await seedCompany(t, "verified", "pending");
    await expect(
      asUser(t, incomplete.userId).mutation(api.quotes.index.submitInitialQuote, {
        projectId,
        ...validQuote,
      }),
    ).rejects.toThrow("COMPANY_ONBOARDING_REQUIRED");

    for (const verificationStatus of ["draft", "pending", "rejected"] as const) {
      const company = await seedCompany(t, verificationStatus);
      await expect(
        asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, {
          projectId,
          ...validQuote,
        }),
      ).rejects.toThrow("COMPANY_VERIFICATION_REQUIRED");
    }
  });

  test.each(["draft", "pending_review", "cancelled"] as const)(
    "rejects a %s project",
    async (status) => {
      const { t, projectId, company } = await setup(status);
      await expect(
        asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, {
          projectId,
          ...validQuote,
        }),
      ).rejects.toThrow("PROJECT_NOT_ACCEPTING_QUOTES");
    },
  );

  test("rejects an invite-only project", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client");
    const projectId = await seedProject(t, clientId, "published", "invite_only");
    const company = await seedCompany(t);
    await expect(
      asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, {
        projectId,
        ...validQuote,
      }),
    ).rejects.toThrow("PROJECT_NOT_ACCEPTING_QUOTES");
  });

  test("rejects a second active quote for the same company and project", async () => {
    const { t, projectId, company } = await setup();
    const caller = asUser(t, company.userId);
    await caller.mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote });
    await expect(
      caller.mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote }),
    ).rejects.toThrow("ACTIVE_QUOTE_ALREADY_EXISTS");
    const quotes = await t.run((ctx) =>
      ctx.db
        .query("projectQuotes")
        .withIndex("by_projectId_and_companyId", (q) =>
          q.eq("projectId", projectId).eq("companyId", company.companyId),
        )
        .take(10),
    );
    expect(quotes).toHaveLength(1);
  });

  test("project detail switches from submit to view-my-quote after submission", async () => {
    const { t, projectId, company } = await setup();
    const caller = asUser(t, company.userId);
    const before = await caller.query(api.projects.marketplace.getCompanyMarketplaceProject, {
      projectId,
    });
    expect(before).toMatchObject({ canSubmitQuote: true, myQuoteId: null });
    const { quoteId } = await caller.mutation(api.quotes.index.submitInitialQuote, {
      projectId,
      ...validQuote,
    });
    const after = await caller.query(api.projects.marketplace.getCompanyMarketplaceProject, {
      projectId,
    });
    expect(after).toMatchObject({ canSubmitQuote: false, myQuoteId: quoteId });
  });

  test("persists whole MAD amounts such as 300000 without truncating", async () => {
    const { t, projectId, company } = await setup();
    const result = await asUser(t, company.userId).mutation(
      api.quotes.index.submitInitialQuote,
      { projectId, ...validQuote, estimatedPrice: 300_000 },
    );
    const quote = await t.run((ctx) => ctx.db.get(result.quoteId));
    expect(quote?.estimatedPrice).toBe(300_000);
    expect(quote?.estimatedPrice).not.toBe(300);
  });

  test("rechecks project state inside the submit transaction", async () => {
    const { t, projectId, company } = await setup();
    await t.run((ctx) => ctx.db.patch(projectId, { status: "cancelled" }));
    await expect(
      asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, {
        projectId,
        ...validQuote,
      }),
    ).rejects.toThrow("PROJECT_NOT_ACCEPTING_QUOTES");
  });

  test.each([
    [{ ...validQuote, estimatedPrice: 0 }, "INVALID_QUOTE_PRICE"],
    [{ ...validQuote, estimatedPrice: 100_000_001 }, "INVALID_QUOTE_PRICE"],
    [{ ...validQuote, estimatedDuration: 0 }, "INVALID_QUOTE_DURATION"],
    [{ ...validQuote, estimatedDuration: 1.5 }, "INVALID_QUOTE_DURATION"],
    [{ ...validQuote, availableStartDate: "not-a-date" }, "INVALID_QUOTE_DATE"],
    [{ ...validQuote, availableStartDate: "2020-01-01" }, "INVALID_QUOTE_DATE"],
    [{ ...validQuote, message: "Too short" }, "INVALID_QUOTE_MESSAGE"],
    [{ ...validQuote, scope: "Too short" }, "INVALID_QUOTE_SCOPE"],
  ] as const)("rejects invalid quote input", async (input, errorCode) => {
    const { t, projectId, company } = await setup();
    await expect(
      asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, {
        projectId,
        ...input,
      }),
    ).rejects.toThrow(errorCode);
  });
});

describe("initial quote privacy and withdrawal", () => {
  test("company A can read only its own quote and company B cannot read or withdraw it", async () => {
    const { t, projectId, company: companyA } = await setup();
    const companyB = await seedCompany(t);
    const { quoteId } = await asUser(t, companyA.userId).mutation(
      api.quotes.index.submitInitialQuote,
      { projectId, ...validQuote },
    );
    await expect(
      asUser(t, companyA.userId).query(api.quotes.index.getMyQuote, { quoteId }),
    ).resolves.toMatchObject({ id: quoteId, companyId: companyA.companyId });
    await expect(
      asUser(t, companyB.userId).query(api.quotes.index.getMyQuote, { quoteId }),
    ).rejects.toThrow("QUOTE_NOT_FOUND");
    await expect(
      asUser(t, companyB.userId).mutation(api.quotes.index.withdrawInitialQuote, { quoteId }),
    ).rejects.toThrow("QUOTE_NOT_FOUND");
  });

  test("project owner sees safe received quotes while another client cannot", async () => {
    const { t, clientId, projectId, company } = await setup();
    await asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, {
      projectId,
      ...validQuote,
    });
    const received = await asUser(t, clientId).query(
      api.quotes.index.listReceivedInitialQuotes,
      { projectId },
    );
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      message: validQuote.message,
      estimatedPrice: validQuote.estimatedPrice,
      company: { name: expect.any(String), slug: expect.any(String) },
    });
    expect(received[0]).not.toHaveProperty("submittedByUserId");

    const otherClient = await seedUser(t, "client");
    await expect(
      asUser(t, otherClient).query(api.quotes.index.listReceivedInitialQuotes, { projectId }),
    ).rejects.toThrow("PROJECT_NOT_FOUND");
  });

  test("owning company withdraws without deletion and appends immutable history", async () => {
    const { t, projectId, company } = await setup();
    const caller = asUser(t, company.userId);
    const { quoteId } = await caller.mutation(api.quotes.index.submitInitialQuote, {
      projectId,
      ...validQuote,
    });
    await expect(
      caller.mutation(api.quotes.index.withdrawInitialQuote, { quoteId }),
    ).resolves.toEqual({ status: "withdrawn" });
    const state = await t.run(async (ctx) => ({
      quote: await ctx.db.get(quoteId),
      history: await ctx.db
        .query("quoteStatusHistory")
        .withIndex("by_quoteId_and_changedAt", (q) => q.eq("quoteId", quoteId))
        .order("asc")
        .take(10),
    }));
    expect(state.quote).toMatchObject({ status: "withdrawn" });
    expect(state.quote?.withdrawnAt).toEqual(expect.any(Number));
    expect(state.history.map((item) => [item.oldStatus, item.newStatus])).toEqual([
      ["draft", "submitted"],
      ["submitted", "withdrawn"],
    ]);
    await expect(
      caller.mutation(api.quotes.index.withdrawInitialQuote, { quoteId }),
    ).rejects.toThrow("QUOTE_NOT_WITHDRAWABLE");
  });

  test("submitting a quote does not create or unlock a message thread", async () => {
    const { t, projectId, company } = await setup();
    const caller = asUser(t, company.userId);
    await caller.mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote });
    await expect(caller.query(api.messages.index.listMyThreads, {})).resolves.toEqual([]);
  });
});

describe("client reviews initial quotes", () => {
  test("only the project owner can list and open received quote details", async () => {
    const { t, clientId, projectId, company } = await setup();
    const { quoteId } = await asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote });
    const owner = asUser(t, clientId);
    await expect(owner.query(api.quotes.index.listReceivedInitialQuotes, { projectId })).resolves.toHaveLength(1);
    await expect(owner.query(api.quotes.index.getReceivedInitialQuote, { quoteId })).resolves.toMatchObject({ id: quoteId, companyId: company.companyId, status: "submitted" });

    const otherClient = await seedUser(t, "client");
    await expect(asUser(t, otherClient).query(api.quotes.index.getReceivedInitialQuote, { quoteId })).rejects.toThrow("PROJECT_NOT_FOUND");
    const competitor = await seedCompany(t);
    await expect(asUser(t, competitor.userId).query(api.quotes.index.listReceivedInitialQuotes, { projectId })).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    await expect(t.query(api.quotes.index.listReceivedInitialQuotes, { projectId })).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("records submitted -> viewed -> shortlisted -> discussion_open with immutable history", async () => {
    const { t, clientId, projectId, company } = await setup();
    const { quoteId } = await asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote });
    const owner = asUser(t, clientId);
    await expect(owner.mutation(api.quotes.index.markInitialQuoteViewed, { quoteId })).resolves.toEqual({ status: "viewed" });
    await expect(owner.mutation(api.quotes.index.reviewInitialQuote, { quoteId, action: "shortlist" })).resolves.toEqual({ status: "shortlisted", conversationId: null });
    const opened = await owner.mutation(api.quotes.index.reviewInitialQuote, { quoteId, action: "open_discussion" });
    expect(opened).toMatchObject({ status: "discussion_open", conversationId: expect.any(String) });
    const history = await t.run((ctx) => ctx.db.query("quoteStatusHistory").withIndex("by_quoteId_and_changedAt", (q) => q.eq("quoteId", quoteId)).order("asc").take(10));
    expect(history.map((item) => [item.oldStatus, item.newStatus, item.changedBy])).toEqual([
      ["draft", "submitted", company.userId],
      ["submitted", "viewed", clientId],
      ["viewed", "shortlisted", clientId],
      ["shortlisted", "discussion_open", clientId],
    ]);
    const activity = await t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", projectId)).order("asc").take(10));
    expect(activity.map((item) => item.eventType)).toEqual([
      "initial_quote_submitted",
      "quote_viewed",
      "quote_shortlisted",
      "discussion_opened",
    ]);
    expect(activity.at(-1)).toMatchObject({
      actorUserId: clientId,
      actorType: "client",
      companyId: company.companyId,
      quoteId,
      conversationId: opened.conversationId,
    });
    await expect(asUser(t, company.userId).query(api.quotes.index.getMyQuote, { quoteId })).resolves.toMatchObject({ status: "discussion_open" });
    await expect(asUser(t, company.userId).query(api.messages.index.listMyThreads, {})).resolves.toHaveLength(1);
    await expect(owner.query(api.messages.index.listMyThreads, {})).resolves.toHaveLength(1);
  });

  test("supports direct shortlist and decline while rejecting terminal-state transitions", async () => {
    const { t, clientId, projectId, company } = await setup();
    const owner = asUser(t, clientId);
    const { quoteId } = await asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote });
    await expect(owner.mutation(api.quotes.index.reviewInitialQuote, { quoteId, action: "shortlist" })).resolves.toEqual({ status: "shortlisted", conversationId: null });
    await expect(owner.mutation(api.quotes.index.reviewInitialQuote, { quoteId, action: "decline" })).resolves.toEqual({ status: "declined", conversationId: null });
    await expect(owner.mutation(api.quotes.index.reviewInitialQuote, { quoteId, action: "open_discussion" })).rejects.toThrow("INVALID_QUOTE_STATUS_TRANSITION");
    await expect(asUser(t, company.userId).query(api.quotes.index.getMyQuote, { quoteId })).resolves.toMatchObject({ status: "declined" });
  });

  test("supports submitted -> declined and rejects review of a withdrawn quote", async () => {
    const first = await setup();
    const submitted = await asUser(first.t, first.company.userId).mutation(api.quotes.index.submitInitialQuote, { projectId: first.projectId, ...validQuote });
    await expect(asUser(first.t, first.clientId).mutation(api.quotes.index.reviewInitialQuote, { quoteId: submitted.quoteId, action: "decline" })).resolves.toEqual({ status: "declined", conversationId: null });

    const second = await setup();
    const withdrawn = await asUser(second.t, second.company.userId).mutation(api.quotes.index.submitInitialQuote, { projectId: second.projectId, ...validQuote });
    await asUser(second.t, second.company.userId).mutation(api.quotes.index.withdrawInitialQuote, { quoteId: withdrawn.quoteId });
    await expect(asUser(second.t, second.clientId).mutation(api.quotes.index.reviewInitialQuote, { quoteId: withdrawn.quoteId, action: "open_discussion" })).rejects.toThrow("INVALID_QUOTE_STATUS_TRANSITION");
  });

  test("reactive query data reflects client transitions without a separate refresh endpoint", async () => {
    const { t, clientId, projectId, company } = await setup();
    const { quoteId } = await asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote });
    const owner = asUser(t, clientId);
    expect((await owner.query(api.quotes.index.listReceivedInitialQuotes, { projectId }))[0]?.status).toBe("submitted");
    await owner.mutation(api.quotes.index.markInitialQuoteViewed, { quoteId });
    expect((await owner.query(api.quotes.index.listReceivedInitialQuotes, { projectId }))[0]?.status).toBe("viewed");
    expect((await asUser(t, company.userId).query(api.quotes.index.getMyQuote, { quoteId }))?.status).toBe("viewed");
    await expect(asUser(t, company.userId).mutation(api.quotes.index.submitInitialQuote, { projectId, ...validQuote })).rejects.toThrow("ACTIVE_QUOTE_ALREADY_EXISTS");
  });
});
