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
                  return args === undefined ? window.__user : window.__projectDetails;
                }
              `,
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
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";
        const locale = window.__locale;
        createRoot(document.getElementById("root")).render(
          <NextIntlClientProvider
            locale={locale}
            messages={locale === "fr" ? fr : en}
            timeZone="Africa/Casablanca"
          >
            <CompanyProjectMarketplace />
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

async function mount(page: Page, locale: "en" | "fr") {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate(
    ({ locale, project }) => {
      const target = window as unknown as Record<string, unknown>;
      target.__locale = locale;
      target.__user = { accountType: "company", onboardingStatus: "completed" };
      target.__projects = [project];
      target.__projectDetails = {
        ...project,
        neighborhood: "Agdal",
        budgetMin: null,
        budgetMax: null,
        budgetUnknown: null,
        canSubmitQuote: true,
        myQuoteId: null,
      };
    },
    { locale, project: noBudgetProject },
  );
  await page.addScriptTag({ content: harnessBundle });
}

test("a company can browse and open a Project with no legacy budget", async ({ page }) => {
  await mount(page, "en");

  await expect(page.getByRole("heading", { name: noBudgetProject.title })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Available projects" }).getByText("1–3 months", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/budgetOptions\.null/)).toHaveCount(0);

  await page.getByRole("button", { name: `View project: ${noBudgetProject.title}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("link", { name: "Send an initial quote" }).first()).toBeVisible();
  await expect(page.getByText(/budgetOptions\.null/)).toHaveCount(0);
});

test("the no-budget marketplace remains usable in French on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, "fr");

  await expect(page.getByRole("heading", { name: noBudgetProject.title })).toBeVisible();
  await expect(page.getByText(/budgetOptions\.null/)).toHaveCount(0);
  await page.getByRole("button", { name: "Filtres" }).click();
  await expect(page.getByRole("dialog", { name: "Filtres" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
