import { expect, test } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

let adminBundle = "";
let companyBundle = "";
let restrictedCompanyBundle = "";
let marketplaceBundle = "";
const companyId = "company-atlas";
const conversationId = "operational-atlas";
const fixedAt = Date.UTC(2026, 8, 28, 14, 30);

test.beforeAll(async () => {
  adminBundle = await buildHarness(
    `import { AdminShell } from "./features/admin/components/admin-shell";
     import { AdminCompanyDetailPanel } from "./features/admin/components/admin-company-detail-panel";`,
    `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminCompanyDetailPanel companyId="${companyId}" initialTab="messages" /></AdminShell>`,
  );
  companyBundle = await buildHarness(
    `import { CompanyOperationalMessaging } from "./features/operations/components/company-operational-messaging";`,
    `<CompanyOperationalMessaging />`,
  );
  restrictedCompanyBundle = await buildHarness(
    `import { CompanyNavbar } from "./components/layout/company-navbar";
     import { CompanyOperationalMessaging } from "./features/operations/components/company-operational-messaging";`,
    `<><CompanyNavbar user={{ firstName: "Sara", lastName: "Company", email: "sara@example.test", onboardingStatus: "completed" }} /><CompanyOperationalMessaging /></>`,
  );
  marketplaceBundle = await buildHarness(
    `import { MessagesInboxView } from "./features/messages/components/messages-inbox";`,
    `<MessagesInboxView accountType="company" projects={[]} threads={[{
      id: "marketplace-conversation", projectId: "project-private", quoteId: "quote-private",
      projectTitle: "Private Client Project", otherPartyName: "Private Client", otherPartyAvatarUrl: null,
      companySlug: "atlas-build", status: "active", preview: "PRIVATE_MARKETPLACE_SENTINEL",
      lastMessageAt: ${fixedAt}, unread: true
    }]} />`,
  );
});

function companySummary(overrides: Record<string, unknown> = {}) {
  return {
    id: conversationId,
    companyId,
    companyName: "Atlas Build",
    messageCount: 1,
    readThroughSequence: 0,
    unreadCount: 1,
    hasUnread: true,
    lastMessageAt: fixedAt,
    lastMessagePreview: "Operational only",
    lastSenderType: "admin",
    createdAt: fixedAt,
    updatedAt: fixedAt,
    ...overrides,
  };
}

function operationalMessage(sequence: number, body: string, senderType: "admin" | "company", isOwnMessage: boolean) {
  return {
    id: `operational-message-${sequence}`,
    conversationId,
    senderType,
    senderDisplayName: senderType === "admin" ? "Ada Admin" : "Sara Company",
    body,
    sequence,
    createdAt: fixedAt + sequence,
    isOwnMessage,
  };
}

function adminState(locale: "en" | "fr", conversation: ReturnType<typeof companySummary> | null = null) {
  return {
    __locale: locale,
    __pathname: "/admin/companies/company-atlas",
    __queries: {
      "admin.companies.getCompanySummary": {
        companyId,
        name: "Atlas Build",
        legalName: "Atlas Build SARL",
        description: "Construction company",
        city: "Rabat",
        serviceAreas: ["rabat"],
        services: ["renovation"],
        verificationStatus: "verified",
        onboardingStatus: "completed",
        createdAt: fixedAt,
        logoUrl: null,
        publicProfileSlug: "atlas-build",
        activeMemberCount: 2,
        membersTruncated: false,
        members: [],
        reviewSummary: { count: 0, rating: null },
        dealSummary: { activeCount: 0, completedCount: 0, truncated: false },
        commissionSummary: { dueCount: 0, dueAmountMad: 0, truncated: false },
        portfolio: [],
        portfolioHasMore: false,
      },
      "adminCompanyMessaging.getAdminConversation": conversation,
    },
    __paginatedQueries: {
      "adminCompanyMessaging.listAdminMessages": { status: "Exhausted", results: [] },
    },
    __mutationCalls: [],
    __privateMarketplaceSentinel: "PRIVATE_MARKETPLACE_SENTINEL_MUST_NOT_RENDER",
  };
}

function companyState(locale: "en" | "fr", options: { conversation?: ReturnType<typeof companySummary> | null; messages?: ReturnType<typeof operationalMessage>[]; status?: string } = {}) {
  return {
    __locale: locale,
    __pathname: "/espace-entreprise/batiplus",
    __queries: {
      "users.currentUser": { accountType: "company", onboardingStatus: "completed" },
      "adminCompanyMessaging.getMyConversation": options.conversation ?? null,
    },
    __paginatedQueries: {
      "adminCompanyMessaging.listMyMessages": {
        status: options.status ?? "Exhausted",
        results: options.messages ?? [],
      },
    },
    __mutationCalls: [],
    __privateMarketplaceSentinel: "PRIVATE_MARKETPLACE_SENTINEL_MUST_NOT_RENDER",
  };
}

test("Admin EN handles empty, failed, retried, and duplicate-safe sends", async ({ page }) => {
  await mountHarness(page, adminBundle, adminState("en"));
  await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No operational conversation with this company yet.")).toBeVisible();
  await expect(page.getByText("PRIVATE_MARKETPLACE_SENTINEL_MUST_NOT_RENDER")).toHaveCount(0);

  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  const draft = "Please confirm your company verification document status.";
  await composer.fill(draft);
  await page.evaluate(() => {
    (window as typeof window & { __mutationErrors: Record<string, string> }).__mutationErrors = {
      "adminCompanyMessaging.sendAdminMessage": "temporary failure",
    };
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your text is still here");
  await expect(composer).toHaveValue(draft);

  await page.evaluate(({ companyId, conversationId, fixedAt, draft }) => {
    const target = window as typeof window & {
      __mutationErrors?: Record<string, string>;
      __mutationHandlers: Record<string, () => Promise<unknown>>;
      __queries: Record<string, unknown>;
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    delete target.__mutationErrors;
    target.__mutationHandlers = {
      "adminCompanyMessaging.sendAdminMessage": async () => {
        target.__queries["adminCompanyMessaging.getAdminConversation"] = {
          id: conversationId, companyId, companyName: "Atlas Build", messageCount: 1,
          readThroughSequence: 1, unreadCount: 0, hasUnread: false,
          lastMessageAt: fixedAt, lastMessagePreview: draft, lastSenderType: "admin",
          createdAt: fixedAt, updatedAt: fixedAt,
        };
        target.__paginatedQueries["adminCompanyMessaging.listAdminMessages"] = {
          status: "Exhausted",
          results: [{ id: "admin-message", conversationId, senderType: "admin", senderDisplayName: "Ada Admin", body: draft, sequence: 1, createdAt: fixedAt, isOwnMessage: true }],
        };
        window.dispatchEvent(new Event("convex-harness-update"));
        return { conversationId, messageId: "admin-message", sequence: 1, createdAt: fixedAt, duplicate: false };
      },
    };
  }, { companyId, conversationId, fixedAt, draft });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText(draft)).toBeVisible();
  await expect(composer).toHaveValue("");
  const retryKeys = await page.evaluate(() => ((window as typeof window & { __mutationCalls: Array<{ path: string; args: { idempotencyKey?: string } }> }).__mutationCalls ?? [])
    .filter((call) => call.path === "adminCompanyMessaging.sendAdminMessage")
    .slice(0, 2)
    .map((call) => call.args.idempotencyKey));
  expect(retryKeys).toHaveLength(2);
  expect(retryKeys[0]).toBe(retryKeys[1]);

  await page.evaluate(({ conversationId, fixedAt }) => {
    const target = window as typeof window & {
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    const current = target.__paginatedQueries["adminCompanyMessaging.listAdminMessages"];
    target.__paginatedQueries["adminCompanyMessaging.listAdminMessages"] = {
      ...current,
      results: [...current.results, {
        id: "company-reply", conversationId, senderType: "company", senderDisplayName: "Sara Company",
        body: "Company reply appeared reactively", sequence: 2, createdAt: fixedAt + 2, isOwnMessage: false,
      }],
    };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { conversationId, fixedAt });
  await expect(page.getByText("Company reply appeared reactively")).toBeVisible();

  await composer.fill("One click, one mutation");
  await page.evaluate(() => {
    (window as typeof window & { __mutationDelays: Record<string, number> }).__mutationDelays = {
      "adminCompanyMessaging.sendAdminMessage": 150,
    };
  });
  const before = await page.evaluate(() => ((window as typeof window & { __mutationCalls: unknown[] }).__mutationCalls ?? []).length);
  await page.getByRole("button", { name: "Send", exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(async () => page.evaluate(() => ((window as typeof window & { __mutationCalls: unknown[] }).__mutationCalls ?? []).length)).toBe(before + 1);
});

test("Company EN loads older history, marks read, receives realtime data, replies, and stays mobile-safe", async ({ page }) => {
  const messages = [
    operationalMessage(2, "Second operational message", "company", true),
    operationalMessage(3, "ADMIN_OPERATIONAL_SENTINEL", "admin", false),
  ];
  await mountHarness(page, companyBundle, companyState("en", {
    conversation: companySummary({ messageCount: 3, unreadCount: 1 }),
    messages,
    status: "CanLoadMore",
  }));
  await expect(page.getByRole("heading", { name: "Batiplus support", exact: true }).first()).toBeVisible();
  await expect(page.getByText("ADMIN_OPERATIONAL_SENTINEL")).toBeVisible();
  await expect(page.getByText("PRIVATE_MARKETPLACE_SENTINEL_MUST_NOT_RENDER")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => ((window as typeof window & { __mutationCalls: Array<{ path: string }> }).__mutationCalls ?? []).some((call) => call.path === "adminCompanyMessaging.markMyConversationRead"))).toBe(true);

  await page.evaluate(({ conversationId, fixedAt }) => {
    const target = window as typeof window & {
      __paginationHandlers: Record<string, () => void>;
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    target.__paginationHandlers = {
      "adminCompanyMessaging.listMyMessages": () => {
        target.__paginatedQueries["adminCompanyMessaging.listMyMessages"] = {
          status: "Exhausted",
          results: [
            ...target.__paginatedQueries["adminCompanyMessaging.listMyMessages"].results,
            { id: "operational-message-1", conversationId, senderType: "admin", senderDisplayName: "Ada Admin", body: "Oldest operational message", sequence: 1, createdAt: fixedAt + 1, isOwnMessage: false },
          ],
        };
        window.dispatchEvent(new Event("convex-harness-update"));
      },
    };
  }, { conversationId, fixedAt });
  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(page.locator("[data-operational-message]")).toHaveCount(3);
  expect(await page.locator("[data-operational-message]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-operational-message")))).toEqual(["1", "2", "3"]);

  await page.evaluate(({ conversationId, fixedAt }) => {
    const target = window as typeof window & {
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    const current = target.__paginatedQueries["adminCompanyMessaging.listMyMessages"];
    target.__paginatedQueries["adminCompanyMessaging.listMyMessages"] = {
      ...current,
      results: [...current.results, {
        id: "operational-message-4", conversationId, senderType: "admin", senderDisplayName: "Ada Admin",
        body: "Realtime Admin reply", sequence: 4, createdAt: fixedAt + 4, isOwnMessage: false,
      }],
    };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { conversationId, fixedAt });
  await expect(page.getByText("Realtime Admin reply")).toBeVisible();

  await page.evaluate(({ conversationId, fixedAt }) => {
    const target = window as typeof window & {
      __mutationHandlers?: Record<string, (args: { body: string }) => Promise<unknown>>;
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    target.__mutationHandlers = {
      ...(target.__mutationHandlers || {}),
      "adminCompanyMessaging.sendCompanyMessage": async ({ body }: { body: string }) => {
        const current = target.__paginatedQueries["adminCompanyMessaging.listMyMessages"];
        target.__paginatedQueries["adminCompanyMessaging.listMyMessages"] = {
          ...current,
          results: [...current.results, {
            id: "operational-message-5", conversationId, senderType: "company", senderDisplayName: "Sara Company",
            body, sequence: 5, createdAt: fixedAt + 5, isOwnMessage: true,
          }],
        };
        window.dispatchEvent(new Event("convex-harness-update"));
        return {};
      },
    };
  }, { conversationId, fixedAt });
  const companyComposer = page.getByRole("textbox", { name: "Message", exact: true });
  await companyComposer.fill("Company operational reply");
  await companyComposer.press("Shift+Enter");
  await companyComposer.type("with a second line");
  await expect(companyComposer).toHaveValue("Company operational reply\nwith a second line");
  await companyComposer.press("Enter");
  await expect(page.getByText("Company operational reply\nwith a second line")).toBeVisible();

  for (const viewport of [{ width: 768, height: 1024 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  }
});

test("Company FR exposes the localized route purpose and composer", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mountHarness(page, companyBundle, companyState("fr"));
  await expect(page.getByRole("heading", { name: "Assistance Batiplus", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Aucune conversation avec Batiplus pour le moment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Démarrer une conversation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer", exact: true })).toBeDisabled();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test("suspended Company sees only the safe restriction state and can still use Batiplus support", async ({ page }) => {
  const state = companyState("en", {
    conversation: companySummary({ unreadCount: 0, hasUnread: false }),
    messages: [operationalMessage(1, "Support remains available", "admin", false)],
  });
  const queries = state.__queries as Record<string, unknown>;
  queries["companies.index.getOnboardingProfile"] = {
    accountRestricted: true,
    name: "Atlas Build",
    publicSlug: "atlas-build",
    verificationStatus: "verified",
    logoUrl: null,
  };
  queries["notifications.index.getMyUnreadCount"] = 0;
  await mountHarness(page, restrictedCompanyBundle, state);

  await expect(page.getByRole("status")).toContainText("marketplace access is temporarily suspended");
  await expect(page.getByRole("link", { name: "Contact Batiplus support" }))
    .toHaveAttribute("href", "/espace-entreprise/batiplus");
  await expect(page.getByText("Support remains available")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEnabled();
  await expect(page.getByText("needs_attention")).toHaveCount(0);
  await expect(page.getByText("PRIVATE-SUSPENSION-REASON-XYZ")).toHaveCount(0);
});

test("marketplace Messages never renders the operational sentinel", async ({ page }) => {
  await mountHarness(page, marketplaceBundle, {
    __locale: "en",
    __pathname: "/messages",
    __queries: {},
    __paginatedQueries: {},
    __operationalSentinel: "ADMIN_OPERATIONAL_SENTINEL",
  });
  await expect(page.getByText("PRIVATE_MARKETPLACE_SENTINEL")).toBeVisible();
  await expect(page.getByText("ADMIN_OPERATIONAL_SENTINEL")).toHaveCount(0);
});

test("anonymous direct URL attacks are redirected before Admin or Company operations render", async ({ page }) => {
  await page.goto("/en/admin/companies");
  await expect(page).toHaveURL(/\/en\/sign-in(?:\?|$)/);

  await page.goto("/en/company/batiplus");
  await expect(page).toHaveURL(/\/en\/sign-in(?:\?|$)/);
  await expect(page.getByText("Internal Notes", { exact: true })).toHaveCount(0);
});
