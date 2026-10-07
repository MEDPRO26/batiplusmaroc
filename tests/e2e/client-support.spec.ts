import { expect, test, type Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

/**
 * Mocked-UI coverage: real components against the harness's fake Convex client.
 * Nothing here talks to a deployment or proves backend authorization.
 */
const projectId = "project-villa";
const otherProjectId = "project-riad";
const conversationId = "support-villa";
const otherConversationId = "support-riad";
const fixedAt = Date.UTC(2026, 9, 5, 9, 0);
const screenshots = process.env.SUPPORT_SCREENSHOT_DIR;
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 375, height: 812 }];

const REQUEST = "clientSupport.index.requestSupport";
const GET_MINE = "clientSupport.index.getMyConversation";
const GET_ADMIN = "clientSupport.index.getAdminConversation";
const LIST_MINE = "clientSupport.index.listMyMessages";
const LIST_ADMIN = "clientSupport.index.listAdminMessages";
const INBOX = "clientSupport.index.listAdminConversations";
const SEND_MINE = "clientSupport.index.sendClientMessage";
const SEND_ADMIN = "clientSupport.index.sendAdminMessage";
const READ_MINE = "clientSupport.index.markMyConversationRead";
const READ_ADMIN = "clientSupport.index.markAdminConversationRead";

type Call = { path: string; args: Record<string, string> };
type Paginated = { results: unknown[]; status: string };
type W = Window & {
  __queries: Record<string, unknown>;
  __queryHandlers: Record<string, (args: Record<string, string>) => unknown>;
  __paginatedQueries: Record<string, Paginated>;
  __paginatedQueryHandlers: Record<string, (args: Record<string, string>) => Paginated>;
  __paginationHandlers: Record<string, () => void>;
  __paginationCalls: { path: string; numItems: number }[];
  __mutationCalls: Call[];
  __mutationErrors: Record<string, string>;
  __mutationDelays: Record<string, number>;
  __navigationCalls: { method: string; href: unknown }[];
  __queryCalls: string[];
  __threads: Record<string, unknown>;
  __histories: Record<string, Paginated>;
};

let cardBundle = "";
let clientBundle = "";
let adminBundle = "";
let projectsBundle = "";
let clientProjectBundle = "";

test.beforeAll(async () => {
  cardBundle = await buildHarness(
    `import { ClientProjectSupport } from "./features/client-support/components/client-support-actions";`,
    `<div style={{ maxWidth: 360, padding: 16 }}><ClientProjectSupport projectId="${projectId}" /></div>`,
  );
  clientProjectBundle = await buildHarness(
    `import { ClientProjectDetails } from "./features/projects/components/client-project-details";`,
    `<ClientProjectDetails projectId="${projectId}" />`,
  );
  clientBundle = await buildHarness(
    `import { ClientSupportPage } from "./features/client-support/components/client-support-page";`,
    `<ClientSupportPage projectId={window.__routeProjectId || "${projectId}"} />`,
  );
  adminBundle = await buildHarness(
    `import { AdminShell } from "./features/admin/components/admin-shell";
     import { AdminSupportPanel } from "./features/client-support/components/admin-support-panel";`,
    `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminSupportPanel initialProjectId={window.__initialProjectId ?? null} /></AdminShell>`,
  );
  projectsBundle = await buildHarness(
    `import { ProjectReviewDrawer } from "./features/admin/components/admin-projects-panel";`,
    `<ProjectReviewDrawer projectId="${projectId}" onClose={() => {}} onSuccess={() => {}} onError={() => {}} />`,
  );
});

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: conversationId,
    project: { id: projectId, title: "Villa Atlas", city: "rabat", status: "published" },
    clientDisplayName: "Sara Client",
    requestedKinds: ["free_help"],
    entryCount: 3,
    readThroughSequence: 1,
    unreadCount: 2,
    hasUnread: true,
    lastEntry: { id: "entry-3", sequence: 3, createdAt: fixedAt, kind: "message", senderType: "client", preview: "Can you check my payment dates?" },
    createdAt: fixedAt,
    updatedAt: fixedAt,
    ...overrides,
  };
}

function entry(sequence: number, body: string, senderType: "client" | "admin", isOwnMessage: boolean, conversation = conversationId) {
  return {
    id: `${conversation}-entry-${sequence}`, conversationId: conversation, kind: "message", senderType,
    senderDisplayName: senderType === "client" ? "Sara Client" : "Ada Admin", body, sequence,
    createdAt: fixedAt + sequence * 60_000, isOwnMessage,
  };
}

function requestEntry(sequence: number, requestKind: "free_help" | "coordination_discussion", isOwnMessage: boolean, conversation = conversationId) {
  return {
    id: `${conversation}-entry-${sequence}`, conversationId: conversation, kind: "request", senderType: "client",
    senderDisplayName: "Sara Client", requestKind, sequence, createdAt: fixedAt + sequence * 60_000, isOwnMessage,
    eventKey: requestKind === "free_help" ? "clientSupport.events.freeHelpRequested" : "clientSupport.events.coordinationDiscussionRequested",
  };
}

const project = {
  id: projectId, title: "Villa Atlas", status: "published", viewerRole: "owner", description: "Build a villa.",
  primaryCategory: null, customCategoryText: null, city: "rabat", neighborhood: null, propertyType: null,
  surface: null, surfaceUnknown: false, timeline: null, images: [], attachments: [], history: [],
  createdAt: fixedAt, submittedAt: null, canResume: false,
};

function clientState(locale: "en" | "fr", options: { conversation?: unknown; messages?: unknown[]; status?: string; project?: unknown; user?: unknown } = {}) {
  return {
    __locale: locale,
    __pathname: `/espace-client/projets/${projectId}/batiplus`,
    __queries: {
      "users.currentUser": options.user === undefined ? { accountType: "client", onboardingStatus: "completed" } : options.user,
      "projects.index.getMyProject": options.project === undefined ? project : options.project,
      [GET_MINE]: options.conversation ?? null,
    },
    __paginatedQueries: { [LIST_MINE]: { status: options.status ?? "Exhausted", results: options.messages ?? [] } },
    __mutationCalls: [],
    __privateSentinel: "PRIVATE_COMPANY_OR_MARKETPLACE_SENTINEL",
  };
}

function adminState(locale: "en" | "fr", options: { inbox?: unknown[]; inboxStatus?: string; initialProjectId?: string | null } = {}) {
  return {
    __locale: locale,
    __pathname: "/admin/support",
    __initialProjectId: options.initialProjectId ?? null,
    __queries: { "users.currentUser": { _id: "admin", accountType: "admin" } },
    __paginatedQueries: { [INBOX]: { status: options.inboxStatus ?? "Exhausted", results: options.inbox ?? [] } },
    __threads: {
      [projectId]: summary(),
      [otherProjectId]: summary({ id: otherConversationId, project: { id: otherProjectId, title: null, city: null, status: "draft" }, clientDisplayName: "", requestedKinds: ["coordination_discussion"], unreadCount: 0, hasUnread: false, readThroughSequence: 1, entryCount: 1, lastEntry: { id: `${otherConversationId}-entry-1`, sequence: 1, createdAt: fixedAt, kind: "request", senderType: "client", requestKind: "coordination_discussion", eventKey: "clientSupport.events.coordinationDiscussionRequested" } }),
      "project-empty": null,
    },
    __histories: {
      [conversationId]: { status: "Exhausted", results: [requestEntry(1, "free_help", false), entry(2, "Villa thread only", "client", false), entry(3, "Can you check my payment dates?", "client", false)] },
      [otherConversationId]: { status: "Exhausted", results: [requestEntry(1, "coordination_discussion", false, otherConversationId)] },
    },
    __mutationCalls: [],
  };
}

/** Admin threads resolve per projectId/conversationId, like the real query arguments. */
async function mountAdmin(page: Page, state: ReturnType<typeof adminState>) {
  await mountHarness(page, adminBundle, state);
  await page.evaluate(({ getAdmin, listAdmin }) => {
    const w = window as unknown as W;
    w.__queryHandlers = {
      [getAdmin]: ({ projectId }) => {
        if (!(projectId in w.__threads)) throw new Error("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND private-stack");
        return w.__threads[projectId];
      },
    };
    w.__paginatedQueryHandlers = {
      [listAdmin]: ({ conversationId }) => {
        if (!w.__histories[conversationId]) throw new Error("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND private-stack");
        return w.__histories[conversationId];
      },
    };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { getAdmin: GET_ADMIN, listAdmin: LIST_ADMIN });
}

const calls = (page: Page, path: string) =>
  page.evaluate((target) => ((window as unknown as W).__mutationCalls ?? []).filter((call) => call.path === target), path);
// The page borrowed for its stylesheets leaves Next's empty route announcer behind.
const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const refresh = (page: Page) => page.evaluate(() => { window.dispatchEvent(new Event("convex-harness-update")); });
async function shot(page: Page, name: string) {
  if (screenshots) await page.screenshot({ path: `${screenshots}/${name}.png` });
}

for (const copy of [
  { locale: "en" as const, support: "Batiplus support", dates: "Key dates", review: "Review proposals", proposals: "Proposals", free: "Get free help from Batiplus", coordination: "Discuss site coordination", note: "Both services are optional. Requesting coordination does not commit you to pay.", open: "Open Batiplus conversation" },
  { locale: "fr" as const, support: "Assistance Batiplus", dates: "Dates clés", review: "Voir les propositions", proposals: "Propositions", free: "Obtenir l’aide gratuite de Batiplus", coordination: "Discuter de la coordination de chantier", note: "Les deux services sont facultatifs. Demander une coordination ne vous engage pas à payer.", open: "Ouvrir la conversation Batiplus" },
]) {
  test(`Client ${copy.locale} project keeps proposals primary and optional support above Key dates`, async ({ page }) => {
    const state = clientState(copy.locale);
    Object.assign(state.__queries, {
      "invitations.index.listProjectInvitations": [],
      "quotes.index.listReceivedInitialQuotes": [{
        id: "quote-1", projectId, companyId: "company-1", status: "submitted", submittedAt: fixedAt,
        estimatedPrice: 395000, estimatedDuration: 120, availableStartDate: "2026-11-02",
        message: "We can discuss the project scope and arrange a visit.",
        company: { name: "Construction Company 12", city: "Rabat", slug: null, logoUrl: null, isVerified: true, description: null },
      }],
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mountHarness(page, clientProjectBundle, state);
    const support = page.getByRole("region", { name: copy.support, exact: true });
    const dates = page.getByRole("region", { name: copy.dates });
    const review = page.getByRole("link", { name: copy.review, exact: true });
    await expect(support.getByText(copy.note)).toBeVisible();
    await expect(review).toBeVisible();
    expect(await calls(page, REQUEST)).toEqual([]);
    for (const name of [copy.free, copy.coordination]) {
      const button = support.getByRole("button", { name, exact: true });
      await expect(button).toHaveCSS("background-color", "rgb(255, 255, 255)");
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const supportBox = (await support.boundingBox())!;
    expect(supportBox.height).toBeLessThan(520);
    expect(supportBox.y).toBeGreaterThan((await review.boundingBox())!.y);
    expect(supportBox.y).toBeLessThan((await dates.boundingBox())!.y);
    const article = page.getByRole("article", { name: copy.locale === "en" ? "Project details" : "Détails du projet" });
    const articleBox = (await article.boundingBox())!;
    const proposals = page.locator("#proposals").getByRole("heading", { name: copy.proposals, exact: true });
    const proposalBox = (await proposals.boundingBox())!;
    // Sidebar height must not add whitespace between the brief and proposals.
    expect(proposalBox.y - (articleBox.y + articleBox.height)).toBeLessThanOrEqual(48);
    expect(await hasHorizontalOverflow(page)).toBe(false);
    if (screenshots) await page.screenshot({ path: `${screenshots}/client-project-${copy.locale}-desktop.png`, fullPage: true });

    await page.setViewportSize({ width: 375, height: 812 });
    expect(await hasHorizontalOverflow(page)).toBe(false);
    expect((await review.boundingBox())!.y).toBeLessThan((await support.boundingBox())!.y);
    expect((await support.boundingBox())!.y).toBeLessThan((await proposals.boundingBox())!.y);
    if (screenshots) await page.screenshot({ path: `${screenshots}/client-project-${copy.locale}-mobile.png`, fullPage: true });

    await page.evaluate(({ path, conversation }) => {
      (window as unknown as W).__queries[path] = conversation;
      window.dispatchEvent(new Event("convex-harness-update"));
    }, { path: GET_MINE, conversation: summary() });
    await expect(support.getByRole("link", { name: copy.open })).toBeVisible();
    await expect(support.getByLabel(copy.locale === "en" ? "2 unread messages" : "2 messages non lus")).toBeVisible();
    expect(await calls(page, REQUEST)).toEqual([]);
    if (screenshots) await support.screenshot({ path: `${screenshots}/client-existing-${copy.locale}-mobile.png` });
  });
}

for (const copy of [
  { locale: "en" as const, free: "Get free help from Batiplus", coordination: "Discuss site coordination", sending: "Sending your request…", failed: "Your request could not be sent. Nothing was requested — please try again.", open: "Open Batiplus conversation", requested: "Requested" },
  { locale: "fr" as const, free: "Obtenir l’aide gratuite de Batiplus", coordination: "Discuter de la coordination de chantier", sending: "Envoi de votre demande…", failed: "Votre demande n’a pas pu être envoyée. Rien n’a été demandé — veuillez réessayer.", open: "Ouvrir la conversation Batiplus", requested: "Demandé" },
]) {
  test(`Client ${copy.locale} requests each service only on an explicit click`, async ({ page }) => {
    await mountHarness(page, cardBundle, { __locale: copy.locale, __queries: { [GET_MINE]: null }, __mutationCalls: [], __mutationDelays: { [REQUEST]: 250 } });
    await expect(page.getByRole("button", { name: copy.free })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.coordination })).toBeVisible();
    await expect(page.getByRole("link", { name: copy.open })).toHaveCount(0);
    // Rendering the project never creates a request.
    expect(await calls(page, REQUEST)).toEqual([]);
    await shot(page, `client-card-${copy.locale}`);

    // A double click is one request; both actions lock while it is pending.
    await page.getByRole("button", { name: copy.free }).dblclick();
    await expect(page.getByRole("button", { name: copy.sending })).toBeDisabled();
    await expect(page.getByRole("button", { name: copy.coordination })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__navigationCalls ?? [])).toEqual([
      { method: "push", href: { pathname: "/espace-client/projets/[projectId]/batiplus", params: { projectId } } },
    ]);
    expect(await calls(page, REQUEST)).toEqual([{ path: REQUEST, args: { projectId, requestKind: "free_help" } }]);
  });

  test(`Client ${copy.locale} sees a failed request, stays put, and can retry the other kind`, async ({ page }) => {
    await mountHarness(page, cardBundle, { __locale: copy.locale, __queries: { [GET_MINE]: summary() }, __mutationCalls: [], __mutationErrors: { [REQUEST]: "Server exploded with private-stack" } });
    // The second service reuses the existing thread: link with unread state plus its own action.
    await expect(page.getByRole("link", { name: copy.open })).toHaveAttribute("href", `/espace-client/projets/${projectId}/batiplus`);
    await expect(page.getByLabel(copy.locale === "en" ? "2 unread messages" : "2 messages non lus")).toBeVisible();
    await expect(page.getByRole("button", { name: copy.free })).toHaveCount(0);
    await expect(page.locator('[data-support-kind="free_help"]')).toContainText(copy.requested);

    await page.getByRole("button", { name: copy.coordination }).click();
    await expect(alerts(page)).toHaveText(copy.failed);
    await expect(page.getByText("private-stack")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__navigationCalls ?? [])).toEqual([]);

    await page.evaluate(() => { (window as unknown as W).__mutationErrors = {}; });
    await page.getByRole("button", { name: copy.coordination }).click();
    await expect.poll(() => page.evaluate(() => ((window as unknown as W).__navigationCalls ?? []).length)).toBe(1);
    expect((await calls(page, REQUEST)).map((call) => call.args.requestKind)).toEqual(["coordination_discussion", "coordination_discussion"]);
  });
}

for (const copy of [
  { locale: "en" as const, back: "Back to project", noThread: "You have not asked Batiplus for help on this project yet", free: "Get free help from Batiplus", event: "Free help from Batiplus requested", list: "Batiplus support history", coordination: "Discuss site coordination", denied: "Batiplus support unavailable", notFound: "Project not found" },
  { locale: "fr" as const, back: "Retour au projet", noThread: "Vous n’avez pas encore demandé l’aide de Batiplus pour ce projet", free: "Obtenir l’aide gratuite de Batiplus", event: "Aide gratuite Batiplus demandée", list: "Historique de l’assistance Batiplus", coordination: "Discuter de la coordination de chantier", denied: "Assistance Batiplus indisponible", notFound: "Projet introuvable" },
]) {
  test(`Client ${copy.locale} direct link without a thread offers requests and creates nothing`, async ({ page }) => {
    await mountHarness(page, clientBundle, clientState(copy.locale));
    await expect(page.getByRole("heading", { name: "Villa Atlas", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: copy.back })).toHaveAttribute("href", `/espace-client/projets/${projectId}`);
    await expect(page.getByRole("heading", { name: copy.noThread })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.free })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__mutationCalls)).toEqual([]);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
    await shot(page, `client-no-thread-${copy.locale}`);
  });

  test(`Client ${copy.locale} thread shows safe context, translated events and the other service`, async ({ page }) => {
    await mountHarness(page, clientBundle, clientState(copy.locale, {
      conversation: summary({ readThroughSequence: 3, unreadCount: 0, hasUnread: false }),
      messages: [requestEntry(1, "free_help", true), entry(2, "Bonjour, how can we help?", "admin", false), entry(3, '<b onclick="x()">bold</b> text', "client", true)],
    }));
    const list = page.getByRole("list", { name: copy.list });
    await expect(list.getByText(copy.event)).toBeVisible();
    await expect(list.getByText("Bonjour, how can we help?")).toBeVisible();
    await expect(list.getByText('<b onclick="x()">bold</b> text')).toBeVisible();
    expect(await list.locator("b").count()).toBe(0);
    await expect(page.getByText("clientSupport.events")).toHaveCount(0);
    await expect(page.getByRole("button", { name: copy.coordination })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.free })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByText("PRIVATE_COMPANY_OR_MARKETPLACE_SENTINEL")).toHaveCount(0);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await shot(page, `client-thread-${copy.locale}-${viewport.width}`);
    }
  });

  test(`Client ${copy.locale} route denies missing projects and clears a thread that becomes inaccessible`, async ({ page }) => {
    await mountHarness(page, clientBundle, clientState(copy.locale, { project: null }));
    await expect(page.getByRole("heading", { name: copy.notFound })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as W).__queryCalls.filter((path) => path.startsWith("clientSupport")))).toEqual([]);

    await mountHarness(page, clientBundle, clientState(copy.locale, { conversation: summary(), messages: [entry(2, "Visible before access is lost", "admin", false)] }));
    await expect(page.getByText("Visible before access is lost")).toBeVisible();
    await page.evaluate((path) => {
      (window as unknown as W).__queryHandlers = { [path]: () => { throw new Error("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND private-stack"); } };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, GET_MINE);
    await expect(page.getByRole("heading", { name: copy.denied })).toBeVisible();
    await expect(page.getByText("Visible before access is lost")).toHaveCount(0);
    await expect(page.getByText("private-stack")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });
}

test("Non-Client accounts are redirected away without loading the project or support data", async ({ page }) => {
  for (const [user, destination] of [
    [{ accountType: "company", onboardingStatus: "completed" }, "/espace-entreprise"],
    [{ accountType: "admin", onboardingStatus: "completed" }, "/admin"],
    [null, "/connexion"],
  ] as const) {
    await mountHarness(page, clientBundle, clientState("en", { user, conversation: summary() }));
    await expect.poll(() => page.evaluate(() => (window as unknown as W).__navigationCalls ?? [])).toEqual([{ method: "replace", href: destination }]);
    await expect(page.getByText("Villa Atlas")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__queryCalls.filter((path) => path !== "users.currentUser"))).toEqual([]);
  }
});

test("Reads are acknowledged from the newest visible entry and never from a hidden tab", async ({ page }) => {
  const messages = Array.from({ length: 30 }, (_, index) => entry(index + 1, `Entry number ${index + 1}\nwith a second line`, index % 2 ? "admin" : "client", index % 2 === 0));
  const state = clientState("en", { conversation: summary({ entryCount: 30, readThroughSequence: 0, unreadCount: 30 }), messages });

  // Hidden tab: the thread is loaded but nothing may be marked read.
  await page.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window as unknown as { __startHidden: boolean }).__startHidden ? "hidden" : "visible" });
  });
  await mountHarness(page, clientBundle, { ...state, __startHidden: true });
  await expect(page.getByText("Entry number 30")).toBeVisible();
  await page.waitForTimeout(400);
  expect(await calls(page, READ_MINE)).toEqual([]);

  // Foreground: the thread opens at the bottom, so the newest entry is on screen.
  await page.evaluate(() => {
    (window as unknown as { __startHidden: boolean }).__startHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => calls(page, READ_MINE)).toEqual([
    { path: READ_MINE, args: { conversationId, readThroughMessageId: `${conversationId}-entry-30` } },
  ]);

  // A newer entry that arrives while the reader is scrolled up is not acknowledged until seen.
  await page.locator("[data-support-viewport]").evaluate((node) => { node.scrollTop = 0; });
  await page.evaluate(({ path, next }) => {
    const w = window as unknown as W;
    w.__paginatedQueries[path] = { status: "Exhausted", results: [...w.__paginatedQueries[path].results, next] };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { path: LIST_MINE, next: entry(31, "Arrived while reading older entries", "admin", false) });
  await page.waitForTimeout(400);
  expect((await calls(page, READ_MINE)).length).toBe(1);
  await page.getByText("Arrived while reading older entries").scrollIntoViewIfNeeded();
  await expect.poll(async () => (await calls(page, READ_MINE)).at(-1)?.args.readThroughMessageId).toBe(`${conversationId}-entry-31`);
});

test("Older pages merge in sequence order without moving the reader", async ({ page }) => {
  const newestPage = Array.from({ length: 30 }, (_, index) => entry(index + 31, `Entry number ${index + 31}`, "admin", false));
  const olderPage = Array.from({ length: 30 }, (_, index) => entry(index + 1, `Entry number ${index + 1}`, "client", true));
  await mountHarness(page, clientBundle, clientState("en", {
    conversation: summary({ entryCount: 60, readThroughSequence: 60, unreadCount: 0, hasUnread: false }), messages: newestPage, status: "CanLoadMore",
  }));
  await page.evaluate(({ path, older }) => {
    const w = window as unknown as W;
    w.__paginationHandlers = {
      [path]: () => {
        // Convex appends the older page after the newer one, with one overlapping boundary entry.
        w.__paginatedQueries[path] = { status: "Exhausted", results: [...w.__paginatedQueries[path].results, ...older, w.__paginatedQueries[path].results[0]] };
        window.dispatchEvent(new Event("convex-harness-update"));
      },
    };
  }, { path: LIST_MINE, older: olderPage });

  const viewport = page.locator("[data-support-viewport]");
  await viewport.evaluate((node) => { node.scrollTop = 0; });
  const anchor = page.locator('[data-support-entry="31"]');
  const before = await anchor.evaluate((node) => node.getBoundingClientRect().top);
  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(page.locator("[data-support-entry]")).toHaveCount(60);
  expect(await page.locator("[data-support-entry]").evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset.supportEntry))))
    .toEqual(Array.from({ length: 60 }, (_, index) => index + 1));
  const after = await anchor.evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThan(80);
  await expect(page.getByRole("button", { name: "Load older messages" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as W).__paginationCalls)).toEqual([{ path: LIST_MINE, numItems: 30 }]);
});

test("A failed send keeps the draft and its key; an edited send gets a new key", async ({ page }) => {
  await mountHarness(page, clientBundle, {
    ...clientState("en", { conversation: summary({ readThroughSequence: 3, unreadCount: 0 }), messages: [requestEntry(1, "free_help", true)] }),
    __mutationErrors: { [SEND_MINE]: "Network down with private-stack" },
  });
  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill("  Please review my payment dates  ");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(alerts(page)).toHaveText("The message could not be sent. Your text is still here — try again.");
  await expect(page.getByText("private-stack")).toHaveCount(0);
  await expect(composer).toHaveValue("  Please review my payment dates  ");
  await expect(composer).toHaveAttribute("aria-invalid", "true");

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(async () => (await calls(page, SEND_MINE)).length).toBe(2);
  let sends = await calls(page, SEND_MINE);
  expect(sends[0].args).toEqual({ conversationId, body: "Please review my payment dates", idempotencyKey: sends[0].args.idempotencyKey });
  expect(sends[1].args).toEqual(sends[0].args);
  expect(sends[0].args.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{1,100}$/);

  await page.evaluate(() => { (window as unknown as W).__mutationErrors = {}; });
  await composer.fill("Please review my payment dates and documents");
  await composer.press("Enter");
  await expect(composer).toHaveValue("");
  sends = await calls(page, SEND_MINE);
  expect(sends).toHaveLength(3);
  expect(sends[2].args.idempotencyKey).not.toBe(sends[0].args.idempotencyKey);

  // A new message after a success never reuses a key, even with identical text.
  await composer.fill("Please review my payment dates and documents");
  await composer.press("Enter");
  await expect(composer).toHaveValue("");
  sends = await calls(page, SEND_MINE);
  expect(new Set(sends.map((send) => send.args.idempotencyKey)).size).toBe(3);
});

for (const copy of [
  { locale: "en" as const, title: "Client support", untitled: "Untitled draft project", client: "Client", unread: "2 unread entries", prompt: "Select a request", back: "Back to requests", empty: "No support requests yet", noThread: "No support conversation for this project", denied: "Conversation unavailable", event: "Site coordination discussion requested", status: "Published" },
  { locale: "fr" as const, title: "Assistance clients", untitled: "Projet en brouillon sans titre", client: "Client", unread: "2 entrées non lues", prompt: "Sélectionnez une demande", back: "Retour aux demandes", empty: "Aucune demande d’assistance pour le moment", noThread: "Aucune conversation d’assistance pour ce projet", denied: "Conversation indisponible", event: "Discussion sur la coordination de chantier demandée", status: "Publié" },
]) {
  test(`Admin ${copy.locale} inbox lists requests and opens a thread only when selected`, async ({ page }) => {
    const state = adminState(copy.locale);
    state.__paginatedQueries[INBOX] = { status: "Exhausted", results: [state.__threads[projectId], state.__threads[otherProjectId]] };
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountAdmin(page, state);
    await expect(page.getByRole("heading", { name: copy.title, level: 1 })).toBeVisible();
    expect((await page.getByRole("region", { name: copy.locale === "en" ? "Support requests" : "Demandes d’assistance", exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(400);
    await expect(page.getByText(copy.prompt)).toBeVisible();
    const villa = page.getByRole("button", { name: /Villa Atlas/ });
    await expect(villa).toContainText("Sara Client");
    await expect(villa.getByLabel(copy.unread)).toBeVisible();
    const draft = page.getByRole("button", { name: new RegExp(copy.untitled) });
    await expect(draft).toContainText(copy.client);
    await expect(draft).toContainText(copy.event);
    // Inbox summaries never acknowledge anything or load a thread.
    expect(await calls(page, READ_ADMIN)).toEqual([]);
    expect(await page.evaluate((path) => (window as unknown as W).__queryCalls.includes(path), LIST_ADMIN)).toBe(false);
    await shot(page, `admin-inbox-${copy.locale}`);

    await villa.click();
    await expect(villa).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("heading", { name: "Villa Atlas", level: 2 })).toBeVisible();
    await expect(page.getByText(copy.status, { exact: true })).toBeVisible();
    await expect(page.getByText("Villa thread only")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as W).__navigationCalls.at(-1))).toEqual({ method: "replace", href: { pathname: "/admin/support", query: { projectId } } });
    await expect.poll(() => calls(page, READ_ADMIN)).toEqual([{ path: READ_ADMIN, args: { conversationId, readThroughMessageId: `${conversationId}-entry-3` } }]);
    expect(await page.evaluate(() => (window as unknown as W).__queryCalls.some((path) => /getMyConversation|listMyMessages/.test(path)))).toBe(false);
    await shot(page, `admin-thread-${copy.locale}`);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
  });

  test(`Admin ${copy.locale} distinguishes loading from a genuinely empty inbox`, async ({ page }) => {
    const state = adminState(copy.locale, { inboxStatus: "LoadingFirstPage" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountAdmin(page, state);
    const pane = page.getByRole("region", { name: copy.locale === "en" ? "Support conversation" : "Conversation d’assistance", exact: true });
    await expect(pane.locator('[aria-busy="true"]')).toBeVisible();
    await expect(pane.getByText(copy.empty)).toHaveCount(0);
    await expect(pane.getByText(copy.prompt)).toHaveCount(0);
    await page.evaluate((path) => {
      (window as unknown as W).__paginatedQueries[path] = { status: "Exhausted", results: [] };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, INBOX);
    await expect(pane.getByText(copy.empty)).toBeVisible();
    await expect(pane.getByText(copy.prompt)).toHaveCount(0);
    expect(await calls(page, READ_ADMIN)).toEqual([]);
    await shot(page, `admin-empty-${copy.locale}-desktop`);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByText(copy.empty).first()).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await shot(page, `admin-empty-${copy.locale}-mobile`);
  });

  test(`Admin ${copy.locale} deep link, missing thread and denied access`, async ({ page }) => {
    // The linked thread is not in the (empty) first inbox page.
    await mountAdmin(page, adminState(copy.locale, { initialProjectId: projectId }));
    await expect(page.getByText(copy.empty)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Villa Atlas", level: 2 })).toBeVisible();
    await expect(page.getByText("Villa thread only")).toBeVisible();

    await mountAdmin(page, adminState(copy.locale, { initialProjectId: "project-empty" }));
    await expect(page.getByText(copy.noThread)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__mutationCalls)).toEqual([]);

    // Access lost while a thread is open: its data is removed, not left on screen.
    const state = adminState(copy.locale, { initialProjectId: projectId });
    state.__paginatedQueries[INBOX] = { status: "Exhausted", results: [state.__threads[otherProjectId]] };
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountAdmin(page, state);
    await expect(page.getByText("Villa thread only")).toBeVisible();
    await page.evaluate((id) => {
      delete (window as unknown as W).__threads[id];
      window.dispatchEvent(new Event("convex-harness-update"));
    }, projectId);
    await expect(page.getByText(copy.denied)).toBeVisible();
    await expect(page.getByText("Villa thread only")).toHaveCount(0);
    await expect(page.getByText("private-stack")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
    // Selecting another request recovers without a reload.
    await page.getByRole("button", { name: new RegExp(copy.untitled) }).click();
    await expect(page.locator("[data-support-entry]").getByText(copy.event)).toBeVisible();
    await expect(page.getByText(copy.denied)).toHaveCount(0);
  });

  test(`Admin ${copy.locale} mobile flow goes inbox, thread, back to requests`, async ({ page }) => {
    const state = adminState(copy.locale);
    state.__paginatedQueries[INBOX] = { status: "Exhausted", results: [state.__threads[projectId]] };
    await page.setViewportSize({ width: 375, height: 812 });
    await mountAdmin(page, state);
    const villa = page.getByRole("button", { name: /Villa Atlas/ });
    await expect(villa).toBeVisible();
    await expect(page.getByRole("button", { name: copy.back })).toHaveCount(0);
    await shot(page, `admin-mobile-inbox-${copy.locale}`);

    await villa.click();
    await expect(page.getByText("Villa thread only")).toBeVisible();
    await expect(villa).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await shot(page, `admin-mobile-thread-${copy.locale}`);

    await page.getByRole("button", { name: copy.back }).click();
    await expect(villa).toBeVisible();
    await expect(page.getByText("Villa thread only")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__navigationCalls.at(-1))).toEqual({ method: "replace", href: { pathname: "/admin/support", query: {} } });
  });
}

test("Admin inbox keeps paging past an empty filtered page and honours the cursor", async ({ page }) => {
  const state = adminState("en", { inboxStatus: "CanLoadMore" });
  await mountHarness(page, adminBundle, state);
  // Empty page with more to load: not an empty inbox.
  await expect(page.getByRole("status", { name: "Loading support requests" })).toBeVisible();
  await expect(page.getByText("No support requests yet")).toHaveCount(0);
  await expect.poll(() => page.evaluate((path) => ((window as unknown as W).__paginationCalls ?? []).filter((call) => call.path === path).length, INBOX)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as W).__paginationCalls[0])).toEqual({ path: INBOX, numItems: 20 });

  await page.evaluate(({ path, row }) => {
    (window as unknown as W).__paginatedQueries[path] = { status: "CanLoadMore", results: [row] };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { path: INBOX, row: state.__threads[projectId] });
  await expect(page.getByRole("button", { name: /Villa Atlas/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more requests" })).toBeVisible();

  await page.evaluate((path) => {
    const w = window as unknown as W;
    w.__paginatedQueries[path] = { ...w.__paginatedQueries[path], status: "Exhausted" };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, INBOX);
  await expect(page.getByRole("button", { name: "Load more requests" })).toHaveCount(0);
});

test("Admin drafts survive switching threads and a stale failure never lands in another thread", async ({ page }) => {
  const state = adminState("en");
  state.__paginatedQueries[INBOX] = { status: "Exhausted", results: [state.__threads[projectId], state.__threads[otherProjectId]] };
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountAdmin(page, state);
  await page.evaluate((path) => {
    const w = window as unknown as W;
    w.__mutationErrors = { [path]: "Server exploded" };
    w.__mutationDelays = { [path]: 400 };
  }, SEND_ADMIN);
  const composer = page.getByRole("textbox", { name: "Message" });

  await page.getByRole("button", { name: /Villa Atlas/ }).click();
  await composer.fill("Reply for the villa thread");
  await page.getByRole("button", { name: "Send" }).click();
  // Switch before the request settles.
  await page.getByRole("button", { name: /Untitled draft project/ }).click();
  await expect(page.locator("[data-support-entry]").getByText("Site coordination discussion requested")).toBeVisible();
  await expect(composer).toHaveValue("");
  await page.waitForTimeout(600);
  await expect(alerts(page)).toHaveCount(0);
  await expect(composer).toBeEnabled();
  await composer.fill("Reply for the draft thread");

  await page.getByRole("button", { name: /Villa Atlas/ }).click();
  await expect(composer).toHaveValue("Reply for the villa thread");
  await page.evaluate(() => { const w = window as unknown as W; w.__mutationErrors = {}; w.__mutationDelays = {}; });
  await page.getByRole("button", { name: "Send" }).click();
  await expect(composer).toHaveValue("");
  const sends = await calls(page, SEND_ADMIN);
  expect(sends.map((send) => send.args.conversationId)).toEqual([conversationId, conversationId]);
  expect(sends[1].args).toEqual(sends[0].args);

  await page.getByRole("button", { name: /Untitled draft project/ }).click();
  await expect(composer).toHaveValue("Reply for the draft thread");
});

for (const copy of [
  { locale: "en" as const, label: "Open Client support" },
  { locale: "fr" as const, label: "Ouvrir l’assistance client" },
]) {
  test(`Admin ${copy.locale} project view links to the project's support thread`, async ({ page }) => {
    await mountHarness(page, projectsBundle, {
      __locale: copy.locale,
      __queries: {
        "admin.projects.getProjectReview": { id: projectId, title: "Villa Atlas", status: "published", submittedAt: null, client: { displayName: "Sara Client" }, category: null, customCategoryText: null, city: "rabat", neighborhood: null, propertyType: null, surface: null, surfaceUnknown: true, timeline: null, description: "Build a villa.", images: [], attachments: [], history: [], reviewHistory: [], createdAt: fixedAt },
        "admin.projects.listProjectActivity": [],
      },
    });
    await expect(page.getByRole("link", { name: copy.label })).toHaveAttribute("href", `/admin/support?projectId=${projectId}`);
    expect(await page.evaluate(() => (window as unknown as W).__queryCalls.some((path) => path.startsWith("clientSupport")))).toBe(false);
  });
}

test("refresh helper keeps the harness reactive", async ({ page }) => {
  await mountHarness(page, cardBundle, { __locale: "en", __queries: {}, __mutationCalls: [] });
  await expect(page.getByRole("status", { name: "Loading Batiplus support" })).toBeVisible();
  await page.evaluate((path) => { (window as unknown as W).__queries[path] = null; }, GET_MINE);
  await refresh(page);
  await expect(page.getByRole("button", { name: "Get free help from Batiplus" })).toBeVisible();
});
