import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

let harnessBundle = "";

test.beforeAll(async () => {
  harnessBundle = await buildHarness(
    `import { PublicProjectBrowse } from "./features/projects/components/public-project-browse";`,
    `<PublicProjectBrowse />`,
  );
});

const legacyBudgetProject = {
  id: "project-public-legacy-budget",
  title: "Published legacy-budget renovation",
  description: "A public renovation project whose stored Client budget must remain hidden.",
  city: "casablanca",
  primaryCategory: "renovation",
  budgetRange: "50000_100000",
  timeline: "one_to_three_months",
  publishedAt: 1_790_000_000_000,
  thumbnailUrl: null,
};

async function mount(page: Page, locale: "en" | "fr") {
  await mountHarness(page, harnessBundle, {
    __locale: locale,
    __queries: {
      "projects.index.listPublicProjects": [legacyBudgetProject],
      "users.currentUser": null,
    },
  });
}

test("public Project card and detail hide stored Client budget on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, "en");

  await expect(page.getByRole("heading", { name: legacyBudgetProject.title })).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  await expect(page.getByText("50,000–100,000 MAD", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: `Open project: ${legacyBudgetProject.title}` }).click();
  const preview = page.getByRole("dialog", { name: legacyBudgetProject.title });
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Budget", { exact: true })).toHaveCount(0);
  await expect(preview.getByText("50,000–100,000 MAD", { exact: true })).toHaveCount(0);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test("public Project card and detail stay budget-free in French on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, "fr");

  await expect(page.getByRole("heading", { name: legacyBudgetProject.title })).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: `Ouvrir le projet : ${legacyBudgetProject.title}` }).click();
  await expect(page.getByRole("dialog", { name: legacyBudgetProject.title })).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
