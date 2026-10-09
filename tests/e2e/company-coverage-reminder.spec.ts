import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { buildHarness, hasHorizontalOverflow } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Real components and compiled app CSS; private reads/navigation are mocked.
// No Next server, authenticated session, backend writes or external requests.
let dashboardBundle = "";
let profileBundle = "";
let appCss = "";
const coverageRead = "companies.index.getMyGeographicCoverage";
const coverageWrite = "companies.index.updateMyGeographicCoverage";
const profile = {
  slug: "atlas-build", name: "Atlas Build", description: "Construction and renovation services in Morocco.",
  city: "Rabat", headquarters: null, headquartersPolicyVersion: null,
  phone: "0612345678", website: "", yearsExperience: 12, foundedYear: 2012, companySize: "11to50",
  languages: ["french"], services: [], serviceAreas: ["rabat", "sale"],
  serviceOptions: [], catalogServices: [], selectedServiceIds: [], serviceAreaOptions: ["rabat", "sale"],
  languageOptions: ["french"], companySizeOptions: ["11to50"], logoUrl: null, coverImageUrl: null,
  verificationStatus: "verified",
  legal: { verificationStatus: "verified", legalName: "", ice: "", rcNumber: "", legalRepresentative: "", phone: "", address: "", documents: [] },
};

test.beforeAll(async () => {
  const cssPath = path.resolve("app/globals.css");
  const [dashboard, ownerProfile, css] = await Promise.all([
    buildHarness('import { CompanyDashboard } from "./features/companies/components/company-dashboard";', "<CompanyDashboard />"),
    buildHarness(
      `import { useEffect, useState } from "react";
       import { CompanyProfileEditor } from "./features/companies/components/company-profile-editor";
       import { AppFeedback } from "./features/shared/components/app-feedback";
       function Preview() {
         const [, update] = useState(0);
         useEffect(() => {
           const refresh = () => update(value => value + 1);
           window.addEventListener("convex-harness-update", refresh);
           return () => window.removeEventListener("convex-harness-update", refresh);
         }, []);
         return <AppFeedback><CompanyProfileEditor coverageEditorRequested={window.__coverageEditorRequested} /></AppFeedback>;
       }`,
      "<Preview />",
    ),
    readFile(cssPath, "utf8").then(source => postcss([tailwind()]).process(source, { from: cssPath })),
  ]);
  dashboardBundle = dashboard;
  profileBundle = ownerProfile;
  appCss = css.css;
});

async function mount(page: Page, locale: "fr" | "en", bundle: string, requested = false) {
  await page.route("**/*", route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: '<html><body style="--font-site-sans:Arial,sans-serif"><div id="root"></div></body></html>' })
    : route.abort());
  await page.goto("http://geo-d2.test/");
  await page.addStyleTag({ content: appCss });
  await page.evaluate(values => Object.assign(window, values), {
    __locale: locale, __coverageEditorRequested: requested, __mutationCalls: [],
    __queries: {
      "users.currentUser": { _id: "owner", accountType: "company", onboardingStatus: "completed" },
      "companies.index.getOnboardingProfile": profile,
      "companies.index.getProfileManager": profile,
      "companyVerification.index.getVerificationStatus": { canManageDocuments: true, status: "verified" },
      "portfolio.index.getPortfolioManager": { projects: [] }, "serviceCatalog.listActive": [],
      [coverageRead]: [],
    },
  });
  await page.addScriptTag({ content: bundle });
}

async function updateCoverage(page: Page, keys: string[] | undefined) {
  await page.evaluate(({ key, keys }) => {
    const state = window as typeof window & { __queries: Record<string, unknown> };
    state.__queries[key] = keys;
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { key: coverageRead, keys });
}

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;
  const copy = messages.companyProfileManager.coverage;

  test(`GEO-D2 dashboard reminder, saved reads and mobile layout in ${locale}`, async ({ page }, testInfo) => {
    await mount(page, locale, dashboardBundle);
    const reminder = page.getByRole("region", { name: copy.reminder.title, exact: true });
    await expect(reminder).toBeVisible();
    await expect(reminder).toContainText(copy.reminder.discovery);
    const action = reminder.getByRole("link", { name: copy.reminder.action, exact: true });
    await expect(action).toHaveAttribute("href", "/espace-entreprise/profil?edit=coverage");
    await action.focus();
    await expect(action).toBeFocused();
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await hasHorizontalOverflow(page)).toBe(false);
      expect(await action.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await reminder.screenshot({ path: testInfo.outputPath(`reminder-${locale}-${width}.png`) });
    }
    for (const keys of [undefined, ["MA"], ["R:09"], ["P:09.541"]]) {
      await updateCoverage(page, keys);
      await expect(reminder).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Atlas Build", exact: true })).toBeVisible();
    }
    await updateCoverage(page, []);
    await expect(reminder).toBeVisible();
    expect(await page.evaluate(() => (window as typeof window & { __mutationCalls: unknown[] }).__mutationCalls)).toEqual([]);
  });

  test(`GEO-D2 existing profile dialog opens directly and saves coverage in ${locale}`, async ({ page }, testInfo) => {
    await mount(page, locale, profileBundle, true);
    const dialog = page.getByRole("dialog", { name: copy.title, exact: true });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => (window as typeof window & { __mutationCalls: unknown[] }).__mutationCalls)).toEqual([]);
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await hasHorizontalOverflow(page)).toBe(false);
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`dialog-${locale}-${width}.png`) });
    }
    await dialog.getByRole("button", { name: messages.companyProfileManager.cancel, exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __navigationCalls: unknown[] }).__navigationCalls)).toEqual([
      { method: "replace", href: "/espace-entreprise/profil" },
    ]);
    // Emulate the route delivering the cleared search parameter.
    await page.evaluate(() => {
      (window as typeof window & { __coverageEditorRequested: boolean }).__coverageEditorRequested = false;
      window.dispatchEvent(new Event("convex-harness-update"));
    });
    await expect(dialog).toHaveCount(0);
    const reminder = page.getByRole("region", { name: copy.reminder.title, exact: true });
    await expect(reminder).toBeVisible();
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
    await page.getByRole("button", { name: copy.edit, exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.evaluate(key => {
      const state = window as typeof window & {
        __queries: Record<string, unknown>;
        __mutationHandlers: Record<string, (args: { coverageScopeKeys: string[] }) => null>;
      };
      state.__mutationHandlers = { [key]: args => {
        state.__queries["companies.index.getMyGeographicCoverage"] = args.coverageScopeKeys;
        window.dispatchEvent(new Event("convex-harness-update"));
        return null;
      } };
    }, coverageWrite);
    await dialog.getByRole("checkbox", { name: new RegExp(`^${copy.allMorocco}`) }).check();
    await dialog.getByRole("button", { name: messages.companyProfileManager.save, exact: true }).click();
    await expect(dialog).toContainText(copy.success);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(reminder).toHaveCount(0);
    expect(await page.evaluate(() => (window as typeof window & { __mutationCalls: unknown[] }).__mutationCalls)).toEqual([
      { path: coverageWrite, args: { coverageScopeKeys: ["MA"] } },
    ]);
  });

  test(`GEO-D2 a failed private coverage read leaves the dashboard usable in ${locale}`, async ({ page }) => {
    await mount(page, locale, dashboardBundle);
    await expect(page.getByRole("region", { name: copy.reminder.title })).toBeVisible();
    await page.evaluate(key => {
      (window as typeof window & { __queryHandlers: Record<string, () => never> }).__queryHandlers = {
        [key]: () => { throw new Error("COMPANY_OWNER_REQUIRED"); },
      };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, coverageRead);
    await expect(page.getByRole("region", { name: copy.reminder.title })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Atlas Build", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: messages.auth.companyDashboard.feed.resultsLabel, exact: true })).toBeVisible();
  });
}
