import { expect, test } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import { getProvince, getRegion } from "../../lib/geography/morocco";
import { toDetailedProjectLocation } from "../../lib/geography/project-location";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Browser component checks: real Admin UI/CSS, mocked Convex, no live reads or writes.
const recorded = {
  regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل",
  localityName: `Douar ⵜⴰⵎⵍⵉⵍ ${"LongLocality".repeat(10)}`, neighborhood: "Secteur rural",
};
const location = toDetailedProjectLocation(recorded);
const cleared = toDetailedProjectLocation({ locationMode: "structured", city: "rabat" });
const address = "PRIVATE_VISIT_STREET_ADDRESS";
const project = {
  projectId: "project-1", title: "Rural project", clientName: "Client Tester", city: null,
  location, category: "renovation", customCategoryText: null, submittedAt: 1, status: "pending_review",
};
const review = {
  ...project, client: { displayName: "Client Tester" }, neighborhood: recorded.neighborhood,
  propertyType: "house", surface: null, surfaceUnknown: true, description: "Rural work.",
  timeline: "flexible", publishedAt: null, history: [],
};
const visit = {
  assessmentId: "assessment-1", projectId: "project-1", projectTitle: "Rural project",
  clientName: "Client Tester", companyName: "Atlas BTP", city: null, location,
  assessmentStatus: "scheduled", visitDate: "2026-10-12", visitTime: "10:00",
  proposedBy: "company", status: "confirmed", finalQuoteStatus: "not_available",
  riskSignal: null, sortAt: 1,
};
const detail = {
  assessmentId: "assessment-1",
  project: { title: "Rural project", city: null, location, category: "renovation", customCategoryText: null, status: "in_discussion" },
  client: { displayName: "Client Tester", accountReference: "BPM-C-TEST" },
  company: { name: "Atlas BTP", verificationStatus: "verified", slug: null },
  initialQuote: { estimatedPrice: 100_000, currency: "MAD", estimatedDuration: 30, status: "discussion_open" },
  discussion: { openedAt: 3, reference: "BPM-D-TEST", status: "active" },
  assessment: {
    status: "scheduled", invitedBy: { displayName: "Client Tester", type: "client" }, invitedAt: 4,
    acceptedAt: 5, declinedAt: null, cancelledAt: null, marketplaceAcknowledgedAt: 5,
  },
  visit: {
    proposedBy: { displayName: "Company Tester", type: "company" }, proposedAt: 5,
    proposedDate: "2026-10-12", proposedTime: "10:00", timezone: "Africa/Casablanca",
    confirmedBy: { displayName: "Client Tester", type: "client" }, confirmedAt: 6,
    siteAddress: address, status: "confirmed", cancellationReason: null,
    declinedBy: null, declinedAt: null, cancelledBy: null, cancelledAt: null,
    completedBy: null, completedAt: null,
  },
  finalQuoteStatus: "not_available", finalQuote: null, riskSignal: null, activity: [],
};
let projectsBundle = "";
let visitsBundle = "";

test.beforeAll(async () => {
  const shell = 'import { AdminShell } from "./features/admin/components/admin-shell";';
  const render = (panel: string) => `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><${panel} /></AdminShell>`;
  [projectsBundle, visitsBundle] = await Promise.all([
    buildHarness(`${shell} import { AdminProjectsPanel } from "./features/admin/components/admin-projects-panel";`, render("AdminProjectsPanel")),
    buildHarness(`${shell} import { AdminSiteVisitsPanel } from "./features/admin/components/admin-site-visits-panel";`, render("AdminSiteVisitsPanel")),
  ]);
});

test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", (route) => route.request().url().startsWith(baseURL!) ? route.continue() : route.abort());
});

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;
  const region = getRegion(recorded.regionCode)!;
  const province = getProvince(recorded.provinceCode)!;
  const administrativeLabel = `${locale === "fr" ? region.nameFr : region.nameEn} · ${locale === "fr" ? province.nameFr : province.nameEn}`;

  test(`${locale}: Admin Projects wraps rural location on mobile/desktop and opens review by keyboard`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await mountHarness(page, projectsBundle, {
      __locale: locale, __pathname: "/admin/projects",
      __queries: {
        "admin.projects.listProjects": [project, { ...project, projectId: "draft-1", title: "Unfinished project", location: cleared, status: "draft" }],
        "admin.projects.getProjectReview": review,
        "admin.projects.listProjectActivity": [],
      },
    });
    await expect(page.getByRole("heading", { name: messages.adminProjects.title, exact: true })).toBeVisible();
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const displayed = page.getByText(new RegExp(administrativeLabel.replaceAll(".", "\\."))).filter({ visible: true });
      await expect(displayed).toHaveCount(1);
      await expect(displayed).toContainText(recorded.localityName);
      await expect(page.getByText(messages.adminProjectLocation.incomplete, { exact: true }).filter({ visible: true })).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
    const openReview = page.getByRole("button", { name: messages.adminProjects.review, exact: true }).first();
    await openReview.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(administrativeLabel);
    await expect(dialog).toContainText(recorded.localityName);
    await expect(dialog.getByRole("button", { name: messages.adminProjects.approve, exact: true })).toBeVisible();
    await expect(dialog).not.toContainText(address);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${locale}-project-review-320.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as Window & { __mutationCalls?: unknown[] }).__mutationCalls ?? [])).toEqual([]);
  });

  test(`${locale}: Site Visits wraps geography and keeps the exact address inside the detail workflow`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await mountHarness(page, visitsBundle, {
      __locale: locale, __pathname: "/admin/site-visits",
      __queries: {
        "admin.siteVisits.listSiteVisits": [visit],
        "admin.siteVisits.getSiteVisitDetail": detail,
      },
    });
    const view = page.getByRole("button", { name: messages.adminSiteVisits.viewAria.replace("{project}", "Rural project"), exact: true });
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(view).toBeVisible();
      const displayed = page.getByText(new RegExp(administrativeLabel.replaceAll(".", "\\."))).filter({ visible: true });
      await expect(displayed).toHaveCount(1);
      await expect(displayed).toContainText(recorded.localityName);
      await expect(page.getByText(address, { exact: true })).toHaveCount(0);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
    await view.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(administrativeLabel);
    await expect(dialog).toContainText(recorded.localityName);
    await expect(dialog.getByText(address, { exact: true })).toBeVisible();
    await expect(dialog.getByText(messages.adminSiteVisits.fields.location, { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${locale}-visit-detail-320.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(address, { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as Window & { __mutationCalls?: unknown[] }).__mutationCalls ?? [])).toEqual([]);
  });

  test(`${locale}: legacy/incomplete visit labels and existing filter keyboard interactions remain available`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await mountHarness(page, visitsBundle, {
      __locale: locale, __pathname: "/admin/site-visits",
      __queries: { "admin.siteVisits.listSiteVisits": [
        { ...visit, city: "rabat", location: undefined },
        { ...visit, assessmentId: "assessment-2", projectTitle: "Unfinished project", city: "rabat", location: cleared },
      ] },
    });
    await expect(page.getByText(messages.projectWizard.cityOptions.rabat, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(messages.adminProjectLocation.incomplete, { exact: true }).filter({ visible: true })).toBeVisible();
    const filters = messages.adminSiteVisits.filters;
    const search = page.getByRole("searchbox", { name: filters.projectLabel, exact: true });
    const company = page.getByRole("searchbox", { name: filters.companyLabel, exact: true });
    const city = page.getByRole("combobox", { name: filters.cityLabel, exact: true });
    await search.focus();
    await page.keyboard.press("Tab");
    await expect(company).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(city).toBeFocused();
    await search.fill("Rural");
    await company.fill("Atlas");
    await city.selectOption("rabat");
    await expect(search).toHaveValue("Rural");
    await expect(company).toHaveValue("Atlas");
    await expect(city).toHaveValue("rabat");
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}
