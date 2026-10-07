import { expect, test } from "@playwright/test";
import {
  buildHarness,
  hasHorizontalOverflow,
  mountHarness,
} from "./support/component-harness";

let bundle = "";

test.beforeAll(async () => {
  bundle = await buildHarness(
    `import { CompanyNavbar } from "./components/layout/company-navbar";
     import { CompanyWork } from "./features/deals/components/company-work";`,
    `<>
       <CompanyNavbar user={{ firstName: "Sara", lastName: "Alaoui", email: "sara@example.test", onboardingStatus: "completed" }} />
       <CompanyWork view="active" />
     </>`,
  );
});

function state(locale: "en" | "fr", pathname = "/espace-entreprise/commissions") {
  return {
    __locale: locale,
    __pathname: pathname,
    __queries: {
      "users.currentUser": {
        _id: "user-sara",
        firstName: "Sara",
        lastName: "Alaoui",
        email: "sara@example.test",
        accountType: "company",
        onboardingStatus: "completed",
      },
      "companies.index.getOnboardingProfile": {
        name: "Atlas Build",
        logoUrl: null,
        publicSlug: "atlas-build",
        verificationStatus: "verified",
      },
      "companyVerification.index.getVerificationStatus": { status: "verified", canManageDocuments: true },
      "notifications.index.getMyUnreadCount": 0,
      "deals.company.listMyDeals": [
        {
          dealId: "deal-1",
          projectId: "project-1",
          projectTitle: "Villa Anfa",
          city: "casablanca",
          status: "active",
          agreedAmountMad: 395_000,
          conversationId: "conversation-1",
          createdAt: Date.UTC(2026, 8, 20),
          completedAt: null,
        },
      ],
    },
  };
}

const copy = {
  en: { findWork: "Find projects", manageWork: "Manage work", finances: "Finances", commissions: "Commissions", portfolio: "Portfolio", verified: "Verified", menu: "Open account menu" },
  fr: { findWork: "Trouver des projets", manageWork: "Gérer les projets", finances: "Finances", commissions: "Commissions", portfolio: "Portfolio", verified: "Vérifiée", menu: "Ouvrir le menu du compte" },
};

for (const locale of ["en", "fr"] as const) {
  test(`company navbar groups destinations into accessible menus (${locale})`, async ({ page }) => {
    const text = copy[locale];
    await page.setViewportSize({ width: 1440, height: 900 });
    await mountHarness(page, bundle, state(locale));
    const nav = page.getByRole("navigation", { name: locale === "en" ? "Company navigation" : "Navigation entreprise" });

    // Finances is the active section on the commissions route.
    const finances = nav.getByRole("button", { name: text.finances });
    await expect(finances).toHaveAttribute("aria-current", "true");
    await expect(nav.getByRole("button", { name: text.findWork })).not.toHaveAttribute("aria-current", "true");

    // Keyboard: open, read items, Escape closes and restores focus to the trigger.
    await finances.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: text.commissions })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(finances).toBeFocused();

    // Find projects groups acquisition and presence destinations.
    await nav.getByRole("button", { name: text.findWork }).click();
    await expect(page.getByRole("menuitem", { name: text.portfolio })).toHaveAttribute("href", "/espace-entreprise/portfolio");
    await page.keyboard.press("Escape");

    // The avatar menu is about identity and account, not marketplace pages.
    await page.getByRole("button", { name: text.menu }).click();
    const account = page.getByRole("menu");
    await expect(account.getByText("Atlas Build")).toBeVisible();
    await expect(account.getByText(text.verified)).toBeVisible();
    await expect(account.getByRole("menuitem", { name: text.commissions })).toHaveCount(0);
    await expect(account.getByRole("menuitem", { name: text.portfolio })).toHaveCount(0);
    await expect(account.locator('a[href="/entreprises/atlas-build"]')).toHaveCount(1);
  });
}

test("company work page lists won projects and links to their discussion", async ({ page }) => {
  await mountHarness(page, bundle, state("en", "/espace-entreprise/chantiers"));
  await expect(page.getByRole("heading", { name: "Active projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Villa Anfa" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open project" })).toHaveAttribute("href", "/messages/conversation-1");
  await expect(page.getByRole("button", { name: "Manage work" })).toHaveAttribute("aria-current", "true");
});

for (const width of [375, 768, 1024, 1280]) {
  test(`company navbar has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mountHarness(page, bundle, state("fr"));
    await expect(page.getByRole("heading", { name: "Projets actifs" })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    if (width < 1024) {
      await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();
      const mobile = page.locator("#role-mobile-menu");
      await expect(mobile.getByText("Gérer les projets")).toBeVisible();
      await expect(mobile.getByRole("link", { name: "Commissions" })).toHaveAttribute("aria-current", "page");
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
  });
}
