import { expect, test } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

let directoryBundle = "";
let profileBundle = "";
let summariesBundle = "";

test.beforeAll(async () => {
  directoryBundle = await buildHarness(
    `import { PublicNavbar } from "./components/layout/public-navbar";
     import { CompanyDirectory } from "./features/companies/components/company-directory";`,
    `<><PublicNavbar /><CompanyDirectory /></>`,
  );
  profileBundle = await buildHarness(
    `import { PublicNavbar } from "./components/layout/public-navbar";
     import { PublicCompanyProfile } from "./features/companies/components/public-company-profile";
     import { useQuery } from "convex/react";
     import { api } from "@/convex/_generated/api";
     function ProfileHarness() {
       const company = useQuery(api.portfolio.index.getPublicCompanyProfile, { slug: "atlas-build" });
       const [content, setContent] = React.useState(null);
       React.useEffect(() => {
         let active = true;
         PublicCompanyProfile({ company }).then(content => { if (active) setContent(content); });
         return () => { active = false; };
       }, [company]);
       return <><PublicNavbar />{content}</>;
     }`,
    `<ProfileHarness />`,
  );
  summariesBundle = await buildHarness(
    `import { ClientProjectInvitations } from "./features/invitations/components/client-project-invitations";
     import { ReceivedQuoteCard } from "./features/quotes/components/client-received-quotes";`,
    `<main className="mx-auto max-w-[900px] px-4"><ClientProjectInvitations projectId="project-1" /><ReceivedQuoteCard onOpen={() => {}} quote={window.__quote} /></main>`,
  );
});

const company = {
  id: "company-1", slug: "atlas-build", name: "Atlas Build", description: "Construction and renovation across Morocco.",
  city: "Rabat", logoUrl: null, coverImageUrl: null, isVerified: true, marketplaceAvailable: true,
  services: ["renovation"], serviceNames: [], serviceAreas: ["rabat"], yearsExperience: 8,
  foundedYear: 2018, companySize: "2to10", languages: ["french"], website: null,
  rating: null, reviewCount: 0, reviews: [], portfolio: [],
};

function state(locale: "en" | "fr", isVerified: boolean) {
  const current = { ...company, isVerified };
  return {
    __locale: locale, __pathname: "/entreprises/atlas-build", __queries: {
      "users.currentUser": null,
      "portfolio.index.getPublicCompanyProfile": current,
      "serviceCatalog.listActive": [],
      "invitations.index.listProjectInvitations": [{ id: "invitation-1", companyName: current.name, isVerified, status: "pending", createdAt: 1_790_000_000_000 }],
    },
    __paginatedQueries: { "companies.directory.listPublicCompanies": { results: [current], status: "Exhausted" } },
    __quote: {
      id: "quote-1", projectId: "project-1", companyId: "company-1", status: "viewed", quoteType: "initial",
      message: "A dedicated construction team for your project.", estimatedPrice: 185_000, estimatedDuration: 75,
      currency: "MAD", availableStartDate: "2099-01-15", scope: "Construction and finishing work.",
      createdAt: 1_790_000_000_000, updatedAt: 1_790_000_000_000, submittedAt: 1_790_000_000_000, withdrawnAt: null,
      company: current,
    },
  };
}

for (const locale of ["en", "fr"] as const) {
  const copy = locale === "en" ? en : fr;
  for (const status of ["verified", "draft", "pending", "rejected"] as const) {
    test(`${locale} ${status}: consistent badges and layouts at 320px through desktop`, async ({ page }) => {
      const isVerified = status === "verified";
      await page.setViewportSize({ width: 320, height: 900 });
      await mountHarness(page, profileBundle, state(locale, isVerified));
      await expect(page.getByRole("heading", { name: company.name })).toBeVisible();
      await expect(page.locator('[data-verification="verified"]')).toHaveCount(isVerified ? 2 : 0);
      await expect(page.locator('[data-verification="unverified"]')).toHaveCount(0);
      await expect(page.getByText(copy.publicCompany.verified, { exact: true })).toHaveCount(isVerified ? 2 : 0);
      expect(await hasHorizontalOverflow(page)).toBe(false);
      const menu = page.getByRole("button", { name: copy.common.menu, exact: true });
      await menu.click();
      await expect(page.getByRole("navigation", { name: copy.nav.mobile })).toBeVisible();
      await expect(page.getByRole("navigation", { name: copy.nav.mobile }).getByRole("link", { name: copy.nav.postProject })).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await page.keyboard.press("Escape");
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await hasHorizontalOverflow(page)).toBe(false);
        await expect(page.locator('[data-navbar="public"]').getByRole("link", { name: copy.nav.postProject, exact: true })).toBeVisible({ visible: width >= 640 });
      }

      await page.setViewportSize({ width: 320, height: 900 });
      await mountHarness(page, directoryBundle, state(locale, isVerified));
      await expect(page.getByRole("heading", { name: company.name })).toBeVisible();
      await expect(page.locator('[data-verification="verified"]')).toHaveCount(isVerified ? 1 : 0);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await hasHorizontalOverflow(page)).toBe(false);
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await page.getByRole("button", { name: copy.companyDirectory.viewProfile }).click();
      await expect(page.getByRole("dialog").locator('[data-verification="verified"]')).toHaveCount(isVerified ? 1 : 0);
      expect(await hasHorizontalOverflow(page)).toBe(false);

      await mountHarness(page, summariesBundle, state(locale, isVerified));
      await expect(page.getByRole("heading", { name: copy.invitations.project.title })).toBeVisible();
      await expect(page.locator('[data-verification="verified"]')).toHaveCount(isVerified ? 2 : 0);
      await expect(page.locator('[data-verification="unverified"]')).toHaveCount(0);
      await expect(page.getByText(copy.publicCompany.verified, { exact: true })).toHaveCount(isVerified ? 2 : 0);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await hasHorizontalOverflow(page)).toBe(false);
      }
    });
  }
}
