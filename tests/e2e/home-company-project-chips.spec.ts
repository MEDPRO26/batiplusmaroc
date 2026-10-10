import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalOverflow } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Real homepage, localized router and public browse page. Keep all requests local;
// these navigation checks do not need project data or a connected Convex backend.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.routeWebSocket(url => !url.pathname.startsWith("/_next/"), socket => socket.close());
});

async function openCompanyHero(page: Page, locale: "fr" | "en") {
  const copy = (locale === "fr" ? fr : en).hero;
  await page.goto(`/${locale}`);
  const company = page.getByRole("radio", { name: copy.company, exact: true });
  await company.click();
  await expect(company).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("link", { name: copy.exploreProjects, exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: copy.searchLabel, exact: true })).toHaveCount(0);
}

async function expectProjectSearch(page: Page, locale: "fr" | "en", query?: string) {
  const path = locale === "fr" ? "/fr/projets" : "/en/browse-projects";
  await expect(page).toHaveURL(url => url.pathname.replace(/\/$/, "") === path &&
    (query === undefined ? !url.search : url.searchParams.get("q") === query && [...url.searchParams.keys()].join() === "q"), { timeout: 15_000 });
  const copy = (locale === "fr" ? fr : en).browseProjectsPage;
  await expect(page.getByRole("searchbox", { name: copy.searchLabel, exact: true })).toHaveValue(query ?? "");
  await expect(page.getByRole("heading", { name: copy.title, exact: true })).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
}

for (const locale of ["fr", "en"] as const) {
  const copy = (locale === "fr" ? fr : en).hero;

  test.describe(`GEO-D3 Company chips in ${locale} at 375px`, () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

    for (const key of ["villas", "buildings", "renovation", "fitout"] as const) {
      test(`${key} opens the existing localized project text search`, async ({ page }) => {
        await openCompanyHero(page, locale);
        expect(await hasHorizontalOverflow(page)).toBe(false);
        const chip = page.getByRole("button", { name: copy.chips[key], exact: true });
        await expect(chip).toHaveAttribute("type", "button");
        await chip.tap();
        await expectProjectSearch(page, locale, copy.chips[key]);
      });
    }

    test("Explore projects still opens unfiltered public browsing", async ({ page }) => {
      await openCompanyHero(page, locale);
      await page.getByRole("link", { name: copy.exploreProjects, exact: true }).tap();
      await expectProjectSearch(page, locale);
    });
  });

  for (const width of [375, 1280]) {
    test(`GEO-D3 Company chips support Tab, Enter and Space in ${locale} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 812 });
      await openCompanyHero(page, locale);
      const explore = page.getByRole("link", { name: copy.exploreProjects, exact: true });
      const first = page.getByRole("button", { name: copy.chips.villas, exact: true });
      await explore.focus();
      await page.keyboard.press("Tab");
      await expect(first).toBeFocused();
      await expect(first).toBeInViewport();
      await expect(first).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Enter");
      await expectProjectSearch(page, locale, copy.chips.villas);

      await openCompanyHero(page, locale);
      await page.getByRole("link", { name: copy.exploreProjects, exact: true }).focus();
      for (const key of ["villas", "buildings", "renovation", "fitout"] as const) {
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: copy.chips[key], exact: true })).toBeFocused();
      }
      const last = page.getByRole("button", { name: copy.chips.fitout, exact: true });
      await expect(last).toBeInViewport();
      await expect(last).toHaveCSS("outline-style", "solid");
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`company-chips-${locale}-${width}.png`) });
      await page.keyboard.press("Space");
      await expectProjectSearch(page, locale, copy.chips.fitout);
    });
  }
}
