import { expect, test, type Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Real homepage/router for navigation; real directory components and matcher for
// filter/preview checks. Directory query data is mocked; no backend mutations.
let directoryBundle = "";
test.beforeAll(async () => {
  directoryBundle = await buildHarness(
    `import { CompanyDirectory } from "./features/companies/components/company-directory";
     import { explicitCoverageMatches, resolveDirectoryCoverageQuery } from "./lib/geography/directory-coverage";
     window.__paginatedQueryHandlers = {
       "companies.directory.listPublicCompanies": (args) => {
         const coverage = resolveDirectoryCoverageQuery(args.regionCode, args.provinceCode);
         const scopes = new Set(coverage.ok && coverage.active ? coverage.scopes : []);
         const results = window.__companies.filter(company =>
           coverage.ok && (!coverage.active || explicitCoverageMatches(company.coverageScopeKeys, scopes)) &&
           (!args.city || company.city.toLowerCase().includes(args.city.toLowerCase())) &&
           (!args.service || company.services.includes(args.service)) &&
           (!args.verifiedOnly || company.isVerified));
         return { results, status: window.__canLoadMore ? "CanLoadMore" : "Exhausted" };
       }
     };`,
    "<CompanyDirectory />",
  );
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.routeWebSocket(url => !url.pathname.startsWith("/_next/"), socket => socket.close());
});

const baseCompany = {
  description: "Construction and renovation services.", isVerified: true, invitationEligible: true,
  services: ["renovation"], serviceNames: [], logoUrl: null, coverImageUrl: null,
  yearsExperience: 8, portfolio: [], reviews: [], rating: null, reviewCount: 0,
  foundedYear: null, companySize: null, languages: [], website: null,
};
const companies = [
  { ...baseCompany, id: "company-a", slug: "company-a", name: "Company A", city: "Agadir", coverageScopeKeys: ["P:09.001"] },
  { ...baseCompany, id: "company-b", slug: "company-b", name: "Company B", city: "Marrakech", coverageScopeKeys: ["R:09"] },
  { ...baseCompany, id: "company-c", slug: "company-c", name: "Company C", city: "Casablanca", coverageScopeKeys: ["MA"] },
  { ...baseCompany, id: "company-d", slug: "company-d", name: "Company D", city: "Casablanca", coverageScopeKeys: ["P:06.141"] },
];

async function openDirectory(page: Page, locale: "fr" | "en", profile: Record<string, unknown> = companies[1]) {
  await mountHarness(page, directoryBundle, {
    __locale: locale, __authToken: null, __companies: companies,
    __queries: {
      "users.currentUser": null,
      "serviceCatalog.listActive": [{ _id: "renovation", slug: "renovation", nameFr: "Rénovation", nameEn: "Renovation" }],
      "portfolio.index.getPublicCompanyProfile": profile,
    },
  });
  await expect(page.getByRole("heading", { name: "Company A", exact: true })).toBeVisible();
}

async function latestDirectoryQuery(page: Page) {
  return page.evaluate(() => (window as unknown as {
    __paginatedArgs: Array<{ args: Record<string, unknown>; options: { initialNumItems: number } }>;
  }).__paginatedArgs.at(-1));
}

async function openInteractiveHero(page: Page, locale: "fr" | "en") {
  const messages = locale === "fr" ? fr : en;
  await page.goto(`/${locale}`);
  // Wait for an observable interactive state before testing client-side routing.
  await page.getByRole("radio", { name: messages.hero.company, exact: true }).click();
  await expect(page.getByRole("link", { name: messages.hero.exploreProjects, exact: true })).toBeVisible();
  await page.getByRole("radio", { name: messages.hero.client, exact: true }).click();
  await expect(page.getByRole("searchbox", { name: messages.hero.searchLabel, exact: true })).toBeVisible();
}

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;
  const copy = messages.companyDirectory;
  const directoryPath = locale === "fr" ? "/fr/entreprises" : "/en/companies";

  test(`GEO-D1 hero button opens localized company search in ${locale} at 375px`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openInteractiveHero(page, locale);
    const search = page.getByRole("searchbox", { name: messages.hero.searchLabel, exact: true });
    await expect(page.getByText(messages.hero.searchExamples, { exact: true })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await search.fill("  rénovation & piscine  ");
    await search.locator("xpath=ancestor::form").getByRole("button", { name: messages.hero.searchButton, exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname.replace(/\/$/, "") === directoryPath && url.searchParams.get("q") === "rénovation & piscine", { timeout: 15_000 });
    await expect(page.getByRole("searchbox", { name: copy.searchLabel, exact: true })).toHaveValue("rénovation & piscine");
  });

  test(`GEO-D1 hero supports chips and Enter; city keywords remain text in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openInteractiveHero(page, locale);
    const search = page.getByRole("searchbox", { name: messages.hero.searchLabel, exact: true });
    await page.getByRole("button", { name: messages.hero.chips.renovation, exact: false }).click();
    await expect(search).toHaveValue(messages.hero.chips.renovation);
    await search.fill("Agadir");
    await search.press("Enter");
    await expect(page).toHaveURL(url => url.pathname.replace(/\/$/, "") === directoryPath && url.searchParams.get("q") === "Agadir", { timeout: 15_000 });
    await page.getByRole("button", { name: copy.filters, exact: true }).click();
    const filters = page.getByRole("dialog", { name: copy.filters, exact: true });
    await expect(filters.getByRole("combobox", { name: copy.geography.regionLabel, exact: true })).toHaveValue("");
    await expect(filters.getByRole("combobox", { name: copy.geography.provinceLabel })).toBeDisabled();
    await expect(filters.getByRole("textbox", { name: copy.city.label })).toBeEmpty();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test(`GEO-D1 blank hero search browses companies and Company role keeps project navigation in ${locale}`, async ({ page }) => {
    await openInteractiveHero(page, locale);
    const search = page.getByRole("searchbox", { name: messages.hero.searchLabel, exact: true });
    await search.fill("   ");
    await search.press("Enter");
    await expect(page).toHaveURL(url => url.pathname.replace(/\/$/, "") === directoryPath && !url.search, { timeout: 15_000 });
    await openInteractiveHero(page, locale);
    await page.getByRole("radio", { name: messages.hero.company, exact: true }).click();
    const projectLink = page.getByRole("link", { name: messages.hero.exploreProjects, exact: true });
    await expect(projectLink).toHaveAttribute("href", locale === "fr" ? /^\/fr\/projets\/?$/ : /^\/en\/browse-projects\/?$/);
  });

  for (const width of [375, 1280]) {
    test(`GEO-D1 coverage filters preserve headquarters, services and pagination in ${locale} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await openDirectory(page, locale);
      if (width === 375) await page.getByRole("button", { name: copy.filters, exact: true }).click();
      const controls = width === 375 ? page.getByRole("dialog", { name: copy.filters, exact: true }) : page.locator("aside");
      const region = controls.getByRole("combobox", { name: copy.geography.regionLabel, exact: true });
      const province = controls.getByRole("combobox", { name: copy.geography.provinceLabel });
      const headquarters = controls.getByRole("textbox", { name: copy.city.label });
      await expect(controls.getByText(copy.geography.hint, { exact: true })).toBeVisible();
      await expect(province).toBeDisabled();
      expect((await region.boundingBox())!.y).toBeLessThan((await headquarters.boundingBox())!.y);
      await region.selectOption("09");
      await province.selectOption("09.001");
      const results = page.getByRole("region", { name: copy.resultsLabel });
      await expect(results.getByRole("heading", { level: 2 })).toHaveText(["Company A", "Company B", "Company C"]);
      await controls.getByRole("radio", { name: copy.service.options.renovation, exact: true }).check();
      await controls.getByRole("checkbox", { name: copy.verifiedOnly, exact: true }).check();
      await headquarters.fill("Marrakech");
      await expect.poll(() => latestDirectoryQuery(page)).toMatchObject({ args: { regionCode: "09", provinceCode: "09.001", city: "Marrakech", service: "renovation", verifiedOnly: true } });
      await expect(results.getByRole("heading", { level: 2 })).toHaveText(["Company B"]);
      await headquarters.fill("");
      await expect(results.getByRole("heading", { level: 2 })).toHaveText(["Company A", "Company B", "Company C"]);
      await region.selectOption("06");
      await expect(province).toHaveValue("");
      await expect(results.getByRole("heading", { level: 2 })).toHaveText(["Company C", "Company D"]);
      await region.selectOption("09");
      await province.selectOption("09.001");
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`filters-${locale}-${width}.png`) });
      if (width === 375) {
        await page.keyboard.press("Escape");
        await expect(controls).toHaveCount(0);
        await page.getByRole("button", { name: copy.filters, exact: true }).click();
        await expect(page.getByRole("dialog").getByRole("combobox", { name: copy.geography.provinceLabel, exact: true })).toHaveValue("09.001");
        await page.getByRole("button", { name: copy.closeFilters, exact: true }).click();
      }
      await page.evaluate(() => {
        (window as unknown as { __canLoadMore: boolean }).__canLoadMore = true;
        window.dispatchEvent(new Event("convex-harness-update"));
      });
      await page.getByRole("button", { name: copy.loadMore, exact: true }).click();
      expect(await latestDirectoryQuery(page)).toMatchObject({ args: { regionCode: "09", provinceCode: "09.001", service: "renovation", verifiedOnly: true }, options: { initialNumItems: 12 } });
      expect(await page.evaluate(() => (window as unknown as { __paginationCalls: Array<{ numItems: number }> }).__paginationCalls.at(-1))).toMatchObject({ numItems: 12 });
      if (width === 375) await page.getByRole("button", { name: copy.filters, exact: true }).click();
      await (width === 375 ? page.getByRole("dialog") : page.locator("aside")).getByRole("button", { name: copy.clear, exact: true }).click();
      await expect(results.getByRole("heading", { level: 2 })).toHaveText(companies.map(company => company.name));
      expect((await latestDirectoryQuery(page))!.args).toEqual({ verifiedOnly: false, sort: "newest" });
    });
  }

  test(`GEO-D1 quick preview separates headquarters and explicit coverage in ${locale} at 375px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openDirectory(page, locale, { ...companies[1], headquarters: { regionCode: "07", provinceCode: "07.351" }, coverageScopeKeys: ["MA", "R:09", "P:09.541", "P:09.001"] });
    await page.getByRole("heading", { name: "Company B", exact: true }).locator("xpath=ancestor::li").getByRole("button", { name: copy.viewProfile, exact: true }).click();
    const preview = page.getByRole("dialog", { name: "Company B", exact: true });
    await expect(preview.getByText(messages.publicCompany.headquartersLocation.replace("{location}", "Marrakech · Marrakech · Marrakech-Safi"), { exact: true })).toBeVisible();
    const coverage = preview.getByRole("heading", { name: messages.publicCompany.declaredCoverage, exact: true }).locator("..");
    await expect(coverage).toContainText(copy.coverage.national);
    await expect(coverage).toContainText(copy.coverage.region.replace("{name}", "Souss-Massa"));
    await coverage.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(coverage.getByRole("listitem")).toHaveText([
      copy.coverage.national, copy.coverage.region.replace("{name}", "Souss-Massa"),
      copy.coverage.province.replace("{name}", "Taroudannt"), copy.coverage.prefectureElided.replace("{name}", "Agadir-Ida-Ou-Tanane"),
    ]);
    expect(await hasHorizontalOverflow(page)).toBe(false);
    expect(await coverage.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`preview-${locale}-375.png`) });
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
  });

  for (const [name, keys] of [["empty", []], ["legacy", undefined], ["malformed", ["R:99", "P:99.999"]]] as const) {
    test(`GEO-D1 ${name} quick-preview coverage is undeclared in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await openDirectory(page, locale, { ...companies[1], coverageScopeKeys: keys, serviceAreas: ["agadir"], legal: { address: "PRIVATE-LEGAL" }, headquartersCommune: "PRIVATE-COMMUNE" });
      await page.getByRole("heading", { name: "Company B", exact: true }).locator("xpath=ancestor::li").getByRole("button", { name: copy.viewProfile, exact: true }).click();
      const preview = page.getByRole("dialog", { name: "Company B", exact: true });
      const coverage = preview.getByRole("heading", { name: messages.publicCompany.declaredCoverage, exact: true }).locator("..");
      await expect(coverage.getByText(copy.coverage.notDeclared, { exact: true })).toBeVisible();
      await expect(coverage).not.toContainText("Agadir");
      expect(await preview.innerText()).not.toMatch(/PRIVATE-|R:99|P:99.999/);
    });
  }
}

test.describe("GEO-D1 native hero fallback", () => {
  test.beforeEach(async ({ page }) => {
    // Next's streamed HTML needs its inline scripts. Block client bundles to
    // exercise the native form before React can attach its submit handler.
    await page.route("**/_next/static/chunks/**", route => new URL(route.request().url()).pathname.endsWith(".js") ? route.abort() : route.continue());
  });
  for (const locale of ["fr", "en"] as const) {
    test(`search reaches the localized directory before hydration in ${locale}`, async ({ page }) => {
      const messages = locale === "fr" ? fr : en;
      const directoryPath = locale === "fr" ? "/fr/entreprises" : "/en/companies";
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${locale}`);
      const search = page.getByRole("searchbox", { name: messages.hero.searchLabel, exact: true });
      await search.fill(" Agadir ");
      await search.locator("xpath=ancestor::form").getByRole("button", { name: messages.hero.searchButton, exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname.replace(/\/$/, "") === directoryPath && url.searchParams.get("q")?.trim() === "Agadir", { timeout: 15_000 });
      await expect(page.getByRole("searchbox", { name: messages.companyDirectory.searchLabel, exact: true })).toHaveValue("Agadir");
    });
  }
});
