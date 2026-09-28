import { build, type Plugin } from "esbuild";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

let harnessBundle = "";

test.beforeAll(async () => {
  const mocks: Plugin = {
    name: "project-budget-compatibility-mocks",
    setup(builder) {
      builder.onResolve({ filter: /^convex\/react$/ }, () => ({
        path: "convex-react",
        namespace: "mock",
      }));
      builder.onResolve({ filter: /^@\/i18n\/navigation$/ }, () => ({
        path: "navigation",
        namespace: "mock",
      }));
      builder.onResolve({ filter: /^@\/features\/auth\/components\/onboarding-chrome$/ }, () => ({
        path: "onboarding-chrome",
        namespace: "mock",
      }));
      builder.onResolve({ filter: /^@\/features\/shared\/components\/app-feedback$/ }, () => ({
        path: "app-feedback",
        namespace: "mock",
      }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) =>
        args.path === "convex-react"
          ? {
              loader: "jsx",
              resolveDir: process.cwd(),
              contents: `
                export function usePaginatedQuery() {
                  return { results: window.__projects, status: "Exhausted", loadMore() {} };
                }
                export function useQuery(_query, args) {
                  if (args === "skip") return undefined;
                  if (window.__surface === "wizard") {
                    return args === undefined ? window.__user : window.__wizard;
                  }
                  return args === undefined ? window.__user : window.__projectDetails;
                }
                export function useMutation() { return async () => null; }
              `,
            }
          : args.path === "onboarding-chrome"
            ? {
                loader: "jsx",
                resolveDir: process.cwd(),
                contents: `
                  import React from "react";
                  export function OnboardingChrome({ progressLabel, progressValue }) {
                    return <div aria-label={progressLabel} aria-valuenow={progressValue} role="progressbar" />;
                  }
                `,
              }
            : args.path === "app-feedback"
              ? {
                  loader: "jsx",
                  resolveDir: process.cwd(),
                  contents: `export function useToast() { return { showToast() {} }; }`,
                }
          : {
              loader: "jsx",
              resolveDir: process.cwd(),
              contents: `
                import React from "react";
                export function Link({ children, href, ...props }) {
                  const url = typeof href === "string"
                    ? href
                    : Object.entries(href.params || {}).reduce(
                        (path, [key, value]) => path.replace(\`[\${key}]\`, value),
                        href.pathname,
                      );
                  return <a href={url} {...props}>{children}</a>;
                }
                export function useRouter() { return { replace() {} }; }
              `,
            },
      );
    },
  };
  const result = await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"' },
    format: "iife",
    jsx: "automatic",
    platform: "browser",
    plugins: [mocks],
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { NextIntlClientProvider } from "next-intl";
        import { CompanyProjectMarketplace } from "./features/projects/components/company-project-marketplace";
        import { ProjectWizard } from "./features/projects/components/project-wizard";
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";
        const locale = window.__locale;
        createRoot(document.getElementById("root")).render(
          <NextIntlClientProvider
            locale={locale}
            messages={locale === "fr" ? fr : en}
            timeZone="Africa/Casablanca"
          >
            {window.__surface === "wizard" ? <ProjectWizard /> : <CompanyProjectMarketplace />}
          </NextIntlClientProvider>
        );
      `,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    write: false,
  });
  harnessBundle = result.outputFiles[0].text;
});

const noBudgetProject = {
  id: "project-no-budget",
  title: "Budget-free compatibility project",
  city: "rabat",
  primaryCategory: "renovation",
  customCategoryText: null,
  budgetRange: null,
  timeline: "one_to_three_months",
  propertyType: "apartment",
  surface: 95,
  surfaceUnknown: false,
  description: "A complete renovation project published without legacy client-budget fields.",
  publishedAt: 1_790_000_000_000,
  client: {
    displayName: "Samir C.",
    firstName: "Samir",
    lastInitial: "C",
    city: "Rabat",
    joinedAt: 1_700_000_000_000,
    projectsPostedCount: 2,
    projectsCompletedCount: 1,
    emailVerified: true,
    phoneVerified: false,
  },
};

const legacyBudgetProject = {
  ...noBudgetProject,
  id: "project-legacy-budget",
  title: "Legacy renovation compatibility project",
  budgetRange: "100000_250000",
  publishedAt: 1_790_000_100_000,
};

async function mount(page: Page, locale: "en" | "fr") {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate(
    ({ locale, projects, projectDetails }) => {
      const target = window as unknown as Record<string, unknown>;
      target.__locale = locale;
      target.__surface = "marketplace";
      target.__user = { accountType: "company", onboardingStatus: "completed" };
      target.__projects = projects;
      target.__projectDetails = {
        ...projectDetails,
        neighborhood: "Agdal",
        budgetMin: 100_000,
        budgetMax: 250_000,
        budgetUnknown: false,
        canSubmitQuote: true,
        myQuoteId: null,
      };
    },
    { locale, projects: [legacyBudgetProject, noBudgetProject], projectDetails: legacyBudgetProject },
  );
  await page.addScriptTag({ content: harnessBundle });
}

async function mountWizard(page: Page, locale: "en" | "fr") {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate((selectedLocale) => {
    const target = window as unknown as Record<string, unknown>;
    target.__locale = selectedLocale;
    target.__surface = "wizard";
    target.__user = { accountType: "client", onboardingStatus: "completed" };
    target.__wizard = {
      draft: {
        id: "project-draft",
        primaryCategory: null,
        customCategoryText: null,
        city: null,
        neighborhood: null,
        title: null,
        propertyType: null,
        surface: null,
        surfaceUnknown: false,
        description: null,
        timeline: null,
        resumeStep: 1,
        images: [],
        attachments: [],
        updatedAt: 1,
      },
      categoryOptions: ["renovation", "houseConstruction"],
      cityOptions: ["rabat", "casablanca"],
      propertyTypeOptions: ["apartment", "house"],
      timelineOptions: ["asap", "flexible"],
      limits: { maxImages: 8, maxDocuments: 6 },
    };
    window.scrollTo = () => undefined;
  }, locale);
  await page.addScriptTag({ content: harnessBundle });
}

test("current marketplace hides both missing and stored legacy Client budgets", async ({ page }) => {
  await mount(page, "en");

  await expect(page.getByRole("heading", { name: noBudgetProject.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: legacyBudgetProject.title })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Available projects" }).getByText("1–3 months", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  await expect(page.getByText("100,000–250,000 MAD", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: `View project: ${legacyBudgetProject.title}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("link", { name: "Submit a proposal" }).first()).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  await expect(page.getByText("100,000–250,000 MAD", { exact: true })).toHaveCount(0);

  await page.getByTestId("project-detail-sheet").getByRole("button", { name: "Close project details" }).click();
  await page.getByRole("button", { name: /Sort by:/ }).click();
  await expect(page.getByRole("menuitem", { name: "Most recent" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Oldest" })).toBeVisible();
  await expect(page.getByText("Highest budget", { exact: true })).toHaveCount(0);
});

test("the no-budget marketplace remains usable in French on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, "fr");

  await expect(page.getByRole("heading", { name: noBudgetProject.title })).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Filtres" }).click();
  await expect(page.getByRole("dialog", { name: "Filtres" })).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("the budget-free marketplace layout remains stable on tablet", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await mount(page, "en");
  await expect(page.getByRole("heading", { name: legacyBudgetProject.title })).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the five-step Client wizard supports Next and Back with no budget question", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mountWizard(page, "en");
  await expect(page.getByRole("progressbar", { name: "Step 1 of 5" })).toHaveAttribute("aria-valuenow", "20");
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);

  await page.getByRole("radio", { name: "Renovation" }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Where is your project?" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "What do you need done?" })).toBeVisible();
  await page.getByRole("radio", { name: "Renovation" }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("City").selectOption("rabat");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Project title").fill("Apartment renovation");
  await page.getByLabel("Property type").selectOption("apartment");
  await page.getByRole("checkbox", { name: "I don’t know the surface yet" }).check();
  await page.getByLabel("Description").fill("Complete apartment renovation with electrical and plumbing work.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "When would you like to start?" })).toBeVisible();
  await page.getByRole("radio", { name: "Flexible" }).check();
  await page.getByRole("button", { name: "Review project" }).click();

  await expect(page.getByRole("heading", { name: "Review your project" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Step 5 of 5" })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the five-step wizard copy is budget-free in French", async ({ page }) => {
  await mountWizard(page, "fr");
  await expect(page.getByRole("progressbar", { name: "Étape 1 sur 5" })).toHaveAttribute("aria-valuenow", "20");
  await expect(page.getByRole("heading", { name: "Quel type de projet souhaitez-vous réaliser ?" })).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
});
