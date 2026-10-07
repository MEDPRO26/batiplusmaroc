import { expect, test } from "@playwright/test";

test.describe("site assessment protected surfaces", () => {
  for (const locale of ["fr", "en"] as const) {
    test(`anonymous ${locale.toUpperCase()} Client and Admin support URLs redirect before project data loads`, async ({ page }) => {
      const signInPath = locale === "fr" ? "connexion" : "sign-in";
      const clientPath = locale === "fr" ? "espace-client/projets" : "client/projects";
      const adminPath = locale === "fr" ? "admin/assistance" : "admin/support";
      for (const path of [`${clientPath}/not-a-project/batiplus`, `${adminPath}?projectId=not-a-project`]) {
        await page.goto(`/${locale}/${path}`);
        await expect(page).toHaveURL(new RegExp(`/${locale}/${signInPath}/?$`));
        await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
      }
    });

    test(`keeps ${locale.toUpperCase()} assessment entry points behind authentication`, async ({ page }) => {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/${locale}/messages`);
        const signInPath = locale === "fr" ? "connexion" : "sign-in";
        await expect(page).toHaveURL(new RegExp(`/${locale}/${signInPath}/?$`));
        await expect(page.locator("main")).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

        await page.goto(`/${locale}/espace-client/projets/not-a-project`);
        await expect(page).toHaveURL(new RegExp(`/${locale}/${signInPath}/?$`));

        await page.goto(`/${locale}/espace-entreprise/projets/not-a-project`);
        await expect(page).toHaveURL(new RegExp(`/${locale}/${signInPath}/?$`));

        const adminVisitPath = locale === "fr" ? "admin/visites-techniques" : "admin/site-visits";
        await page.goto(`/${locale}/${adminVisitPath}`);
        await expect(page).toHaveURL(new RegExp(`/${locale}/${signInPath}/?$`));
      }
    });
  }
});
