import { expect, test } from "@playwright/test";

test.describe("site assessment protected surfaces", () => {
  for (const locale of ["fr", "en"] as const) {
    test(`keeps ${locale.toUpperCase()} assessment entry points behind authentication`, async ({ page }) => {
      for (const viewport of [
        { width: 390, height: 844 },
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
      }
    });
  }
});
