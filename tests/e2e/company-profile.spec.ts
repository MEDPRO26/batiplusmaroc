import { expect, test } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

let profileBundle = "";
let settingsBundle = "";

test.beforeAll(async () => {
  profileBundle = await buildHarness(
    `import { CompanyProfileEditor } from "./features/companies/components/company-profile-editor";
     import { AppFeedback } from "./features/shared/components/app-feedback";`,
    `<AppFeedback><CompanyProfileEditor /></AppFeedback>`,
  );
  settingsBundle = await buildHarness(
    `import { CompanySettings } from "./features/companies/components/profile/company-settings";
     import { AppFeedback } from "./features/shared/components/app-feedback";`,
    `<AppFeedback><CompanySettings section={window.__section} /></AppFeedback>`,
  );
});

const profile = {
  slug: "atlas-build",
  name: "Atlas Build",
  description: "Residential and commercial construction across the Souss region, from structural work to finishing.",
  city: "Agadir",
  phone: "0612345678",
  website: "https://atlas.example/",
  yearsExperience: 12,
  foundedYear: 2012,
  companySize: "11to50",
  languages: ["arabic", "french"],
  serviceAreas: ["agadir", "marrakech"],
  services: ["structural", "finishing"],
  serviceOptions: Object.keys(en.companyProfileManager.serviceOptions),
  serviceAreaOptions: Object.keys(en.companyProfileManager.serviceAreaOptions),
  languageOptions: Object.keys(en.companyProfileManager.languages),
  companySizeOptions: Object.keys(en.companyProfileManager.companySize),
  logoUrl: null,
  coverImageUrl: null,
  legal: {
    verificationStatus: "verified",
    legalName: "Atlas Build SARL",
    ice: "001122334455667",
    rcNumber: "RC-123",
    legalRepresentative: "Sara El Amrani",
    phone: "0522000000",
    address: "12 avenue Hassan II, Agadir",
    documents: [{ documentType: "rc", fileName: "registre-commerce.pdf" }],
  },
};

function state(locale: "en" | "fr", extra: Record<string, unknown> = {}) {
  return {
    __locale: locale,
    __pathname: "/espace-entreprise/profil",
    __queries: {
      "users.currentUser": { accountType: "company", onboardingStatus: "completed", email: "owner@atlas.example" },
      "companies.index.getProfileManager": profile,
      "portfolio.index.getPortfolioManager": { companySlug: "atlas-build", projects: [] },
      "portfolio.index.getPublicCompanyProfile": null,
    },
    ...extra,
  };
}

test("services are edited in a focused dialog that saves only that section", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountHarness(page, profileBundle, state("en"));
  await expect(page.getByRole("heading", { name: "Atlas Build" })).toBeVisible();
  await expect(page.getByText("001122334455667")).toHaveCount(0);

  const trigger = page.getByRole("button", { name: "Edit services" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Services" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove Structural work" })).toBeVisible();

  // Escape discards and returns focus to the pencil.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("dialog").getByRole("checkbox", { name: "Plumbing" }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const calls = await page.evaluate(() => (window as unknown as { __mutationCalls: Array<{ path: string; args: Record<string, unknown> }> }).__mutationCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe("companies.index.updatePublicProfile");
  expect(calls[0].args).toEqual({
    services: ["structural", "finishing", "plumbing"],
  });
});

test("an empty required selection is blocked with the existing validation message (fr)", async ({ page }) => {
  await mountHarness(page, profileBundle, state("fr"));
  await page.getByRole("button", { name: "Modifier les langues" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Retirer Arabe" }).click();
  await dialog.getByRole("button", { name: "Retirer Français" }).click();
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(fr.companyProfileManager.validation.languages);
  expect(await page.evaluate(() => (window as unknown as { __mutationCalls?: unknown[] }).__mutationCalls ?? [])).toHaveLength(0);
});

test("settings keep legal data private to the verification section", async ({ page }) => {
  await mountHarness(page, settingsBundle, { ...state("en"), __section: "verification" });
  await expect(page.getByRole("link", { name: "Verification" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("001122334455667")).toBeVisible();
  await expect(page.getByText("registre-commerce.pdf")).toBeVisible();
  await expect(page.locator("main input")).toHaveCount(0);
});

for (const width of [375, 1024]) {
  test(`profile and settings have no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mountHarness(page, profileBundle, state("fr"));
    await expect(page.getByRole("heading", { name: "Atlas Build" })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await mountHarness(page, settingsBundle, { ...state("fr"), __section: "profile" });
    await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}
