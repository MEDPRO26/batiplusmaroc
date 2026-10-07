import { expect, test, type Page } from "@playwright/test";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

/** Real UI with mocked Convex and navigation. No deployment, auth session or live writes. */
const P = "project-villa";
const P2 = "project-riad";
const C = "support-villa";
const AT = Date.UTC(2026, 9, 7, 10);
const API = "coordinationAgreements.index.";
const MINE = API + "getMyAgreement";
const ADMIN = API + "getAdminAgreement";
const READY = API + "setMyReadiness";
const SAVE = API + "saveAdminDraft";
const PUBLISH = API + "publishAdminDraft";
const CONFIRM = API + "confirmMyVersion";
const HM = API + "listMyVersions";
const HA = API + "listAdminVersions";
const GET_MINE = "clientSupport.index.getMyConversation";
const GET_ADMIN = "clientSupport.index.getAdminConversation";
const INBOX = "clientSupport.index.listAdminConversations";
const LM = "clientSupport.index.listMyMessages";
const LA = "clientSupport.index.listAdminMessages";
const READ_ADMIN = "clientSupport.index.markAdminConversationRead";
const screenshots = process.env.AGREEMENT_SCREENSHOT_DIR;

type Call = { path: string; args: Record<string, unknown> };
type W = Window & {
  __queries: Record<string, unknown>;
  __queryHandlers: Record<string, (args: Record<string, unknown>) => unknown>;
  __paginatedQueries: Record<string, { results: unknown[]; status: string }>;
  __mutationCalls: Call[];
  __mutationErrors: Record<string, string>;
  __mutationDelays: Record<string, number>;
  __mutationHandlers: Record<string, (args: Record<string, unknown>) => unknown>;
  __mutationCompletions: string[];
  __paginationCalls: { path: string; numItems: number }[];
  __queryCalls: string[];
  __advisoryAsOf: number | null;
};

const terms = {
  tasks: "Two agreed inspection reports", exclusions: "No technical guarantee or extra visits",
  visits: "Two visits by appointment", availability: "Confirm each visit with Batiplus",
  startDate: "2099-11-02", currency: "MAD",
  fee: { kind: "percentage", rate: "2.123456789012345678900", basis: "Explicitly negotiated future tasks only", basisAmountMad: 1000.29 },
  payer: "Payer agreed separately", paymentTerms: "1000.29 MAD on the explicitly agreed date",
};
function version(number = 1, overrides: Record<string, unknown> = {}) {
  return { id: `version-${number}`, versionNumber: number, terms, publishedAt: AT,
    publishedByDisplayName: "Ada Admin", replacesVersionId: null, adminNotStartedDeclaredAt: AT,
    confirmation: null, status: "pending", isCurrentConfirmed: false, ...overrides };
}
function agreement(overrides: Record<string, unknown> = {}) {
  return { id: "agreement-1", projectId: P, supportConversationId: C,
    readiness: { eligible: true, declaredAt: AT, revision: 2 }, projectAllowsNewActions: true,
    pendingConfirmationStatus: "ready",
    currentConfirmedVersion: null, pendingVersion: version(), versionCount: 1, ...overrides };
}
function adminAgreement(overrides: Record<string, unknown> = {}) {
  return agreement({ pendingVersion: null, pendingConfirmationStatus: null, versionCount: 0, draftRevision: 1,
    draft: { terms, savedAt: AT, savedByDisplayName: "Ada Admin" }, ...overrides });
}
function summary(projectId = P) {
  return { id: projectId === P ? C : "support-riad", project: { id: projectId, title: projectId === P ? "Villa Atlas" : "Riad Medina", city: "rabat", status: "published" },
    clientDisplayName: "Sara Client", requestedKinds: ["free_help"], entryCount: 1, readThroughSequence: 1,
    unreadCount: 0, hasUnread: false, lastEntry: null, createdAt: AT, updatedAt: AT };
}
const project = { id: P, title: "Villa Atlas", status: "published", viewerRole: "owner", description: "Build a villa.",
  primaryCategory: null, customCategoryText: null, city: "rabat", neighborhood: null, propertyType: null,
  surface: null, surfaceUnknown: false, timeline: null, images: [], attachments: [], history: [],
  createdAt: AT, submittedAt: null, canResume: false };
const quote = { id: "private-quote", projectId: P, currentRevisionId: "private-revision-7", status: "submitted",
  companyName: "Construction Company 12", canSubmit: false, canReview: true, canWithdraw: false, changesRequestReason: null,
  revisions: [{ id: "private-revision-7", revisionNumber: 7, price: 395000, duration: 120,
    plannedStartDate: "2099-11-02", validUntil: "2099-11-01", submittedAt: AT, scope: "Private quote scope",
    inclusions: "Private inclusions", exclusions: "Private exclusions", paymentTerms: "Private quote payment terms",
    companyNote: null, hasPdf: false }] };

let clientBundle = "";
let adminBundle = "";
let quoteBundle = "";
test.beforeAll(async () => {
  clientBundle = await buildHarness(`import { ClientSupportPage } from "./features/client-support/components/client-support-page";`, `<ClientSupportPage projectId="${P}" />`);
  adminBundle = await buildHarness(`import { AdminShell } from "./features/admin/components/admin-shell";
    import { AdminSupportPanel } from "./features/client-support/components/admin-support-panel";`,
  `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminSupportPanel initialProjectId="${P}" /></AdminShell>`);
  quoteBundle = await buildHarness(`import { FinalQuoteSheet } from "./features/final-quotes/components/conversation-final-quote-panel";`,
    `<FinalQuoteSheet conversationId="marketplace-conversation" quote={window.__quote} viewerType="client" onClose={() => {}} />`);
});

function state(locale: "en" | "fr", role: "client" | "admin", data: unknown = role === "client" ? agreement() : adminAgreement()): {
  __locale: string; __pathname: string; __queries: Record<string, unknown>;
  __paginatedQueries: Record<string, { results: unknown[]; status: string }>;
  __mutationCalls: Call[]; __mutationErrors: Record<string, string>; __privateSentinel: string;
} {
  return {
    __locale: locale, __pathname: role === "client" ? `/espace-client/projets/${P}/batiplus` : "/admin/support",
    __queries: { "users.currentUser": { _id: role, accountType: role, onboardingStatus: "completed" },
      "projects.index.getMyProject": project, [GET_MINE]: summary(), [GET_ADMIN]: summary(), [role === "client" ? MINE : ADMIN]: data },
    __paginatedQueries: { [LM]: { results: [], status: "Exhausted" }, [LA]: { results: [], status: "Exhausted" },
      [INBOX]: { results: [summary(), summary(P2)], status: "Exhausted" }, [HM]: { results: [], status: "Exhausted" }, [HA]: { results: [], status: "Exhausted" } },
    __mutationCalls: [], __mutationErrors: {}, __privateSentinel: "PRIVATE_SOURCE_URL_COMPANY_PROPOSAL_OC2_DRAFT_SENTINEL",
  };
}
async function mount(page: Page, locale: "en" | "fr", role: "client" | "admin", data?: unknown) {
  await mountHarness(page, role === "client" ? clientBundle : adminBundle, state(locale, role, data));
  if (role === "admin") await page.getByRole("tab", { name: (locale === "fr" ? fr : en).coordinationAgreement.title, exact: true }).click();
}
const calls = (page: Page, path: string) => page.evaluate(target => ((window as unknown as W).__mutationCalls ?? []).filter(c => c.path === target), path);
async function update(page: Page, path: string, value: unknown) {
  await page.evaluate(({ path, value }) => { (window as unknown as W).__queries[path] = value; window.dispatchEvent(new Event("convex-harness-update")); }, { path, value });
}
async function errors(page: Page, path: string, value: string) {
  await page.evaluate(({ path, value }) => { (window as unknown as W).__mutationErrors[path] = value; }, { path, value });
}
async function shot(page: Page, name: string) { if (screenshots) await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: true }); }

/** Model Convex's undefined result for new clock args, while retaining the old subscription's value. */
async function advisoryGap(page: Page, path: string, refresh: "focus" | "visibilitychange" | "interval" = "focus") {
  await page.evaluate(path => {
    const w = window as unknown as W;
    let initialAsOf: unknown;
    w.__advisoryAsOf = null;
    w.__queryHandlers = { ...w.__queryHandlers, [path]: args => {
      initialAsOf ??= args.asOf;
      w.__advisoryAsOf = Number(args.asOf);
      return args.asOf === initialAsOf ? w.__queries[path] : undefined;
    } };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, path);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__advisoryAsOf)).not.toBeNull();
  const previous = await page.evaluate(() => (window as unknown as W).__advisoryAsOf!);
  if (refresh === "interval") await page.clock.fastForward(60_001);
  else {
    await page.clock.setSystemTime(new Date(previous + 60_001));
    await page.evaluate(event => (event === "focus" ? window : document).dispatchEvent(new Event(event)), refresh);
  }
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__advisoryAsOf)).toBeGreaterThan(previous);
}
async function settleAdvisory(page: Page, path: string, value: unknown) {
  await page.evaluate(({ path, value }) => {
    const w = window as unknown as W;
    delete w.__queryHandlers[path]; w.__queries[path] = value;
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { path, value });
}

for (const locale of ["en", "fr"] as const) {
  const t = (locale === "fr" ? fr : en).coordinationAgreement;
  const support = (locale === "fr" ? fr : en).clientSupport;
  test(`Client ${locale}: advisory refresh preserves summary DOM, disclosures and exact review through message updates`, async ({ page }) => {
    await page.clock.install({ time: new Date(AT) });
    const current = version(1, { status: "confirmed", isCurrentConfirmed: true,
      terms: { ...terms, tasks: "Previously confirmed tasks" },
      confirmation: { confirmedByDisplayName: "Sara Client", confirmedAt: AT, effectiveFrom: AT, notStartedDeclaredAt: AT } });
    const data = agreement({ currentConfirmedVersion: current, pendingVersion: version(2, { replacesVersionId: current.id }), versionCount: 2 });
    await mount(page, locale, "client", data);
    const panel = page.getByRole("region", { name: t.title, exact: true });
    const currentDetails = panel.locator("details").first();
    const historyDetails = panel.locator("details").last();
    await currentDetails.locator("summary").click(); await historyDetails.locator("summary").click();
    await panel.getByRole("button", { name: t.reviewVersion.replace("{number}", "2") }).click();
    const review = panel.getByRole("region", { name: t.reviewTitle });
    const currentNode = await currentDetails.elementHandle(); const reviewNode = await review.elementHandle();
    const composer = page.locator(`textarea[data-support-composer="${C}"]`);
    await composer.fill("Unsent text must stay");
    for (const refresh of ["focus", "visibilitychange", "interval"] as const) {
      await advisoryGap(page, MINE, refresh);
      await expect(review).toBeVisible();
      expect(await currentNode!.evaluate(node => node.isConnected)).toBe(true);
      expect(await reviewNode!.evaluate(node => node.isConnected)).toBe(true);
      await expect(currentDetails).toHaveAttribute("open", ""); await expect(historyDetails).toHaveAttribute("open", "");
      await expect(panel.getByText(t.loading, { exact: true })).toHaveCount(0);
      await expect(review.getByRole("button", { name: t.confirm, exact: true })).toBeDisabled();
      await expect(panel.getByRole("button", { name: t.clearReadiness })).toBeDisabled();
      await update(page, GET_MINE, { ...summary(), requestedKinds: ["free_help", "coordination_discussion"], entryCount: 2, unreadCount: 1, hasUnread: true });
      await page.evaluate(({ path, at }) => {
        (window as unknown as W).__paginatedQueries[path] = { status: "Exhausted", results: [{ id: "reply", conversationId: "support-villa", sequence: 2,
          kind: "message", senderType: "admin", senderDisplayName: "Ada Admin", body: "New support reply", createdAt: at, isOwnMessage: false }] };
        window.dispatchEvent(new Event("convex-harness-update"));
      }, { path: LM, at: AT });
      await expect(page.getByText("New support reply", { exact: true })).toBeVisible();
      await expect(composer).toHaveValue("Unsent text must stay");
      expect(await reviewNode!.evaluate(node => node.isConnected)).toBe(true);
      await settleAdvisory(page, MINE, data);
      await expect(review.getByRole("button", { name: t.confirm, exact: true })).toBeEnabled();
    }
    await advisoryGap(page, MINE);
    await settleAdvisory(page, MINE, { ...data, readiness: { ...data.readiness, revision: 3 }, pendingConfirmationStatus: "readiness_changed" });
    await expect(review.getByText(t.staleReview)).toBeVisible();
    await expect(review.getByText(t.confirmationStatus.readiness_changed)).toBeVisible();
    await expect(review.getByRole("button", { name: t.confirm, exact: true })).toBeDisabled();
    await expect(currentDetails.getByText("Previously confirmed tasks")).toBeVisible();
    expect(await calls(page, CONFIRM)).toEqual([]); expect(await calls(page, READY)).toEqual([]);
    expect(await currentNode!.evaluate(node => node.isConnected)).toBe(true);
  });

  test(`Admin ${locale}: clock refresh and message tabs keep the same dirty editor`, async ({ page }) => {
    await page.clock.install({ time: new Date(AT) });
    await mount(page, locale, "admin");
    const input = page.getByLabel(t.fields.rate, { exact: true });
    await input.fill("0,0000000000000000000100");
    const inputNode = await input.elementHandle();
    await advisoryGap(page, ADMIN);
    await expect(input).toHaveValue("0,0000000000000000000100");
    await expect(page.getByRole("button", { name: t.saveDraft, exact: true })).toBeDisabled();
    await page.getByRole("tab", { name: t.messagesTab, exact: true }).click();
    await page.getByRole("tab", { name: t.title, exact: true }).click();
    expect(await inputNode!.evaluate(node => node.isConnected)).toBe(true);
    await settleAdvisory(page, ADMIN, adminAgreement());
    await expect(input).toHaveValue("0,0000000000000000000100");
    await expect(page.getByRole("button", { name: t.saveDraft, exact: true })).toBeEnabled();
    expect(await calls(page, SAVE)).toEqual([]); expect(await calls(page, PUBLISH)).toEqual([]);
  });

  test(`Client ${locale}: exact first review, explicit declaration, composer draft and privacy`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page, locale, "client");
    const panel = page.getByRole("region", { name: t.title, exact: true });
    await expect(panel.getByText(t.readinessChangeNote)).toBeVisible();
    expect(await calls(page, READY)).toEqual([]);
    expect(await calls(page, CONFIRM)).toEqual([]);
    await shot(page, `client-${locale}-desktop`);
    const composer = page.locator(`textarea[data-support-composer="${C}"]`);
    await composer.fill("My unsent support draft");
    await panel.getByRole("button", { name: t.askChanges }).click();
    await expect(composer).toBeFocused();
    await expect(composer).toHaveValue("My unsent support draft");
    expect(await calls(page, "clientSupport.index.sendClientMessage")).toEqual([]);
    await panel.getByRole("button", { name: t.reviewVersion.replace("{number}", "1") }).click();
    const review = panel.getByRole("region", { name: t.reviewTitle });
    await expect(review.getByText(terms.fee.rate + " %", { exact: true })).toBeVisible();
    await expect(review.getByText(terms.startDate, { exact: true })).toBeVisible();
    await expect(review.getByText(t.confirmationMeaning)).toBeVisible();
    await expect(review.getByRole("checkbox")).not.toBeChecked();
    await expect(review.getByRole("button", { name: t.confirm, exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await shot(page, `client-${locale}-mobile`);
    await review.getByRole("checkbox").check();
    await review.getByRole("button", { name: t.confirm, exact: true }).click();
    await expect(panel.getByText(t.confirmationSaved)).toBeVisible();
    expect(await calls(page, CONFIRM)).toEqual([{ path: CONFIRM, args: { projectId: P, versionId: "version-1", expectedConfirmedVersionId: null, attestNotStarted: true } }]);
    await expect(composer).toHaveValue("My unsent support draft");
    expect(await page.locator("body").innerText()).not.toContain("PRIVATE_SOURCE_URL_COMPANY_PROPOSAL_OC2_DRAFT_SENTINEL");
    const queried = await page.evaluate(() => (window as unknown as W).__queryCalls);
    expect(queried.filter(path => /finalQuotes|quotes\.index|adminCompanyMessaging/.test(path))).toEqual([]);
    expect(queried).not.toContain(ADMIN);
  });

  test(`Client ${locale}: explicit private quote choice uses existing free-help support without accepting marketplace quote`, async ({ page }) => {
    await mountHarness(page, quoteBundle, { ...state(locale, "client", agreement()), __quote: quote });
    const panel = page.getByRole("region", { name: t.quoteReadinessTitle });
    await expect(page.getByRole("heading", { name: "Construction Company 12" })).toBeVisible();
    await expect(panel.getByText(t.quoteChoiceNote)).toBeVisible();
    expect(await calls(page, READY)).toEqual([]);
    // Eligibility alone never labels this quote as the saved source.
    await expect(panel.getByText(t.readinessSelected)).toHaveCount(0);
    await panel.getByRole("button", { name: t.useQuote.replace("{number}", "7") }).click();
    await expect(panel.getByText(t.readinessSelected)).toBeVisible();
    expect(await calls(page, READY)).toEqual([{ path: READY, args: { projectId: P, revisionId: "private-revision-7", expectedReadinessRevision: 2 } }]);
    expect(await calls(page, "finalQuotes.index.review")).toEqual([]);
    expect(await calls(page, "clientSupport.index.requestSupport")).toEqual([]);
  });

  test(`Client ${locale}: no support/readiness creation on render, explicit requests only`, async ({ page }) => {
    const initial = state(locale, "client", null);
    initial.__queries[GET_MINE] = null;
    await mountHarness(page, clientBundle, initial);
    await expect(page.getByRole("region", { name: t.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: support.actions.freeHelp.action })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as W).__mutationCalls)).toEqual([]);
    await mountHarness(page, quoteBundle, { ...initial, __quote: quote });
    await expect(page.getByText(t.supportRequired)).toBeVisible();
    await expect(page.getByRole("button", { name: t.useQuote.replace("{number}", "7") })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__mutationCalls)).toEqual([]);
  });

  test(`Admin ${locale}: private editor, all precise terms, unchecked declaration and publication review`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mount(page, locale, "admin");
    const panel = page.getByRole("region", { name: t.title, exact: true });
    const form = panel.getByRole("form", { name: t.privateDraft });
    await expect(form.getByLabel(t.fields.rate, { exact: true })).toHaveValue(terms.fee.rate);
    await expect(form.getByLabel(t.fields.basisAmountMad, { exact: true })).toHaveValue("1000.29");
    await expect(panel.getByText(t.adminSourcePrivacy)).toBeVisible();
    expect(await calls(page, PUBLISH)).toEqual([]);
    await shot(page, `admin-${locale}-desktop`);
    await panel.getByRole("button", { name: t.reviewSaved }).click();
    const review = panel.getByRole("region", { name: t.publicationReview });
    await expect(review.getByRole("checkbox")).not.toBeChecked();
    await expect(review.getByRole("button", { name: t.sendSummary, exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await hasHorizontalOverflow(page)).toBe(false);
    // The editor is hidden while the exact saved terms are reviewed.
    await expect(form).toBeHidden();
    await review.scrollIntoViewIfNeeded();
    await shot(page, `admin-${locale}-mobile`);
    await review.getByRole("checkbox").check();
    await review.getByRole("button", { name: t.sendSummary, exact: true }).click();
    await expect(panel.getByText(t.published, { exact: true })).toBeVisible();
    const sent = await calls(page, PUBLISH);
    expect(sent).toHaveLength(1);
    expect(sent[0].args).toMatchObject({ projectId: P, expectedDraftRevision: 1, expectedReadinessRevision: 2,
      expectedPendingVersionId: null, expectedConfirmedVersionId: null, attestNotStarted: true });
    expect(sent[0].args.idempotencyKey).toEqual(expect.any(String));
    expect(await page.locator("body").innerText()).not.toContain("PRIVATE_SOURCE_URL_COMPANY_PROPOSAL_OC2_DRAFT_SENTINEL");
    const queried = await page.evaluate(() => (window as unknown as W).__queryCalls);
    expect(queried.filter(path => /finalQuotes|quotes\.index|adminCompanyMessaging/.test(path))).toEqual([]);
    expect(queried).not.toContain(MINE);
    await page.getByRole("button", { name: support.admin.backToRequests }).click();
    await expect(page.getByRole("tab", { name: t.title })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Riad Medina/ })).toBeVisible();
  });
}

test("Client replacement stays separate from current terms, no first declaration and bounded history", async ({ page }) => {
  const t = en.coordinationAgreement;
  const confirmed = version(1, { status: "confirmed", isCurrentConfirmed: true, confirmation: { confirmedByDisplayName: "Sara Client", confirmedAt: AT, effectiveFrom: AT, notStartedDeclaredAt: AT } });
  const replacement = version(2, { replacesVersionId: "version-1", adminNotStartedDeclaredAt: null, terms: { ...terms, tasks: "Future replacement only" } });
  const initial = state("en", "client", agreement({ currentConfirmedVersion: confirmed, pendingVersion: replacement, versionCount: 2 }));
  initial.__paginatedQueries[HM] = { results: [replacement, confirmed], status: "CanLoadMore" };
  await mountHarness(page, clientBundle, initial);
  const panel = page.getByRole("region", { name: t.title, exact: true });
  await panel.locator("summary").filter({ hasText: t.history }).click();
  await panel.getByRole("button", { name: t.loadMore }).click();
  expect(await page.evaluate(() => (window as unknown as W).__paginationCalls)).toContainEqual({ path: HM, numItems: 5 });
  await panel.getByRole("button", { name: "Review version 2" }).click();
  const review = panel.getByRole("region", { name: t.reviewTitle });
  await expect(review.getByRole("checkbox")).toHaveCount(0);
  await expect(panel.getByText(t.replacementNote)).toBeVisible();
  await expect(review.getByText("Future replacement only")).toBeVisible();
  await review.getByRole("button", { name: t.confirm, exact: true }).click();
  expect(await calls(page, CONFIRM)).toEqual([{ path: CONFIRM, args: { projectId: P, versionId: "version-2", expectedConfirmedVersionId: "version-1" } }]);
});

test("Client freezes reviewed version and blocks changed preference/newer pending version", async ({ page }) => {
  const t = en.coordinationAgreement;
  await mount(page, "en", "client");
  await page.getByRole("button", { name: "Review version 1" }).click();
  const review = page.getByRole("region", { name: t.reviewTitle });
  await review.getByRole("checkbox").check();
  await update(page, MINE, agreement({ readiness: { eligible: true, declaredAt: AT, revision: 3 }, pendingVersion: version(2, { terms: { ...terms, tasks: "New unreviewed terms" } }) }));
  await expect(review.getByText(t.staleReview)).toBeVisible();
  await expect(review.getByText(terms.tasks)).toBeVisible();
  await expect(review.getByText("New unreviewed terms")).toHaveCount(0);
  await expect(review.getByRole("button", { name: t.confirm, exact: true })).toBeDisabled();
  expect(await calls(page, CONFIRM)).toEqual([]);
});

test("Client confirmation retry keeps exact version/predecessor even after reactive replacement", async ({ page }) => {
  const t = en.coordinationAgreement;
  await page.clock.install({ time: new Date(AT) });
  await mount(page, "en", "client");
  await errors(page, CONFIRM, "NETWORK");
  await page.getByRole("button", { name: "Review version 1" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: t.confirm, exact: true }).click();
  await expect(page.getByRole("button", { name: t.retryConfirmation })).toBeEnabled();
  await advisoryGap(page, MINE);
  await expect(page.getByRole("button", { name: t.retryConfirmation })).toBeDisabled();
  expect(await calls(page, CONFIRM)).toHaveLength(1);
  await settleAdvisory(page, MINE, agreement({ pendingVersion: version(2), pendingConfirmationStatus: "readiness_changed" }));
  await errors(page, CONFIRM, "");
  await page.getByRole("button", { name: t.retryConfirmation }).click();
  const sent = await calls(page, CONFIRM);
  expect(sent).toHaveLength(2); expect(sent[1]).toEqual(sent[0]);
  expect(sent[1].args.versionId).toBe("version-1");
});

test("Client fresh null replaces the retained summary instead of keeping old terms", async ({ page }) => {
  await page.clock.install({ time: new Date(AT) });
  const current = version(1, { status: "confirmed", isCurrentConfirmed: true,
    confirmation: { confirmedByDisplayName: "Sara Client", confirmedAt: AT, effectiveFrom: AT, notStartedDeclaredAt: AT } });
  await mount(page, "en", "client", agreement({ currentConfirmedVersion: current, pendingVersion: null, pendingConfirmationStatus: null }));
  const panel = page.getByRole("region", { name: en.coordinationAgreement.title, exact: true });
  await panel.locator("details").first().locator("summary").click();
  await expect(panel.getByText(terms.tasks, { exact: true })).toBeVisible();
  await advisoryGap(page, MINE);
  await expect(panel.getByText(terms.tasks, { exact: true })).toBeVisible();
  await settleAdvisory(page, MINE, null);
  await expect(panel.getByText(terms.tasks, { exact: true })).toHaveCount(0);
  await expect(panel.getByText(en.coordinationAgreement.noCurrent, { exact: true })).toBeVisible();
  expect(await calls(page, CONFIRM)).toEqual([]);
});

for (const locale of ["en", "fr"] as const) {
  for (const status of ["readiness_changed", "source_unavailable"] as const) {
    test(`Client ${locale}: reload blocks ${status} while retaining summary and confirmed history`, async ({ page }) => {
      const t = (locale === "fr" ? fr : en).coordinationAgreement;
      await mount(page, locale, "client");
      await page.getByRole("button", { name: t.reviewVersion.replace("{number}", "1") }).click();
      await page.getByRole("checkbox").check();
      await expect(page.getByRole("button", { name: t.confirm, exact: true })).toBeEnabled();
      const confirmed = version(1, { status: "confirmed", isCurrentConfirmed: true,
        terms: { ...terms, tasks: "Confirmed history retained" },
        confirmation: { confirmedByDisplayName: "Client", confirmedAt: AT, effectiveFrom: AT, notStartedDeclaredAt: AT } });
      const reloaded = state(locale, "client", agreement({
        readiness: { eligible: status === "readiness_changed", declaredAt: AT, revision: 3 },
        pendingConfirmationStatus: status, currentConfirmedVersion: confirmed,
        pendingVersion: version(2, { replacesVersionId: "version-1", adminNotStartedDeclaredAt: null }), versionCount: 2,
      }));
      reloaded.__paginatedQueries[HM] = { results: [confirmed], status: "Exhausted" };
      // A new document/React tree simulates a reload with the fresh server response;
      // no captured readiness token or open-review state survives.
      await mountHarness(page, clientBundle, reloaded);
      const panel = page.getByRole("region", { name: t.title, exact: true });
      await expect(panel.getByRole("heading", { name: t.pendingBlocked })).toBeVisible();
      await expect(panel.getByRole("heading", { name: t.pending, exact: true })).toHaveCount(0);
      await panel.getByRole("button", { name: t.reviewVersion.replace("{number}", "2") }).click();
      const review = panel.getByRole("region", { name: t.reviewTitle });
      await expect(review.getByText(t.confirmationStatus[status])).toBeVisible();
      await expect(review.getByText(terms.tasks)).toBeVisible();
      await expect(review.getByRole("button", { name: t.confirm, exact: true })).toBeDisabled();
      await panel.locator("summary").filter({ hasText: t.history }).click();
      await panel.locator("summary").filter({ hasText: `${t.version.replace("{number}", "1")} · ${t.current}` }).click();
      await expect(panel.getByText("Confirmed history retained").last()).toBeVisible();
      expect(await calls(page, CONFIRM)).toEqual([]);
      expect(await calls(page, READY)).toEqual([]);
    });
  }
}

test("Client conflict requires fresh review; clearing readiness uses current token without touching history", async ({ page }) => {
  const t = en.coordinationAgreement;
  await mount(page, "en", "client");
  await errors(page, CONFIRM, "COORDINATION_VERSION_CONFLICT");
  await page.getByRole("button", { name: "Review version 1" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: t.confirm, exact: true }).click();
  await expect(page.getByRole("button", { name: t.confirm, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: t.retryConfirmation })).toHaveCount(0);
  await page.getByRole("button", { name: t.closeReview }).click();
  await page.getByRole("button", { name: t.clearReadiness }).click();
  await expect(page.getByText(t.readinessCleared)).toBeVisible();
  expect(await calls(page, READY)).toEqual([{ path: READY, args: { projectId: P, revisionId: null, expectedReadinessRevision: 2 } }]);
  expect((await calls(page, CONFIRM))).toHaveLength(1);
});

for (const [name, changed] of [
  ["absent readiness", { readiness: { eligible: false, declaredAt: null, revision: 0 } }],
  ["blocked project status", { projectAllowsNewActions: false }],
  ["passed start date", { pendingVersion: version(1, { terms: { ...terms, startDate: "2000-01-01" } }) }],
] as const) test(`Client cannot confirm with ${name}`, async ({ page }) => {
  await mount(page, "en", "client", agreement(changed));
  await page.getByRole("button", { name: "Review version 1" }).click();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: en.coordinationAgreement.confirm, exact: true })).toBeDisabled();
  expect(await calls(page, CONFIRM)).toEqual([]);
});

test("Admin saves exact decimal terms on a blocked project without readiness, but cannot publish", async ({ page }) => {
  const t = en.coordinationAgreement;
  await mount(page, "en", "admin", adminAgreement({ readiness: { eligible: false, declaredAt: null, revision: 0 }, projectAllowsNewActions: false, draftRevision: 0, draft: null }));
  const form = page.getByRole("form", { name: t.privateDraft });
  for (const field of ["tasks", "exclusions", "visits", "availability", "payer", "paymentTerms"] as const) await form.getByLabel(t.fields[field], { exact: true }).fill(terms[field]);
  await form.getByLabel(t.fields.startDate).fill(terms.startDate);
  await form.getByLabel(t.fields.fee, { exact: true }).selectOption("fixed");
  await form.getByLabel(t.fields.amountMad).fill("1000,29");
  await page.evaluate(({ save, admin, data }) => {
    const w = window as unknown as W;
    w.__mutationHandlers = { [save]: args => { w.__queries[admin] = { ...data, draftRevision: 1, draft: { terms: args.terms, savedAt: Date.now(), savedByDisplayName: "Ada Admin" } }; window.dispatchEvent(new Event("convex-harness-update")); return { draftRevision: 1 }; } };
  }, { save: SAVE, admin: ADMIN, data: adminAgreement({ readiness: { eligible: false, declaredAt: null, revision: 0 }, projectAllowsNewActions: false }) });
  await form.getByRole("button", { name: t.saveDraft, exact: true }).click();
  await expect(page.getByText(t.draftSaved, { exact: true })).toBeVisible();
  expect((await calls(page, SAVE))[0].args).toMatchObject({ projectId: P, expectedDraftRevision: 0, terms: { fee: { kind: "fixed", amountMad: 1000.29 }, currency: "MAD", payer: terms.payer } });
  await page.getByRole("button", { name: t.reviewSaved }).click();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: t.sendSummary, exact: true })).toBeDisabled();
  expect(await calls(page, PUBLISH)).toEqual([]);
});

test("Admin preserves dirty precise inputs after reactive draft conflict and query loading", async ({ page }) => {
  const t = en.coordinationAgreement;
  await mount(page, "en", "admin");
  const input = page.getByLabel(t.fields.rate, { exact: true });
  await input.fill("0,0000000000000000000100");
  await update(page, ADMIN, undefined);
  await expect(input).toHaveValue("0,0000000000000000000100");
  await update(page, ADMIN, adminAgreement({ draftRevision: 2, draft: { terms: { ...terms, tasks: "Other admin saved terms" }, savedAt: AT, savedByDisplayName: "Other admin" } }));
  await expect(page.getByText(t.staleDraft)).toBeVisible();
  await expect(input).toHaveValue("0,0000000000000000000100");
  await expect(page.getByRole("button", { name: t.saveDraft, exact: true })).toBeDisabled();
  expect(await calls(page, SAVE)).toEqual([]);
});

test("Admin sends percentage digits verbatim, rejects rounded centimes and preserves rejected draft", async ({ page }) => {
  const t = en.coordinationAgreement;
  await mount(page, "en", "admin");
  const form = page.getByRole("form", { name: t.privateDraft });
  await form.getByLabel(t.fields.rate, { exact: true }).fill("0,0000000000000000000100");
  await form.getByLabel(t.fields.basisAmountMad, { exact: true }).fill("1000,291");
  await form.getByRole("button", { name: t.saveDraft, exact: true }).click();
  await expect(page.getByText(en.ux.error.codes.INVALID_COORDINATION_AMOUNT, { exact: true })).toBeVisible();
  expect(await calls(page, SAVE)).toEqual([]);
  await form.getByLabel(t.fields.basisAmountMad, { exact: true }).fill("1000,29");
  await errors(page, SAVE, "COORDINATION_DRAFT_CONFLICT");
  await form.getByRole("button", { name: t.saveDraft, exact: true }).click();
  await expect(form.getByText(t.staleDraft)).toBeVisible();
  await expect(form.getByRole("button", { name: t.saveDraft, exact: true })).toBeDisabled();
  await expect(form.getByLabel(t.fields.rate, { exact: true })).toHaveValue("0,0000000000000000000100");
  expect((await calls(page, SAVE))[0].args).toMatchObject({ expectedDraftRevision: 1,
    terms: { fee: { kind: "percentage", rate: "0.0000000000000000000100", basisAmountMad: 1000.29 } } });
  await expect(form.getByRole("button", { name: t.reloadDraft })).toBeEnabled();
});

test("Admin publication consumes draft revision; replacement uses predecessor without another first declaration", async ({ page }) => {
  const t = en.coordinationAgreement;
  await mount(page, "en", "admin");
  const current = version(1, { status: "confirmed", isCurrentConfirmed: true,
    confirmation: { confirmedByDisplayName: "Sara Client", confirmedAt: AT, effectiveFrom: AT, notStartedDeclaredAt: AT } });
  await page.evaluate(({ publish, admin, confirmed, data }) => {
    const w = window as unknown as W;
    w.__mutationHandlers = { [publish]: () => { w.__queries[admin] = { ...data, draftRevision: 2, draft: null, currentConfirmedVersion: confirmed, pendingVersion: null }; window.dispatchEvent(new Event("convex-harness-update")); return { versionId: "version-1" }; } };
  }, { publish: PUBLISH, admin: ADMIN, confirmed: current, data: adminAgreement() });
  await page.getByRole("button", { name: t.reviewSaved }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: t.sendSummary, exact: true }).click();
  await expect(page.getByText(t.published, { exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: t.current }).click();
  await page.getByRole("button", { name: t.prepareRevision }).click();
  await expect(page.getByLabel(t.fields.tasks, { exact: true })).toHaveValue(terms.tasks);
  await page.evaluate(({ save, admin }) => {
    const w = window as unknown as W;
    w.__mutationHandlers[save] = args => { w.__queries[admin] = { ...w.__queries[admin] as object, draftRevision: 3, draft: { terms: args.terms, savedAt: Date.now(), savedByDisplayName: "Ada Admin" } }; window.dispatchEvent(new Event("convex-harness-update")); return { draftRevision: 3 }; };
  }, { save: SAVE, admin: ADMIN });
  await page.getByRole("button", { name: t.saveDraft, exact: true }).click();
  await expect(page.getByText(t.draftSaved, { exact: true })).toBeVisible();
  expect((await calls(page, SAVE))[0].args.expectedDraftRevision).toBe(2);
  await page.getByRole("button", { name: t.reviewSaved }).click();
  const review = page.getByRole("region", { name: t.publicationReview });
  await expect(review.getByRole("checkbox")).toHaveCount(0);
  await review.getByRole("button", { name: t.sendSummary, exact: true }).click();
  const sent = await calls(page, PUBLISH);
  expect(sent[1].args).toMatchObject({ expectedDraftRevision: 3, expectedConfirmedVersionId: "version-1" });
  expect(sent[1].args).not.toHaveProperty("attestNotStarted");
});

test("Admin publication retry reuses key and pointers; a new review gets a new key", async ({ page }) => {
  const t = en.coordinationAgreement;
  await mount(page, "en", "admin");
  await errors(page, PUBLISH, "NETWORK");
  await page.getByRole("button", { name: t.reviewSaved }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: t.sendSummary, exact: true }).click();
  await expect(page.getByRole("button", { name: t.retryPublication })).toBeEnabled();
  await page.getByRole("button", { name: t.retryPublication }).click();
  await expect.poll(() => calls(page, PUBLISH)).toHaveLength(2);
  const sent = await calls(page, PUBLISH); expect(sent[1]).toEqual(sent[0]);
  await page.getByRole("button", { name: t.closeReview }).click();
  await errors(page, PUBLISH, "COORDINATION_VERSION_CONFLICT");
  await page.getByRole("button", { name: t.reviewSaved }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: t.sendSummary, exact: true }).click();
  await expect(page.getByRole("button", { name: t.sendSummary, exact: true })).toBeDisabled();
  const changed = await calls(page, PUBLISH);
  expect(changed).toHaveLength(3);
  expect(changed[2].args.idempotencyKey).not.toEqual(sent[0].args.idempotencyKey);
  await expect(page.getByRole("button", { name: t.retryPublication })).toHaveCount(0);
});

test("Admin review remains frozen on changed pointers and revised summary is an editor-only copy", async ({ page }) => {
  const t = en.coordinationAgreement;
  const current = version(1, { status: "confirmed", isCurrentConfirmed: true, confirmation: { confirmedByDisplayName: "Sara Client", confirmedAt: AT, effectiveFrom: AT, notStartedDeclaredAt: AT } });
  await mount(page, "en", "admin", adminAgreement({ currentConfirmedVersion: current }));
  await page.getByRole("button", { name: t.reviewSaved }).click();
  const review = page.getByRole("region", { name: t.publicationReview });
  await expect(review.getByRole("checkbox")).toHaveCount(0);
  await update(page, ADMIN, adminAgreement({ draftRevision: 2, currentConfirmedVersion: current, draft: { terms: { ...terms, tasks: "Unreviewed replacement" }, savedAt: AT, savedByDisplayName: "Other admin" } }));
  await expect(review.getByText(t.staleReview)).toBeVisible();
  await expect(review.getByText(terms.tasks)).toBeVisible();
  await expect(review.getByRole("button", { name: t.sendSummary, exact: true })).toBeDisabled();
  await review.getByRole("button", { name: t.closeReview }).click();
  await page.locator("summary").filter({ hasText: t.current }).click();
  await page.getByRole("button", { name: t.prepareRevision }).click();
  await expect(page.getByLabel(t.fields.tasks, { exact: true })).toHaveValue(terms.tasks);
  expect(await calls(page, SAVE)).toEqual([]); expect(await calls(page, PUBLISH)).toEqual([]);
});

for (const role of ["client", "admin"] as const) {
  test(`${role}: logout/revocation removes private agreement state, no leaked editor/review on return`, async ({ page }) => {
    await page.clock.install({ time: new Date(AT) });
    await mount(page, "en", role);
    if (role === "client") await page.getByRole("button", { name: "Review version 1" }).click();
    else await page.getByLabel(en.coordinationAgreement.fields.tasks, { exact: true }).fill("Private unsaved admin sentinel");
    await advisoryGap(page, role === "client" ? MINE : ADMIN);
    await update(page, "users.currentUser", null);
    await expect(page.getByText(terms.tasks, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(en.coordinationAgreement.fields.tasks, { exact: true })).toHaveCount(0);
    await settleAdvisory(page, role === "client" ? MINE : ADMIN, role === "client" ? agreement() : adminAgreement());
    await update(page, "users.currentUser", { _id: role, accountType: role, onboardingStatus: "completed" });
    if (role === "client") await expect(page.getByRole("region", { name: en.coordinationAgreement.reviewTitle })).toHaveCount(0);
    else await expect(page.getByLabel(en.coordinationAgreement.fields.tasks, { exact: true })).toHaveValue(terms.tasks);
    expect(await calls(page, CONFIRM)).toEqual([]); expect(await calls(page, SAVE)).toEqual([]);
  });
  test(`${role}: agreement access query denial clears private state without leaking error details`, async ({ page }) => {
    await page.clock.install({ time: new Date(AT) });
    await mount(page, "en", role);
    if (role === "client") await page.getByRole("button", { name: "Review version 1" }).click();
    await advisoryGap(page, role === "client" ? MINE : ADMIN);
    await page.evaluate(path => {
      const w = window as unknown as W;
      w.__queryHandlers = { [path]: () => { throw new Error("COORDINATION_AGREEMENT_NOT_FOUND PRIVATE_STACK_SENTINEL"); } };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, role === "client" ? MINE : ADMIN);
    await expect(page.getByText(en.coordinationAgreement.denied)).toBeVisible();
    await expect(page.getByRole("button", { name: en.coordinationAgreement.confirm, exact: true })).toHaveCount(0);
    await expect(page.getByLabel(en.coordinationAgreement.fields.tasks, { exact: true })).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("PRIVATE_STACK_SENTINEL");
  });
}

test("Admin project switch isolates late draft results and preserves support chat draft across summary tabs", async ({ page }) => {
  const t = en.coordinationAgreement;
  await mount(page, "en", "admin");
  await page.getByRole("tab", { name: t.messagesTab, exact: true }).click();
  const composer = page.locator(`textarea[data-support-composer="${C}"]`);
  await composer.fill("Chat draft must survive summary view");
  await page.getByRole("tab", { name: t.title, exact: true }).click();
  await page.getByLabel(t.fields.tasks, { exact: true }).fill("Late Villa save");
  await page.evaluate(({ save, get, admin, second }) => {
    const w = window as unknown as W;
    w.__mutationDelays = { [save]: 300 };
    w.__mutationHandlers = { [save]: () => ({ draftRevision: 2 }) };
    w.__queryHandlers = { [get]: args => args.projectId === second ? { ...w.__queries[get] as object, id: "support-riad", project: { id: second, title: "Riad Medina", city: "rabat", status: "published" } } : w.__queries[get],
      [admin]: args => args.projectId === second ? null : w.__queries[admin] };
  }, { save: SAVE, get: GET_ADMIN, admin: ADMIN, second: P2 });
  await page.getByRole("button", { name: t.saveDraft, exact: true }).click();
  await page.getByRole("button", { name: /Riad Medina/ }).click();
  await page.getByRole("tab", { name: t.title, exact: true }).click();
  await expect(page.getByLabel(t.fields.tasks, { exact: true })).toHaveValue("");
  await expect.poll(() => page.evaluate(path => (window as unknown as W).__mutationCompletions?.includes(path), SAVE)).toBe(true);
  await expect(page.getByLabel(t.fields.tasks, { exact: true })).toHaveValue("");
  await expect(page.getByText(t.draftSaved, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Villa Atlas/ }).click();
  await page.getByRole("tab", { name: t.messagesTab, exact: true }).click();
  await expect(composer).toHaveValue("Chat draft must survive summary view");
});

test("Admin summary view never acknowledges newly arrived hidden support messages", async ({ page }) => {
  await mount(page, "en", "admin");
  const before = await calls(page, READ_ADMIN);
  await page.evaluate(({ messages, get, at, conversation }) => {
    const w = window as unknown as W;
    w.__queries[get] = { ...w.__queries[get] as object, entryCount: 2, readThroughSequence: 1, unreadCount: 1, hasUnread: true };
    w.__paginatedQueries[messages] = { status: "Exhausted", results: [{ id: "new-message", conversationId: conversation, kind: "message", senderType: "client", senderDisplayName: "Sara Client", body: "Hidden message", sequence: 2, isOwnMessage: false, createdAt: at }] };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { messages: LA, get: GET_ADMIN, at: AT, conversation: C });
  await expect(page.getByLabel(en.coordinationAgreement.fields.tasks, { exact: true })).toBeVisible();
  expect(await calls(page, READ_ADMIN)).toEqual(before);
  await page.getByRole("tab", { name: en.coordinationAgreement.messagesTab, exact: true }).click();
  await expect(page.getByText("Hidden message", { exact: true })).toBeVisible();
  await expect.poll(() => calls(page, READ_ADMIN)).toHaveLength(before.length + 1);
});

test("Focus refreshes advisory clock and passed start date requires a new version", async ({ page }) => {
  await page.clock.install({ time: new Date("2099-11-02T10:00:00Z") });
  await mount(page, "en", "client");
  await page.getByRole("button", { name: "Review version 1" }).click();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: en.coordinationAgreement.confirm, exact: true })).toBeEnabled();
  await page.clock.setSystemTime(new Date("2099-11-03T10:00:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(en.coordinationAgreement.startPassed)).toBeVisible();
  await expect(page.getByRole("button", { name: en.coordinationAgreement.confirm, exact: true })).toBeDisabled();
  expect(await calls(page, CONFIRM)).toEqual([]);
});
