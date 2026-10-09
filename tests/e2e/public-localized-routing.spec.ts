import { expect, test, type Page } from "@playwright/test";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

type Locale = "fr" | "en";
type Destination = "projects" | "companies";

function destinationPath(locale: Locale, destination: Destination) {
  return destination === "projects"
    ? locale === "fr" ? "/fr/projets/" : "/en/browse-projects/"
    : locale === "fr" ? "/fr/entreprises/" : "/en/companies/";
}

async function expectDestination(page: Page, locale: Locale, destination: Destination, query = "") {
  const messages = locale === "fr" ? fr : en;
  const copy = destination === "projects" ? messages.browseProjectsPage : messages.companyDirectory;
  const pathname = destinationPath(locale, destination);
  await expect(page).toHaveURL(url =>
    url.pathname.replace(/\/$/, "") === pathname.replace(/\/$/, "") &&
    url.searchParams.get("q") === (query || null) &&
    [...url.searchParams.keys()].length === (query ? 1 : 0),
  );
  await expect(page.locator("html")).toHaveAttribute("lang", locale === "fr" ? "fr-FR" : "en");
  await expect(page.getByRole("heading", { level: 1, name: copy.title, exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: copy.searchLabel, exact: true })).toHaveValue(query);
}

async function expectRefresh(page: Page, locale: Locale, destination: Destination, query = "") {
  const response = await page.reload();
  expect(response?.status()).toBe(200);
  expect(response?.request().redirectedFrom()).toBeNull();
  await expectDestination(page, locale, destination, query);
}

// Exercise the real Next.js server, proxy and next-intl navigation. Keep browser
// traffic local; these checks need no backend data, authenticated session or writes.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort(),
  );
  await page.routeWebSocket(url => !url.pathname.startsWith("/_next/"), socket => socket.close());
});

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;

  for (const width of [375, 1280]) {
    test.describe(`${locale} public routing at ${width}px`, () => {
      test.use({ viewport: { width, height: 812 }, hasTouch: width === 375 });

      for (const { destination, query } of [
        { destination: "projects", query: "" },
        { destination: "projects", query: "Villas" },
        { destination: "companies", query: "" },
      ] as const) {
        test(`direct ${destination}${query ? " search" : ""} navigation and refresh`, async ({ page }, testInfo) => {
          const pathname = destinationPath(locale, destination);
          const response = await page.goto(`${pathname}${query ? `?q=${query}` : ""}`);
          expect(response?.status()).toBe(200);
          expect(response?.request().redirectedFrom()).toBeNull();
          await expectDestination(page, locale, destination, query);
          await expectRefresh(page, locale, destination, query);
          if (width === 375 && (query || destination === "companies")) {
            await page.screenshot({ path: testInfo.outputPath(`${locale}-${destination}-375.png`) });
          }
        });
      }

      for (const destination of ["projects", "companies"] as const) {
        test(`navbar ${destination} link and refresh`, async ({ page }) => {
          await page.goto(`/${locale}/`);
          if (width === 375) {
            const menu = page.getByRole("button", { name: messages.common.menu, exact: true });
            await menu.tap();
            await expect(page.getByRole("button", { name: messages.common.close, exact: true }))
              .toHaveAttribute("aria-expanded", "true");
          }
          const navigation = page.getByRole("navigation", {
            name: width === 375 ? messages.nav.mobile : messages.nav.main, exact: true,
          });
          const link = navigation.getByRole("link", {
            name: destination === "projects" ? messages.nav.findProjects : messages.nav.findCompanies,
            exact: false,
          });
          await expect(link).toHaveAttribute("href", destinationPath(locale, destination));
          if (width === 375) await link.tap();
          else await link.click();
          await expectDestination(page, locale, destination);
          await expectRefresh(page, locale, destination);
        });
      }

      test("Company-mode Explore projects link and refresh", async ({ page }) => {
        await page.goto(`/${locale}/`);
        const companyMode = page.getByRole("radio", { name: messages.hero.company, exact: true });
        if (width === 375) await companyMode.tap();
        else await companyMode.click();
        const explore = page.getByRole("link", { name: messages.hero.exploreProjects, exact: true });
        await expect(explore).toHaveAttribute("href", destinationPath(locale, "projects"));
        if (width === 375) await explore.tap();
        else {
          await explore.focus();
          await expect(explore).toBeFocused();
          await explore.press("Enter");
        }
        await expectDestination(page, locale, "projects");
        await expectRefresh(page, locale, "projects");
      });
    });
  }

  test(`${locale} homepage company search preserves an encoded query on navigation and refresh`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${locale}/`);
    // Switching mode proves hydration completed before exercising router.push.
    await page.getByRole("radio", { name: messages.hero.company, exact: true }).click();
    await expect(page.getByRole("link", { name: messages.hero.exploreProjects, exact: true })).toBeVisible();
    await page.getByRole("radio", { name: messages.hero.client, exact: true }).click();
    const search = page.getByRole("searchbox", { name: messages.hero.searchLabel, exact: true });
    const query = "rénovation & piscine";
    await search.fill(`  ${query}  `);
    await search.press("Enter");
    await expectDestination(page, locale, "companies", query);
    await expectRefresh(page, locale, "companies", query);
  });

  test(`${locale} public routes accept both trailing-slash variants without redirects`, async ({ request }) => {
    for (const destination of ["projects", "companies"] as const) {
      const pathname = destinationPath(locale, destination);
      for (const path of [pathname, pathname.slice(0, -1)]) {
        const response = await request.get(`${path}?q=Villas`, { maxRedirects: 0 });
        expect(response.status(), path).toBe(200);
        expect(response.headers().location, path).toBeUndefined();
      }
    }
  });
}
