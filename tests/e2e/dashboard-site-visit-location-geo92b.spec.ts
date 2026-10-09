import { expect, test } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import { getProvince, getRegion } from "../../lib/geography/morocco";
import { toDetailedProjectLocation, toGeneralProjectLocation } from "../../lib/geography/project-location";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Real components/CSS with mocked Convex. These checks never access a deployed backend.
const recorded = {
  regionCode: "05", provinceCode: "05.081", communeName: `Aït Tamlil — آيت تامليل ${"Commune".repeat(15)}`,
  localityName: `PRIVATE_DOUAR_ⵜⴰⵎⵍⵉⵍ_${"Locality".repeat(15)}`, neighborhood: "PRIVATE_NEIGHBORHOOD",
};
const exactAddress = `PRIVATE_VISIT_ADDRESS_آيت تامليل_${"Address".repeat(35)}`;
const base = {
  id: "project-1", title: "Rural renovation", primaryCategory: "renovation", city: null,
  timeline: "flexible", status: "published", createdAt: 1, submittedAt: 1, updatedAt: 1,
  thumbnailUrl: null, canResume: false, canView: true,
};
const owner = {
  ...base, location: toDetailedProjectLocation(recorded), neighborhood: recorded.neighborhood, customCategoryText: null,
  propertyType: "house", surface: null, surfaceUnknown: true, description: "A safe general description.",
  images: [], attachments: [], history: [], viewerRole: "owner",
};
const company = {
  ...base, location: toGeneralProjectLocation(recorded), customCategoryText: null, propertyType: "house",
  surface: null, surfaceUnknown: true, description: "A safe general description.", publishedAt: 1,
  client: null, canSubmitQuote: true, myQuoteId: null,
};
const profile = {
  firstName: "Client", lastName: "Test", initials: "CT", profilePhotoUrl: null, city: "HQ_ONLY", phone: "0600000000",
  email: "client@example.test", joinedAt: 1, projectsPostedCount: 1, projectsCompletedCount: 0,
};
const visit = {
  id: "visit-1", assessmentId: "assessment-1", projectId: base.id, clientId: "client-1", companyId: "company-1",
  conversationId: "conversation-1", initialQuoteId: "quote-1", proposedByUserId: "client-1",
  proposedDate: "2099-10-12", proposedTime: "10:00", timezone: "Africa/Casablanca", scheduledEpoch: Date.UTC(2099, 9, 12, 9),
  siteAddress: exactAddress, note: "Private directions", status: "confirmed", proposedAt: 1,
  confirmedByUserId: "company-user", confirmedAt: 2, declinedByUserId: null, declinedAt: null,
  cancelledByUserId: null, cancelledAt: null, cancellationReason: null, completedByUserId: null, completedAt: null,
  createdAt: 1, updatedAt: 2, proposals: [], canPropose: false, canConfirm: false, canDecline: false, canCancel: true, canComplete: true,
};
const assessment = {
  id: visit.assessmentId, projectId: base.id, companyId: visit.companyId, companyName: "Company BP",
  initialQuoteId: visit.initialQuoteId, conversationId: visit.conversationId, status: "accepted",
  invitedAt: 1, acceptedAt: 2, clientNote: null, companyNote: null, updatedAt: 2, visit,
};
let clientDashboardBundle = "";
let companyDashboardBundle = "";
let clientDetailBundle = "";
let companyDetailBundle = "";
let visitBundle = "";
const pageErrors: string[] = [];
test.beforeAll(async () => {
  [clientDashboardBundle, companyDashboardBundle, clientDetailBundle, companyDetailBundle, visitBundle] = await Promise.all([
    buildHarness('import { ClientDashboardView } from "./features/clients/components/client-dashboard";', '<ClientDashboardView firstName="Client" hour={10} profile={window.__profile} projects={window.__projects} />'),
    buildHarness('import { CompanyDashboard } from "./features/companies/components/company-dashboard";', '<CompanyDashboard />'),
    buildHarness('import { ClientProjectDetailsView } from "./features/projects/components/client-project-details";', '<ClientProjectDetailsView project={window.__project} />'),
    buildHarness('import { ProjectDetailsView } from "./features/projects/components/company-project-details";', '<ProjectDetailsView project={window.__project} />'),
    buildHarness('import { ProjectSiteAssessment } from "./features/site-assessments/components/site-assessment-panel";', '<main className="mx-auto max-w-[760px]"><ProjectSiteAssessment projectId="project-1" /></main>'),
  ]);
});
test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/*", route => route.request().url().startsWith(baseURL!) ? route.continue() : route.abort());
});
test.afterEach(() => { expect(pageErrors).toEqual([]); });
async function noMutation(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => (window as Window & { __mutationCalls?: unknown[] }).__mutationCalls ?? [])).toEqual([]);
}
async function widths(page: import("@playwright/test").Page) {
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await hasHorizontalOverflow(page), `page overflow at ${width}px`).toBe(false);
    const clipped = await page.locator("p, dd, header span").evaluateAll(nodes => nodes.filter(node =>
      node.textContent?.includes("CommuneCommune") && getComputedStyle(node).textOverflow !== "ellipsis" && node.scrollWidth > node.clientWidth + 1
    ).map(node => ({ text: node.textContent?.slice(0, 90), className: node.className })));
    expect(clipped, `location text overflow at ${width}px`).toEqual([]);
  }
}

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;
  const label = `${locale === "fr" ? getRegion("05")!.nameFr : getRegion("05")!.nameEn} · ${locale === "fr" ? getProvince("05.081")!.nameFr : getProvince("05.081")!.nameEn}`;
  test(`${locale}: Client dashboard keeps grid/list labels and links on mobile`, async ({ page }) => {
    await mountHarness(page, clientDashboardBundle, { __locale: locale, __profile: profile, __projects: [owner], __queries: {} });
    await expect(page.getByText(new RegExp(label)).first()).toBeVisible();
    await widths(page);
    const list = page.getByRole("button", { name: messages.clientProjects.listView, exact: true });
    await list.focus();
    await page.keyboard.press("Enter");
    await expect(list).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: messages.clientProjects.viewProject, exact: true })).toHaveAttribute("href", /project-1/);
    await widths(page);
    await expect(page.getByText(exactAddress, { exact: true })).toHaveCount(0);
    await noMutation(page);
  });
  test(`${locale}: Company dashboard wraps general geography and preserves feed pagination`, async ({ page }) => {
    await mountHarness(page, companyDashboardBundle, {
      __locale: locale, __queries: {
        "users.currentUser": { accountType: "company", onboardingStatus: "completed" },
        "companies.index.getOnboardingProfile": { name: "Company BP", description: "A complete test Company profile.", city: "HQ_ONLY",
          phone: "0600000000", logoUrl: null, services: ["renovation"], yearsExperience: 8, website: "", verificationStatus: "verified" },
      }, __paginatedQueries: { "projects.marketplace.listCompanyMarketplaceProjects": { results: [company], status: "CanLoadMore" } },
    });
    await expect(page.getByRole("article")).toContainText(label);
    await widths(page);
    await expect(page.locator("body")).not.toContainText("PRIVATE_");
    const load = page.getByRole("button", { name: messages.companyProjects.loadMore, exact: true });
    await load.click();
    expect(await page.evaluate(() => (window as Window & { __paginationCalls?: unknown[] }).__paginationCalls)).toEqual([
      { path: "projects.marketplace.listCompanyMarketplaceProjects", numItems: 8 },
    ]);
    await noMutation(page);
  });
  test(`${locale}: owning Client Project details wrap private recorded geography`, async ({ page }, testInfo) => {
    await mountHarness(page, clientDetailBundle, { __locale: locale, __project: owner, __queries: {} });
    await expect(page.getByRole("heading", { name: base.title, exact: true })).toBeVisible();
    await expect(page.locator("header")).toContainText(recorded.localityName);
    await widths(page);
    await expect(page.locator("body")).not.toContainText(exactAddress);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.screenshot({ path: testInfo.outputPath(`${locale}-client-project-320.png`) });
    await noMutation(page);
  });
  test(`${locale}: Company Project detail keeps locality and visit address gated`, async ({ page }, testInfo) => {
    await mountHarness(page, companyDetailBundle, { __locale: locale, __project: company,
      __queries: { "siteVisits.index.getForProject": { viewerType: "company", canInvite: false, assessment: null } } });
    await expect(page.getByRole("heading", { name: base.title, exact: true })).toBeVisible();
    await expect(page.locator("header")).toContainText(label);
    await widths(page);
    await expect(page.locator("body")).not.toContainText("PRIVATE_");
    await expect(page.getByRole("link", { name: messages.companyProjects.quote.submit, exact: true }).first()).toHaveAttribute("href", /project-1/);
    // Remount with the detailed projection returned only to a mutually engaged Company.
    await mountHarness(page, companyDetailBundle, { __locale: locale, __project: { ...company, location: toDetailedProjectLocation(recorded) },
      __queries: { "siteVisits.index.getForProject": { viewerType: "company", canInvite: false, assessment: null } } });
    await expect(page.locator("header")).toContainText(recorded.localityName);
    await widths(page);
    await expect(page.locator("body")).not.toContainText(exactAddress);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.screenshot({ path: testInfo.outputPath(`${locale}-company-project-320.png`) });
    await noMutation(page);
  });
  test(`${locale}: authorized visit addresses wrap for both participants and scheduling actions remain usable`, async ({ page }, testInfo) => {
    for (const viewerType of ["client", "company"] as const) {
      await mountHarness(page, visitBundle, { __locale: locale, __queries: {
        "siteVisits.index.getForProject": { viewerType, canInvite: false, assessment },
      } });
      await expect(page.getByText(exactAddress, { exact: true })).toBeVisible();
      await expect(page.getByText(messages.siteAssessment.visit.timezone, { exact: true })).toBeVisible();
      await widths(page);
      const addressNode = page.getByText(exactAddress, { exact: true });
      expect(await addressNode.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.getByRole("button", { name: messages.siteAssessment.visit.actions.cancel, exact: true }).click();
      await expect(page.getByRole("textbox", { name: messages.siteAssessment.visit.cancel.reason, exact: true })).toBeVisible();
      await page.getByRole("button", { name: messages.siteAssessment.actions.back, exact: true }).click();
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.screenshot({ path: testInfo.outputPath(`${locale}-${viewerType}-visit-320.png`) });
      await noMutation(page);
    }
  });
}
