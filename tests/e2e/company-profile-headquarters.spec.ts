import { expect, test, type Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import { getProvincesByRegion, getRegions } from "../../lib/geography/morocco";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Real components and app CSS; Convex/auth/navigation are mocked, with no live writes.
const update = "companies.index.updatePublicProfile";
const profileQuery = "companies.index.getProfileManager";
const empty = { regionCode: null, provinceCode: null, communeName: null };
const saved = { regionCode: "09", provinceCode: "09.001", communeName: "Agadir Centre" };
let ownerBundle = "";
let publicBundle = "";
type HarnessWindow = Window & {
  __queries: Record<string, Record<string, unknown>>;
  __mutationCalls?: { path: string; args: Record<string, unknown> }[];
  __mutationErrors?: Record<string, string>;
  __mutationHandlers?: Record<string, (args: Record<string, unknown>) => unknown>;
};
const calls = (page: Page) => page.evaluate(() => (window as unknown as HarnessWindow).__mutationCalls ?? []);

const profile = {
  slug: "atlas-build", name: "Atlas Build", city: "Agadir",
  description: "Residential and commercial construction across Morocco, from structural work to finishing.",
  headquarters: saved, headquartersPolicyVersion: "structured_v1",
  phone: "0612345678", website: "", yearsExperience: 12, foundedYear: 2012, companySize: "11to50",
  languages: ["french"], serviceAreas: ["agadir"], services: ["structural"],
  selectedServiceIds: ["service-structural"],
  catalogServices: [{ _id: "service-structural", slug: "structural", nameEn: "Structural work", nameFr: "Gros œuvre", isActive: true, sortOrder: 1 }],
  serviceOptions: Object.keys(en.companyProfileManager.serviceOptions),
  serviceAreaOptions: Object.keys(en.companyProfileManager.serviceAreaOptions),
  languageOptions: Object.keys(en.companyProfileManager.languages),
  companySizeOptions: Object.keys(en.companyProfileManager.companySize), logoUrl: null, coverImageUrl: null,
  legal: { verificationStatus: "verified", legalName: "PRIVATE-LEGAL-NAME", ice: "001122334455667", rcNumber: "PRIVATE-RC", legalRepresentative: "PRIVATE-REP", phone: "0600000000", address: "PRIVATE-LEGAL-ADDRESS", documents: [] },
};

test.beforeAll(async () => {
  ownerBundle = await buildHarness(
    `import { CompanyProfileEditor } from "./features/companies/components/company-profile-editor";
     import { AppFeedback } from "./features/shared/components/app-feedback";`,
    "<AppFeedback><CompanyProfileEditor /></AppFeedback>",
  );
  publicBundle = await buildHarness(
    `import { useEffect, useState } from "react";
     import { PublicCompanyProfile } from "./features/companies/components/public-company-profile";
     function Preview() {
       const [node, setNode] = useState(null);
       useEffect(() => { PublicCompanyProfile({ company: window.__company }).then(setNode); }, []);
       return node;
     }`,
    "<Preview />",
  );
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});

async function openOwner(page: Page, locale: "fr" | "en", overrides: Record<string, unknown> = {}, error?: string) {
  await mountHarness(page, ownerBundle, {
    __locale: locale, __authToken: "mock-owner", __pathname: "/espace-entreprise/profil",
    __queries: {
      "users.currentUser": { accountType: "company", onboardingStatus: "completed" },
      "companyVerification.index.getVerificationStatus": { status: "verified", canManageDocuments: true },
      "companyLogos.index.getMyLogos": { submitted: null, approved: null },
      "companyCovers.index.getMyCovers": { submitted: null, approved: null },
      "companies.index.getMyGeographicCoverage": ["P:01.511"],
      "portfolio.index.getPortfolioManager": { companySlug: "atlas-build", projects: [] },
      [profileQuery]: { ...profile, ...overrides },
    },
    __mutationErrors: error ? { [update]: error } : {},
  });
  // Simulate the reactive owner preload after a successful mutation.
  await page.evaluate(({ update, profileQuery }) => {
    const state = window as unknown as HarnessWindow;
    state.__mutationHandlers = { [update]: args => {
      state.__queries[profileQuery] = { ...state.__queries[profileQuery], ...args };
      window.dispatchEvent(new Event("convex-harness-update"));
      return { slug: "atlas-build" };
    } };
  }, { update, profileQuery });
  const copy = (locale === "fr" ? fr : en).companyProfileManager;
  await page.getByRole("button", { name: copy.dialogs.editIdentity, exact: true }).click();
  return page.getByRole("dialog", { name: copy.dialogs.identityTitle, exact: true });
}

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;
  const copy = messages.companyProfileManager;
  const geography = messages.auth.companyOnboarding.headquarters;

  test(`${locale}: saved headquarters, localized dependent options and city stay separate from coverage`, async ({ page }) => {
    const dialog = await openOwner(page, locale);
    await expect(dialog.getByRole("textbox", { name: geography.country, exact: true })).toHaveValue(geography.morocco);
    await expect(dialog.getByRole("textbox", { name: geography.country, exact: true })).toHaveAttribute("readonly", "");
    const region = dialog.getByRole("combobox", { name: geography.region, exact: true });
    const province = dialog.getByRole("combobox", { name: geography.province, exact: true });
    await expect(region).toHaveValue(saved.regionCode);
    await expect(province).toHaveValue(saved.provinceCode);
    await expect(dialog.getByRole("textbox", { name: geography.commune, exact: true })).toHaveValue(saved.communeName);
    await expect(dialog.getByRole("textbox", { name: copy.fields.city, exact: true })).toHaveValue("Agadir");
    await expect(dialog.getByText("PRIVATE-LEGAL-ADDRESS")).toHaveCount(0);
    for (const item of getRegions()) {
      await region.selectOption(item.code);
      await expect(province).toHaveValue("");
      const children = getProvincesByRegion(item.code);
      await expect(province.locator("option")).toHaveText([geography.selectProvince, ...children.map(child => locale === "fr" ? child.nameFr : child.nameEn)]);
      await province.selectOption(children[0].code);
    }
    expect(await calls(page)).toEqual([]);
    await region.selectOption("01"); await province.selectOption("01.511");
    await dialog.getByRole("textbox", { name: geography.commune, exact: true }).fill("  Tanger  Centre  ");
    await dialog.getByRole("button", { name: copy.dialogs.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const [call] = await calls(page);
    expect(call).toEqual({ path: update, args: { name: "Atlas Build", headquarters: { regionCode: "01", provinceCode: "01.511", communeName: "Tanger Centre" } } });
    await page.getByRole("button", { name: copy.dialogs.editIdentity, exact: true }).click();
    await expect(region).toHaveValue("01"); await expect(province).toHaveValue("01.511");
    await expect(dialog.getByRole("textbox", { name: copy.fields.city, exact: true })).toHaveValue("Agadir");
    const persisted = await page.evaluate(profileQuery => (window as unknown as HarnessWindow).__queries[profileQuery], profileQuery);
    await openOwner(page, locale, persisted);
    await expect(province).toHaveValue("01.511");
    await expect(dialog.getByRole("textbox", { name: geography.commune, exact: true })).toHaveValue("Tanger Centre");
  });

  test(`${locale}: marked profiles block clearing, incomplete pairs and commune-only input`, async ({ page }) => {
    const dialog = await openOwner(page, locale);
    const region = dialog.getByRole("combobox", { name: geography.region, exact: true });
    const province = dialog.getByRole("combobox", { name: geography.province, exact: true });
    const save = dialog.getByRole("button", { name: copy.dialogs.save, exact: true });
    await expect(region).toHaveAttribute("required", ""); await expect(province).toHaveAttribute("required", "");
    await region.selectOption(""); await save.click();
    await expect(dialog.getByRole("alert")).toContainText(messages.ux.error.codes.COMPANY_HEADQUARTERS_REGION_REQUIRED);
    await region.selectOption("09"); await save.click();
    await expect(dialog.getByRole("alert")).toContainText(messages.ux.error.codes.COMPANY_HEADQUARTERS_PROVINCE_REQUIRED);
    expect(await calls(page)).toEqual([]);
    await province.selectOption("09.001");
    await dialog.getByRole("textbox", { name: geography.commune, exact: true }).fill("");
    await save.click(); await expect(dialog).toHaveCount(0);
    expect((await calls(page))[0].args.headquarters).toEqual({ ...saved, communeName: null });
  });

  test(`${locale}: legacy city-only edits and voluntary headquarters clearing stay compatible`, async ({ page }) => {
    let dialog = await openOwner(page, locale, { headquarters: empty, headquartersPolicyVersion: null });
    await expect(dialog.getByRole("combobox", { name: geography.region, exact: true })).not.toHaveAttribute("required", "");
    await expect(dialog.getByRole("combobox", { name: geography.province, exact: true })).toBeDisabled();
    await dialog.getByRole("textbox", { name: copy.fields.city, exact: true }).fill("Rabat");
    await dialog.getByRole("button", { name: copy.dialogs.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await calls(page))[0].args).toEqual({ name: "Atlas Build", city: "Rabat", headquarters: empty });
    dialog = await openOwner(page, locale, { headquartersPolicyVersion: null });
    await dialog.getByRole("combobox", { name: geography.region, exact: true }).selectOption("");
    await dialog.getByRole("textbox", { name: geography.commune, exact: true }).fill("");
    await dialog.getByRole("button", { name: copy.dialogs.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await calls(page))[0].args).toEqual({ name: "Atlas Build", headquarters: empty });
  });

  test(`${locale}: a failed server save preserves all values for an exact retry and cancel discards edits`, async ({ page }) => {
    const dialog = await openOwner(page, locale, {}, "COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH");
    const commune = dialog.getByRole("textbox", { name: geography.commune, exact: true });
    await commune.fill("Agadir Nord");
    await dialog.getByRole("button", { name: copy.dialogs.save, exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(messages.ux.error.codes.COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH);
    await expect(commune).toHaveValue("Agadir Nord");
    await expect(dialog.getByRole("combobox", { name: geography.province, exact: true })).toHaveValue("09.001");
    await page.evaluate(() => { (window as unknown as HarnessWindow).__mutationErrors = {}; });
    await dialog.getByRole("button", { name: copy.dialogs.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const [first, second] = await calls(page); expect(second).toEqual(first);
    await page.getByRole("button", { name: copy.dialogs.editIdentity, exact: true }).click();
    await commune.fill("Unsaved");
    await dialog.getByRole("button", { name: copy.cancel, exact: true }).last().click();
    await page.getByRole("button", { name: copy.dialogs.editIdentity, exact: true }).click();
    await expect(commune).toHaveValue("Agadir Nord");
  });

  test(`${locale}: owner editor labels, Tab order and mobile/desktop layouts`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const dialog = await openOwner(page, locale);
    const country = dialog.getByRole("textbox", { name: geography.country, exact: true });
    const region = dialog.getByRole("combobox", { name: geography.region, exact: true });
    const province = dialog.getByRole("combobox", { name: geography.province, exact: true });
    await country.focus(); await page.keyboard.press("Tab"); await expect(region).toBeFocused();
    await page.keyboard.press("Tab"); await expect(province).toBeFocused();
    await page.keyboard.press("Tab"); await expect(dialog.getByRole("textbox", { name: geography.commune, exact: true })).toBeFocused();
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await expect(dialog.getByRole("button", { name: copy.dialogs.save, exact: true })).toBeInViewport();
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`owner-${locale}-${width}.png`) });
    }
  });

  for (const legacy of [false, true]) {
    test(`${locale}: public ${legacy ? "legacy city" : "structured headquarters"} stays private and responsive`, async ({ page }, testInfo) => {
      await mountHarness(page, publicBundle, {
        __locale: locale, __authToken: null, __queries: { "users.currentUser": null },
        __company: {
          id: "company-1", slug: profile.slug, name: "At*** Bu***", city: profile.city,
          headquarters: legacy ? { regionCode: null, provinceCode: null } : { regionCode: "09", provinceCode: "09.001" },
          description: profile.description, isVerified: true, invitationEligible: true,
          services: [], serviceNames: [], serviceAreas: ["agadir"], logoUrl: null, coverImageUrl: null,
          yearsExperience: 12, foundedYear: 2012, companySize: "11to50", languages: ["french"], website: null,
          portfolio: [], reviews: [], reviewCount: 0, rating: null,
          legal: profile.legal, headquartersCommune: "PRIVATE-COMMUNE",
        },
      });
      const location = `${locale === "fr" ? "Siège :" : "Headquarters:"} Agadir${legacy ? "" : " · Agadir-Ida-Ou-Tanane · Souss-Massa"}`;
      await expect(page.getByText(location, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: messages.publicCompany.serviceAreas, exact: true })).toBeVisible();
      expect(await page.locator("body").innerText()).not.toMatch(/PRIVATE-LEGAL|PRIVATE-COMMUNE|001122334455667/);
      for (const width of [320, 375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await hasHorizontalOverflow(page)).toBe(false);
        await expect(page.getByText(location, { exact: true })).toBeVisible();
        if (!legacy) await page.screenshot({ path: testInfo.outputPath(`public-${locale}-${width}.png`) });
      }
    });
  }
}
