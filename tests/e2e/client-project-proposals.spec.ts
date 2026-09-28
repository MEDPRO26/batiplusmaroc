import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

let harnessBundle = "";
const shots = process.env.PROPOSAL_UX_SCREENSHOTS;

/** Mounts the real client project workspace (details + received proposals) against mocked Convex data. */
test.beforeAll(async () => {
  harnessBundle = await buildHarness(
    `import { ClientProjectDetailsView } from "./features/projects/components/client-project-details";
     import { ClientReceivedQuotes } from "./features/quotes/components/client-received-quotes";`,
    `<ClientProjectDetailsView project={window.__project} quotesSlot={<ClientReceivedQuotes projectId={window.__project.id} />} />`,
  );
});

const day = 86_400_000;
const publishedAt = 1_789_900_000_000;

const project = {
  id: "project-1",
  title: "Construction of a two-storey family villa with basement parking and rooftop terrace in Marrakech",
  primaryCategory: "buildingConstruction",
  customCategoryText: null,
  city: "marrakech",
  neighborhood: "Guéliz",
  description: Array.from({ length: 5 }, (_, index) => `Lot ${index + 1}: earthworks, reinforced concrete structure, masonry, waterproofing and technical networks for a 222 m² family villa. Plans and soil study are available.`).join("\n\n"),
  propertyType: "building",
  surface: 222,
  surfaceUnknown: false,
  timeline: "within_1_month",
  status: "published",
  createdAt: publishedAt - 2 * day,
  submittedAt: publishedAt - day,
  updatedAt: publishedAt,
  thumbnailUrl: null,
  canResume: false,
  canView: true,
  images: [],
  attachments: [],
  history: [
    { oldStatus: "draft", newStatus: "pending_review", changedAt: publishedAt - day, actor: "client", reason: null },
    { oldStatus: "pending_review", newStatus: "published", changedAt: publishedAt, actor: "staff", reason: null },
  ],
  viewerRole: "owner",
};

const company = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  city: "Agadir",
  description: "General contractor specialised in villas and small residential buildings across the Souss-Massa region.",
  logoUrl: null,
  isVerified: true,
  ...extra,
});

const proposal = (id: string, status: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  projectId: "project-1",
  companyId: `company-${id}`,
  message: "We have delivered twelve villas in Marrakech over the last five years and can mobilise a structural team within two weeks of signature.",
  estimatedPrice: 2_150_000,
  currency: "MAD",
  estimatedDuration: 240,
  availableStartDate: "2026-10-15",
  scope: "Earthworks, reinforced concrete structure, masonry and waterproofing. Finishing works quoted separately after a site visit.",
  status,
  submittedAt: publishedAt + day,
  company: company(name),
  ...extra,
});

const proposals = [
  proposal("quote-new", "submitted", "Atlas Bâtiment"),
  proposal("quote-short", "shortlisted", "Souss Construction", { estimatedPrice: 1_980_000 }),
  proposal("quote-open", "discussion_open", "Menara Travaux", { company: company("Menara Travaux", { description: null }) }),
  proposal("quote-declined", "declined", "Oasis BTP"),
];

async function mount(page: Page, options: { locale?: "en" | "fr"; project?: Record<string, unknown>; quotes?: unknown[]; detail?: unknown; threads?: unknown[]; mutationResults?: Record<string, unknown> } = {}) {
  await mountHarness(page, harnessBundle, {
    __locale: options.locale ?? "en",
    __project: { ...project, ...options.project },
    __queries: {
      "quotes.index.listReceivedInitialQuotes": options.quotes ?? proposals,
      "quotes.index.getReceivedInitialQuote": options.detail ?? { ...proposals[0], status: "viewed", history: [] },
      "invitations.index.listProjectInvitations": [],
      "messages.index.listMyThreads": options.threads ?? [],
    },
    __mutationResults: options.mutationResults ?? {},
  });
}

const mutationCalls = (page: Page) => page.evaluate(() => (window as unknown as { __mutationCalls?: { path: string; args: Record<string, unknown> }[] }).__mutationCalls ?? []);

test("the workspace shows the project, a real proposal summary and scannable proposals", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount(page);

  await expect(page.getByRole("heading", { level: 1, name: project.title })).toBeVisible();
  await expect(page.getByText(/budget|quote/i)).toHaveCount(0);
  await expect(page.locator("header").getByText(/^Published \w+ \d+, 2026$/)).toBeVisible();

  const overview = page.getByRole("region", { name: "Proposals" }).first();
  await expect(overview.getByText("Received").locator("..")).toContainText("4");
  await expect(overview.getByText("New", { exact: true }).locator("..")).toContainText("1");
  await expect(overview.getByText("Shortlisted").locator("..")).toContainText("1");
  await expect(overview.getByText("Discussions opened").locator("..")).toContainText("1");
  await expect(overview.getByText("1 new proposal is waiting for your review.")).toBeVisible();

  const list = page.locator("#proposals");
  await expect(list.getByRole("heading", { level: 2, name: "Proposals" })).toBeVisible();
  await expect(list.getByText("4 received")).toBeVisible();
  await expect(list.getByRole("button", { name: "Review proposal" })).toHaveCount(4);
  await expect(list.getByText("Initial estimate").first()).toBeVisible();

  const activity = page.locator("details");
  await expect(activity).not.toHaveAttribute("open", "");
  await expect(page.getByText("Pending review → Published")).toBeHidden();
  await page.getByText("Project activity").click();
  await expect(page.getByText("Pending review → Published")).toBeVisible();

  expect(await hasHorizontalOverflow(page)).toBe(false);
  if (shots) await page.screenshot({ path: `${shots}/client-desktop-en.png`, fullPage: true });
});

test("reviewing a new proposal marks it viewed and keeps actions separate", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount(page);

  const trigger = page.getByRole("button", { name: "Review proposal" }).first();
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Atlas Bâtiment" });
  await expect(drawer).toBeVisible();
  expect((await mutationCalls(page)).map((call) => call.path)).toContain("quotes.index.markInitialQuoteViewed");

  await expect(drawer.getByRole("button", { name: "Open discussion" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Shortlist" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Decline" })).toBeVisible();
  await expect(drawer.getByText("Opening a discussion creates a private project conversation with this company.")).toBeVisible();
  await expect(drawer.getByText(/not a final quote/)).toBeVisible();
  await expect(drawer.getByRole("link", { name: /Continue in Messages/ })).toHaveCount(0);
  const box = await drawer.boundingBox();
  expect(box?.width).toBe(680);
  if (shots) await page.screenshot({ path: `${shots}/client-drawer-new.png` });

  for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
  expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  await drawer.getByRole("button", { name: "Decline" }).click();
  await expect(drawer.getByRole("alertdialog", { name: "Decline this proposal?" })).toBeVisible();
  expect((await mutationCalls(page)).map((call) => call.path)).not.toContain("quotes.index.reviewInitialQuote");
  await drawer.getByRole("button", { name: "Keep proposal" }).click();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("opening a discussion replaces the action with a continue-in-messages state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page, { mutationResults: { "quotes.index.reviewInitialQuote": { status: "discussion_open", conversationId: "conversation-1" } } });

  await page.getByRole("button", { name: "Review proposal" }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Open discussion" }).click();

  const calls = await mutationCalls(page);
  expect(calls.at(-1)).toEqual({ path: "quotes.index.reviewInitialQuote", args: { quoteId: "quote-new", action: "open_discussion" } });
  await expect(drawer.getByRole("link", { name: /Continue in Messages/ })).toHaveAttribute("href", "/messages/conversation-1");
  await expect(drawer.getByRole("button", { name: "Open discussion" })).toHaveCount(0);
  await expect(drawer.getByRole("heading", { name: "Discussion opened" })).toBeVisible();
  await expect(drawer.getByText("Discussion opened").first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/client-drawer-discussion-opened.png` });
});

test("status-specific actions follow the backend proposal state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page, { detail: { ...proposals[1], history: [] } });
  await page.getByRole("button", { name: "Review proposal" }).nth(1).click();
  let drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("button", { name: "Shortlist" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Open discussion" })).toBeVisible();
  await page.keyboard.press("Escape");

  await mount(page, { detail: { ...proposals[3], history: [] } });
  await page.getByRole("button", { name: "Review proposal" }).nth(3).click();
  drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Declined")).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Open discussion|Shortlist|Decline/ })).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/client-drawer-declined.png` });
});

test("an empty French workspace stays readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, { locale: "fr", quotes: [], project: { description: "Rénovation légère.", propertyType: null, surface: null, neighborhood: null, timeline: null } });

  await expect(page.getByRole("heading", { level: 2, name: "Propositions" }).last()).toBeVisible();
  await expect(page.getByText("Aucune proposition pour le moment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Afficher plus" })).toHaveCount(0);
  await expect(page.getByText("Non renseigné").first()).toBeVisible();
  // A short description must size to its content instead of stretching with the sidebar.
  const description = page.getByRole("heading", { name: "Description du projet" }).locator("..");
  expect((await description.boundingBox())?.height ?? 0).toBeLessThan(160);
  expect(await hasHorizontalOverflow(page)).toBe(false);
  if (shots) await page.screenshot({ path: `${shots}/client-mobile-fr-empty.png`, fullPage: true });
});

test("proposals and the drawer work in French on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, { locale: "fr" });

  await expect(page.getByRole("button", { name: "Voir la proposition" })).toHaveCount(4);
  expect(await hasHorizontalOverflow(page)).toBe(false);
  if (shots) await page.screenshot({ path: `${shots}/client-mobile-fr.png`, fullPage: true });

  await page.getByRole("button", { name: "Voir la proposition" }).first().click();
  const drawer = page.getByRole("dialog");
  expect((await drawer.boundingBox())?.width).toBe(375);
  await expect(drawer.getByRole("button", { name: "Ouvrir une discussion" })).toBeInViewport();
  if (shots) await page.screenshot({ path: `${shots}/client-mobile-fr-drawer.png` });
});
