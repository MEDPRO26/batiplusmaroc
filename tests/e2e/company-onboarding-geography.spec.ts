import { expect, test, type Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import { getProvincesByRegion, getRegions } from "../../lib/geography/morocco";
import { routes } from "../../lib/routes";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Real React and app CSS; every Convex query/mutation and navigation is mocked.
const mutation = "companies.index.completeOnboarding";
const empty = { regionCode: null, provinceCode: null, communeName: null };
const saved = { regionCode: "09", provinceCode: "09.001", communeName: "Agadir Centre" };
let bundle = "";
type HarnessWindow = Window & {
  __mutationCalls?: { path: string; args: Record<string, unknown> }[];
  __mutationErrors?: Record<string, string>;
  __navigationCalls?: { method: string; href: string }[];
};
const calls = (page: Page) => page.evaluate(() => (window as HarnessWindow).__mutationCalls ?? []);

test.beforeAll(async () => {
  bundle = await buildHarness(
    'import { CompanyOnboardingForm } from "./features/companies/components/company-onboarding-form";',
    "<CompanyOnboardingForm />",
  );
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});

async function open(page: Page, locale: "fr" | "en", options: {
  contract?: "hq2-new" | "hq2-legacy" | "hq1" | "pre-hq1";
  headquarters?: typeof saved;
  error?: string;
  delay?: number;
  fallback?: boolean;
} = {}) {
  const profile: Record<string, unknown> = {
    ownerFirstName: "Ada", ownerLastName: "Build", name: "Atlas Construction", legalName: "Atlas SARL",
    phone: "0612345678", city: "Agadir", description: "Residential construction and renovation with experienced professionals.",
    website: "atlas.ma", yearsExperience: 12, publicSlug: null, logoUrl: null,
    services: ["structural"], serviceOptions: ["structural"], selectedServiceIds: ["catalog-1"],
    catalogServices: options.fallback ? [] : [{ _id: "catalog-1", slug: "structural", nameFr: "Gros œuvre", nameEn: "Structural work", isActive: true, sortOrder: 1 }],
    fallbackServices: options.fallback ? [{ slug: "structural", nameFr: "Gros œuvre", nameEn: "Structural work", sortOrder: 1 }] : [],
    onboardingStatus: "pending", verificationStatus: "draft", accountRestricted: false,
    headquarters: options.headquarters ?? empty,
    headquartersPolicyVersion: options.contract === "hq2-legacy" ? null : "structured_v1",
  };
  if (options.contract === "hq1" || options.contract === "pre-hq1") delete profile.headquartersPolicyVersion;
  if (options.contract === "pre-hq1") delete profile.headquarters;
  await mountHarness(page, bundle, {
    __locale: locale, __authToken: "mock-owner-session", __pathname: "/onboarding/company",
    __queries: {
      "users.currentUser": { _id: "owner", accountType: "company", onboardingStatus: "pending", email: "owner@hq2.test" },
      "companyVerification.index.getVerificationStatus": { status: "draft", canManageDocuments: true },
      "companies.index.getOnboardingProfile": profile,
      "companyLogos.index.getMyLogos": { submitted: null, approved: null },
    },
    __mutationErrors: options.error ? { [mutation]: options.error } : {},
    __mutationDelays: { [mutation]: options.delay ?? 0 },
  });
  const copy = locale === "fr" ? fr.auth.companyOnboarding : en.auth.companyOnboarding;
  await page.getByRole("button", { name: copy.continue, exact: true }).click();
  await expect(page.getByRole("checkbox", { name: locale === "fr" ? "Gros œuvre" : "Structural work" })).toBeChecked();
  await page.getByRole("button", { name: copy.continue, exact: true }).click();
  await expect(page.getByRole("button", { name: copy.createProfile, exact: true })).toBeVisible();
  return copy;
}

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;
  const copy = messages.auth.companyOnboarding;
  test(`${locale}: fixed Morocco, all region/province options, parent resets, optional commune`, async ({ page }) => {
    await open(page, locale);
    const region = page.getByRole("combobox", { name: copy.headquarters.region, exact: true });
    const province = page.getByRole("combobox", { name: copy.headquarters.province, exact: true });
    const country = page.getByRole("textbox", { name: copy.headquarters.country, exact: true });
    await expect(country).toHaveValue(copy.headquarters.morocco); await expect(country).toHaveAttribute("readonly", "");
    await expect(region.locator("option")).toHaveCount(13); await expect(province).toBeDisabled();
    await expect(region).toHaveAttribute("required", ""); await expect(province).toHaveAttribute("required", "");
    await expect(page.getByRole("textbox", { name: copy.headquarters.commune, exact: true })).not.toHaveAttribute("required", "");
    for (const item of getRegions()) {
      await region.selectOption(item.code);
      await expect(province).toBeEnabled(); await expect(province).toHaveValue("");
      const children = getProvincesByRegion(item.code);
      await expect(province.locator("option")).toHaveCount(children.length + 1);
      expect(await province.locator("option").evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value))).toEqual(["", ...children.map(child => child.code)]);
      await province.selectOption(children[0].code);
    }
    expect(await calls(page)).toEqual([]);
  });
  test(`${locale}: new Company cannot submit missing region, province or city; commune-free submission preserves services`, async ({ page }) => {
    await open(page, locale);
    const save = page.getByRole("button", { name: copy.createProfile, exact: true });
    const region = page.getByRole("combobox", { name: copy.headquarters.region, exact: true });
    const province = page.getByRole("combobox", { name: copy.headquarters.province, exact: true });
    await save.click();
    await expect(page.getByRole("alert")).toHaveText(messages.ux.error.codes.COMPANY_HEADQUARTERS_REGION_REQUIRED); await expect(region).toBeFocused();
    await region.selectOption("09"); await save.click();
    await expect(page.getByRole("alert")).toHaveText(messages.ux.error.codes.COMPANY_HEADQUARTERS_PROVINCE_REQUIRED); await expect(province).toBeFocused();
    await province.selectOption("09.001");
    const city = page.getByRole("textbox", { name: new RegExp(`^${copy.city}`) });
    await city.fill(""); await save.click(); await expect(city).toBeFocused(); await expect(city).toHaveAttribute("aria-invalid", "true");
    expect(await calls(page)).toEqual([]);
    await city.fill("Agadir"); await save.click();
    await expect.poll(() => calls(page)).toHaveLength(1);
    const [call] = await calls(page);
    expect(call.args.headquarters).toEqual({ ...saved, communeName: null }); expect(call.args.serviceIds).toEqual(["catalog-1"]);
    expect(call.args).not.toHaveProperty("coverageScopeKeys"); expect(call.args).not.toHaveProperty("serviceAreas"); expect(call.args).not.toHaveProperty("headquartersPolicyVersion"); expect(call.args).not.toHaveProperty("country");
    await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__navigationCalls ?? [])).toContainEqual({ method: "replace", href: routes.companyDashboard });
  });
  test(`${locale}: saved values, unrelated fields and selections survive server error and an exact retry`, async ({ page }) => {
    await open(page, locale, { headquarters: saved, error: "COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH" });
    const region = page.getByRole("combobox", { name: copy.headquarters.region, exact: true });
    const province = page.getByRole("combobox", { name: copy.headquarters.province, exact: true });
    const commune = page.getByRole("textbox", { name: copy.headquarters.commune, exact: true });
    await expect(region).toHaveValue(saved.regionCode); await expect(province).toHaveValue(saved.provinceCode); await expect(commune).toHaveValue(saved.communeName);
    await commune.fill("  Agadir  Centre  ");
    await page.getByRole("button", { name: copy.back, exact: true }).click();
    await expect(page.getByRole("checkbox")).toBeChecked();
    await page.getByRole("button", { name: copy.continue, exact: true }).click();
    await expect(commune).toHaveValue("  Agadir  Centre  ");
    await page.getByRole("button", { name: copy.createProfile, exact: true }).click();
    await expect(province).toHaveAttribute("aria-invalid", "true"); await expect(province).toBeFocused();
    await expect(page.getByRole("alert")).toHaveText(messages.ux.error.codes.COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH);
    await expect(region).toHaveValue(saved.regionCode); await expect(commune).toHaveValue("  Agadir  Centre  ");
    await expect(page.getByRole("textbox", { name: new RegExp(`^${copy.phone}`) })).toHaveValue("0612345678");
    await page.evaluate(() => { (window as HarnessWindow).__mutationErrors = {}; });
    await page.getByRole("button", { name: copy.createProfile, exact: true }).click();
    await expect.poll(() => calls(page)).toHaveLength(2);
    const [first, second] = await calls(page); expect(second.args).toEqual(first.args); expect(second.args.headquarters).toEqual(saved);
  });
  test(`${locale}: mobile layout, labels and native keyboard navigation`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, locale);
    const region = page.getByRole("combobox", { name: copy.headquarters.region, exact: true });
    const province = page.getByRole("combobox", { name: copy.headquarters.province, exact: true });
    await page.getByRole("textbox", { name: copy.headquarters.country, exact: true }).focus();
    await page.keyboard.press("Tab"); await expect(region).toBeFocused();
    // Native typeahead also works when macOS popup-menu key events are not
    // handled by the automated Chromium window.
    await page.keyboard.press("t");
    await expect(region).toHaveValue("01");
    await page.keyboard.press("Tab"); await expect(province).toBeFocused();
    await page.keyboard.press(getProvincesByRegion("01")[0].nameFr[0].toLowerCase());
    await expect(province).toHaveValue(getProvincesByRegion("01")[0].code);
    await page.keyboard.press("Tab"); await expect(page.getByRole("textbox", { name: copy.headquarters.commune, exact: true })).toBeFocused();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await page.setViewportSize({ width: 320, height: 740 }); expect(await hasHorizontalOverflow(page)).toBe(false);
    await page.setViewportSize({ width: 1280, height: 900 }); expect(await hasHorizontalOverflow(page)).toBe(false);
  });
  for (const contract of ["hq2-legacy", "hq1", "pre-hq1"] as const) {
    test(`${locale}: ${contract} retains city-only onboarding and a compatible mutation shape`, async ({ page }) => {
      await open(page, locale, { contract, fallback: true });
      const region = page.getByRole("combobox", { name: copy.headquarters.region, exact: true });
      await expect(region).not.toHaveAttribute("required", "");
      if (contract === "pre-hq1") { await expect(region).toBeDisabled(); await expect(page.getByRole("status")).toHaveText(copy.headquarters.unavailable); }
      await page.getByRole("button", { name: copy.createProfile, exact: true }).click();
      await expect.poll(() => calls(page)).toHaveLength(1);
      const [call] = await calls(page);
      expect(call.args.services).toEqual(["structural"]);
      if (contract === "pre-hq1") expect(call.args).not.toHaveProperty("headquarters");
      else expect(call.args.headquarters).toEqual(empty);
    });
  }
}

test("same-event duplicate submissions are locked and all values remain stable while saving", async ({ page }) => {
  const copy = await open(page, "en", { headquarters: saved, delay: 300 });
  await page.evaluate(() => {
    const form = document.querySelector("form");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole("button", { name: copy.saving })).toBeDisabled();
  await expect(page.getByRole("button", { name: copy.back, exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: copy.headquarters.region, exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__navigationCalls ?? [])).toContainEqual({ method: "replace", href: routes.companyDashboard });
  expect(await calls(page)).toHaveLength(1);
});
