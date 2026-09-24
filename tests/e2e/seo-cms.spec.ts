import { expect, test } from "@playwright/test";

const email = process.env.SEO_E2E_EMAIL;
const password = process.env.SEO_E2E_PASSWORD;

test.describe("SEO CMS workspace", () => {
  test.skip(!email || !password, "SEO_E2E_EMAIL and SEO_E2E_PASSWORD are required");

  test.beforeEach(async ({ page }) => {
    await page.goto("/fr/connexion");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("E-mail", { exact: true }).fill(email!);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/seo\/dashboard\/?$/);
  });

  test("renders the protected FR/EN editor, media, and page metadata flows", async ({ page }) => {
    test.setTimeout(60_000);
    await expect(page.getByRole("heading", { name: "Tableau de bord SEO", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Vue d’ensemble du contenu SEO" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Navigation de l’espace SEO" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("link", { name: "Articles", exact: true }).first().click();
    await expect(page).toHaveURL(/\/fr\/seo\/articles\/?$/);
    await expect(page.getByRole("heading", { name: "Articles", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Rechercher des articles")).toBeVisible();

    await page.getByRole("link", { name: "Nouvel article", exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/seo\/articles\/nouveau\/?$/);
    await expect(page.getByRole("heading", { name: "Créer un article", level: 1 })).toBeVisible();
    await page.getByLabel("Titre", { exact: true }).fill("Aperçu Playwright");
    await page.getByLabel("Résumé", { exact: true }).fill("Validation interne de l’aperçu protégé.");
    await page.getByRole("textbox", { name: "Contenu de l’article en Markdown" }).fill("## Titre\n\nContenu de validation.");
    await expect(page.getByRole("toolbar", { name: "Mise en forme de l’article" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Titre 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gras" })).toBeVisible();
    await page.getByRole("button", { name: "Insérer une image de la médiathèque" }).click();
    await expect(page.getByRole("dialog", { name: "Choisir une image" })).toBeVisible();
    await page.getByRole("button", { name: "Fermer le sélecteur d’image" }).click();
    await page.getByRole("button", { name: "Aperçu", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Aperçu de l’article" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.goto("/fr/seo/media");
    await expect(page.getByRole("heading", { name: "Médiathèque", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Rechercher un média")).toBeVisible();
    await expect(page.getByText("Importer une image", { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/fr/seo/pages");
    await expect(page.getByRole("heading", { name: "Métadonnées des pages", level: 1 })).toBeVisible();
    await expect(page.getByText("Page d’accueil", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Modifier les métadonnées FR de Page d’accueil/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Modifier Page d’accueil" })).toBeVisible();
    await expect(page.getByLabel("Titre SEO")).toBeVisible();
    await page.getByRole("button", { name: "Fermer l’éditeur de métadonnées" }).click();

    await page.goto("/en/seo/dashboard");
    await expect(page.getByRole("heading", { name: "SEO dashboard", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "SEO Briefs", exact: true })).toBeVisible();

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/fr/seo/dashboard");
      await page.getByRole("button", { name: "Ouvrir la navigation SEO" }).click();
      await expect(page.getByRole("complementary", { name: "Navigation de l’espace SEO" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Articles", exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.getByRole("button", { name: "Fermer la navigation SEO" }).first().click();

      await page.goto("/fr/seo/media");
      await expect(page.getByRole("heading", { name: "Médiathèque", level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto("/fr/seo/pages");
      await expect(page.getByRole("heading", { name: "Métadonnées des pages", level: 1 })).toBeVisible();
      await page.getByRole("button", { name: /Modifier les métadonnées FR de Page d’accueil/ }).first().click();
      await expect(page.getByRole("dialog", { name: "Modifier Page d’accueil" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.getByRole("button", { name: "Fermer l’éditeur de métadonnées" }).click();

      await page.goto("/fr/seo/articles/nouveau");
      await expect(page.getByRole("toolbar", { name: "Mise en forme de l’article" })).toBeVisible();
      await page.getByRole("button", { name: "Insérer une image de la médiathèque" }).click();
      await expect(page.getByRole("dialog", { name: "Choisir une image" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.getByRole("button", { name: "Fermer le sélecteur d’image" }).click();
    }
  });
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
