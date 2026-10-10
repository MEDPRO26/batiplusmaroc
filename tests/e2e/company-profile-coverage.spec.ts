import { expect, test, type Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Real public components/app CSS; auth and Convex are mocked and external requests blocked.
let publicBundle = "";
test.beforeAll(async () => {
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

async function openProfile(page: Page, locale: "fr" | "en", coverageScopeKeys: string[] | undefined) {
  await mountHarness(page, publicBundle, {
    __locale: locale, __authToken: null, __queries: { "users.currentUser": null },
    __company: {
      id: "company-1", slug: "atlas-build", name: "At*** Bu***", city: "Agadir",
      headquarters: { regionCode: "09", provinceCode: "09.001" },
      description: "Construction and renovation services.", isVerified: true, invitationEligible: true,
      services: [], serviceNames: [], serviceAreas: ["rabat"], coverageScopeKeys,
      logoUrl: null, coverImageUrl: null, yearsExperience: 12, foundedYear: 2012,
      companySize: "11to50", languages: ["french"], website: null, portfolio: [], reviews: [], reviewCount: 0, rating: null,
      legal: { address: "PRIVATE-LEGAL-ADDRESS" }, headquartersCommune: "PRIVATE-COMMUNE",
    },
  });
  const messages = locale === "fr" ? fr : en;
  const heading = page.getByRole("heading", { name: messages.publicCompany.declaredCoverage, exact: true });
  await expect(heading).toBeVisible();
  return heading.locator("..");
}

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;
  const copy = messages.companyDirectory.coverage;
  const scenarios: Array<{ name: string; keys?: string[]; label: string }> = [
    { name: "national", keys: ["MA"], label: copy.national },
    { name: "region", keys: ["R:09"], label: copy.region.replace("{name}", "Souss-Massa") },
    { name: "province", keys: ["P:09.541"], label: copy.province.replace("{name}", "Taroudannt") },
    { name: "prefecture", keys: ["P:09.001"], label: copy.prefectureElided.replace("{name}", "Agadir-Ida-Ou-Tanane") },
    { name: "empty", keys: [], label: copy.notDeclared },
    { name: "legacy", label: copy.notDeclared },
    { name: "malformed", keys: ["R:99", "P:99.999"], label: copy.notDeclared },
  ];
  for (const scenario of scenarios) {
    test(`HQ3.1 public ${scenario.name} coverage in ${locale}`, async ({ page }) => {
      const section = await openProfile(page, locale, scenario.keys);
      await expect(section.getByText(scenario.label, { exact: true })).toBeVisible();
      await expect(section.locator('[data-verification="verified"]')).toHaveCount(0);
      await expect(page.getByRole("heading", { name: messages.publicCompany.serviceAreas, exact: true })).toHaveCount(0);
      expect(await page.locator("body").innerText()).not.toMatch(/PRIVATE-|R:99|P:99.999|Rabat/);
      if (scenario.name === "province") await expect(section).not.toContainText(copy.region.replace("{name}", "Souss-Massa"));
      for (const width of [320, 375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await hasHorizontalOverflow(page)).toBe(false);
        expect(await section.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
    });
  }

  test(`HQ3.1 public overlapping coverage has keyboard disclosure and responsive wrapping in ${locale}`, async ({ page }, testInfo) => {
    const section = await openProfile(page, locale, ["MA", "R:01", "P:09.541", "P:09.001"]);
    const summary = section.locator("summary");
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(section.locator("details")).toHaveAttribute("open", "");
    await expect(section.getByRole("listitem")).toHaveText([
      copy.national, copy.region.replace("{name}", "Tanger-Tétouan-Al Hoceima"),
      copy.province.replace("{name}", "Taroudannt"), copy.prefectureElided.replace("{name}", "Agadir-Ida-Ou-Tanane"),
    ]);
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await hasHorizontalOverflow(page)).toBe(false);
      expect(await section.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`coverage-${locale}-${width}.png`), fullPage: true });
    }
  });
}
