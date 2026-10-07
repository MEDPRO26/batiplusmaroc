import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

let harnessBundle = "";
const shots = process.env.PROPOSAL_UX_SCREENSHOTS;

/** Mounts the real company project + proposal pages against mocked Convex queries. */
test.beforeAll(async () => {
  harnessBundle = await buildHarness(
    `import { ProjectDetailsView } from "./features/projects/components/company-project-details";
     import { CompanyInitialQuoteWorkspace } from "./features/quotes/components/company-initial-quote-workspace";`,
    `{window.__screen === "details" ? <ProjectDetailsView project={window.__project} /> : <CompanyInitialQuoteWorkspace projectId="project-1" />}`,
  );
});

const longDescription = Array.from({ length: 6 }, (_, index) =>
  `Phase ${index + 1}: complete renovation of the ground floor including demolition of non-load-bearing walls, new electrical network to current standards, plumbing for two bathrooms, and premium finishes chosen with the architect.`,
).join("\n\n");

const project = {
  id: "project-1",
  title: "Complete renovation and extension of a family villa with a new terrace, pool house and landscaped garden",
  city: "agadir",
  primaryCategory: "renovation",
  customCategoryText: null,
  timeline: "one_to_three_months",
  propertyType: "house",
  surface: 240,
  surfaceUnknown: false,
  description: longDescription,
  publishedAt: 1_790_000_000_000,
  neighborhood: "Founty",
  canSubmitQuote: true,
  myQuoteId: null,
  client: {
    displayName: "Samir C.",
    firstName: "Samir",
    lastInitial: "C",
    city: "Agadir",
    joinedAt: 1_700_000_000_000,
    projectsPostedCount: 3,
    projectsCompletedCount: 1,
    emailVerified: true,
    phoneVerified: true,
  },
};

const company = { accountType: "company", onboardingStatus: "completed" };

async function mount(page: Page, options: { locale: "en" | "fr"; screen: "details" | "proposal"; project?: unknown; queries?: Record<string, unknown> }) {
  await mountHarness(page, harnessBundle, {
    __locale: options.locale,
    __screen: options.screen,
    __project: options.project ?? project,
    __queries: {
      "users.currentUser": company,
      "siteVisits.index.getForProject": { assessment: null },
      ...options.queries,
    },
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await hasHorizontalOverflow(page)).toBe(false);
}

const submissionContext = {
  project: { id: "project-1", title: project.title, city: "agadir", primaryCategory: "renovation", timeline: "one_to_three_months" },
  verificationStatus: "verified",
  marketplaceWriteAllowed: true,
  activeQuoteId: null,
  latestQuoteId: null,
};

test("project details present a proposal-first layout without budget", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount(page, { locale: "en", screen: "details" });

  await expect(page.getByRole("heading", { level: 1, name: project.title })).toBeVisible();
  await expect(page.getByText(/budget/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Project information" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Services requested" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "About the client" })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("link", { name: "Submit a proposal" })).toHaveAttribute("href", "/espace-entreprise/projets/project-1/devis");
  await expect(page.getByRole("link", { name: /message/i })).toHaveCount(0);

  const toggle = page.getByRole("button", { name: "Show more" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  if (shots) await page.screenshot({ path: `${shots}/details-desktop-en.png`, fullPage: true });
  await toggle.click();
  await expect(page.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");

  await page.mouse.wheel(0, 900);
  const sidebar = page.getByRole("complementary");
  await expect.poll(async () => (await sidebar.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(90);
  if (shots) await page.screenshot({ path: `${shots}/details-desktop-en-scrolled.png` });
  await expectNoHorizontalOverflow(page);
});

test("project details work in French on mobile with a single action bar", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, { locale: "fr", screen: "details" });

  await expect(page.getByRole("heading", { name: "Informations du projet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Envoyer une proposition" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Envoyer une proposition" }).last()).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  if (shots) await page.screenshot({ path: `${shots}/details-mobile-fr.png`, fullPage: true });
  if (shots) await page.screenshot({ path: `${shots}/details-mobile-fr-viewport.png` });
});

test("an existing proposal replaces the submit action", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mount(page, { locale: "en", screen: "details", project: { ...project, canSubmitQuote: false, myQuoteId: "quote-1" } });

  await expect(page.getByRole("link", { name: "Submit a proposal" })).toHaveCount(0);
  await expect(page.getByText("You already sent a proposal")).toBeVisible();
  await expect(page.getByRole("link", { name: "View my proposal" }).first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/details-tablet-submitted.png`, fullPage: true });
});

test("an unverified company sees a disabled action and optional fields fall back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page, {
    locale: "en",
    screen: "details",
    project: { ...project, title: "Kitchen refit", description: "Short brief.", canSubmitQuote: false, propertyType: null, surface: null, surfaceUnknown: true, neighborhood: null, client: null },
  });

  await expect(page.getByRole("complementary").getByRole("button", { name: "Submit a proposal" })).toBeDisabled();
  await expect(page.getByRole("complementary").getByRole("link", { name: "Verify company" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
  await expect(page.getByText("Not specified")).toHaveCount(2);
  if (shots) await page.screenshot({ path: `${shots}/details-desktop-unverified.png`, fullPage: true });
});

test("the proposal form uses marketplace sections and submits the existing fields", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount(page, { locale: "en", screen: "proposal", queries: { "quotes.index.getSubmissionContext": submissionContext } });

  await expect(page.getByRole("heading", { level: 1, name: "Submit a proposal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your estimate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Additional details" })).toBeVisible();
  await expect(page.getByText(/hourly|service fee|commission/i)).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/proposal-desktop-en.png`, fullPage: true });

  await page.getByRole("button", { name: "Submit proposal" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Complete all required fields." })).toBeVisible();

  await page.getByLabel("Initial estimate").fill("350000");
  await page.getByLabel("Estimated duration").fill("60");
  await page.getByLabel("Available start date").fill("2026-11-02");
  const message = "We are a verified Agadir contractor with twelve villa renovations delivered.";
  await page.getByLabel("Proposal message").fill(message);
  await page.getByLabel("Scope of work").fill("Demolition, electrical, plumbing, finishes and terrace extension.");
  await expect(page.getByText(`${message.length} / 2000`)).toBeVisible();
  await page.getByRole("button", { name: "Submit proposal" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mutationCalls?: unknown[] }).__mutationCalls?.length ?? 0)).toBe(1);
});

test("the proposal form stays usable in French on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, { locale: "fr", screen: "proposal", queries: { "quotes.index.getSubmissionContext": submissionContext } });

  await expect(page.getByRole("heading", { level: 1, name: "Envoyer une proposition" })).toBeVisible();
  await expect(page.getByLabel("Estimation initiale")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  if (shots) await page.screenshot({ path: `${shots}/proposal-mobile-fr.png`, fullPage: true });
});

test("a submitted proposal is shown instead of the form, with messaging locked", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await mount(page, {
    locale: "en",
    screen: "proposal",
    queries: {
      "quotes.index.getSubmissionContext": { ...submissionContext, activeQuoteId: "quote-1", latestQuoteId: "quote-1" },
      "quotes.index.getMyQuote": { id: "quote-1", status: "submitted", submittedAt: 1_790_100_000_000, estimatedPrice: 350000, estimatedDuration: 60, availableStartDate: "2026-11-02", scope: "Demolition, electrical, plumbing and finishes.", message: "We are a verified Agadir contractor." },
    },
  });

  await expect(page.getByRole("heading", { level: 1, name: "Your proposal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit proposal" })).toHaveCount(0);
  await expect(page.getByText(/Messaging is still locked/)).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/proposal-submitted-desktop.png`, fullPage: true });
});
