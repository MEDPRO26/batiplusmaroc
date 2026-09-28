import { build, type Plugin } from "esbuild";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

let harnessBundle = "";

test.beforeAll(async () => {
  const mocks: Plugin = {
    name: "invitation-harness-mocks",
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
          export function useQuery(_query, args) {
            if (args === "skip") return undefined;
            if (args === undefined) return window.__user;
            return args && args.companyId ? window.__projects : window.__invitations;
          }
          export function useMutation() {
            return async (args) => { window.__submission = args; };
          }
        `,
            }
          : {
              loader: "jsx",
              resolveDir: process.cwd(),
              contents: `
          import React from "react";
          export function Link({ children, href, ...props }) {
            const url = typeof href === "string" ? href : href.pathname;
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
        import { InviteCompanyButton } from "./features/invitations/components/invite-company-button";
        import { CompanyInvitations } from "./features/invitations/components/company-invitations";
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";
        const locale = window.__locale || "en";
        createRoot(document.getElementById("root")).render(
          <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} timeZone="Africa/Casablanca">
            {window.__view === "company" ? <CompanyInvitations /> : <InviteCompanyButton companyId="company-1" />}
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

async function mount(page: Page, locale: "en" | "fr", projects: unknown[]) {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate(
    ({ locale, projects }) => {
      const target = window as unknown as Record<string, unknown>;
      target.__locale = locale;
      target.__user = { accountType: "client", onboardingStatus: "completed" };
      target.__projects = projects;
      target.__invitations = [];
      target.__view = "invite";
      target.__submission = null;
    },
    { locale, projects },
  );
  await page.addScriptTag({ content: harnessBundle });
}

async function mountCompanyInvitations(
  page: Page,
  locale: "en" | "fr",
  invitations: unknown[],
) {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate(
    ({ locale, invitations }) => {
      const target = window as unknown as Record<string, unknown>;
      target.__locale = locale;
      target.__user = { accountType: "company", onboardingStatus: "completed" };
      target.__projects = [];
      target.__invitations = invitations;
      target.__view = "company";
    },
    { locale, invitations },
  );
  await page.addScriptTag({ content: harnessBundle });
}

const projects = [
  {
    id: "project-pending",
    title: "Already invited",
    city: "rabat",
    category: "renovation",
    status: "published",
    invitationId: "invitation-1",
    invitationStatus: "pending",
  },
  {
    id: "project-ready",
    title: "Villa renovation",
    city: "agadir",
    category: "renovation",
    status: "published",
    invitationId: null,
    invitationStatus: null,
  },
];

test("client selects an owned project, writes a full message, and sends the invitation", async ({
  page,
}) => {
  await mount(page, "en", projects);
  await page.getByRole("button", { name: "Invite to a project" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const selector = page.getByLabel("Choose a project");
  await expect(
    selector.locator('option[value="project-pending"]'),
  ).toHaveAttribute("disabled", "");
  await selector.selectOption("project-ready");
  const message =
    "We would like your company to review this renovation project and submit a detailed proposal.";
  await page.locator("#invitation-message").fill(message);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation sent");
  const submission = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__submission,
  );
  expect(submission).toEqual({
    companyId: "company-1",
    projectId: "project-ready",
    message,
  });
});

test("invitation dialog traps keyboard focus and restores it after Escape", async ({
  page,
}) => {
  await mount(page, "en", projects.slice(1));
  const trigger = page.getByRole("button", { name: "Invite to a project" });
  await trigger.focus();
  await trigger.press("Enter");

  const dialog = page.getByRole("dialog");
  const close = page.getByRole("button", { name: "Close invitation dialog" });
  const cancel = page.getByRole("button", { name: "Cancel" });
  await expect(dialog).toHaveAttribute(
    "aria-describedby",
    "invite-company-description",
  );
  await expect(close).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("empty project state links to project creation on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, "en", []);
  await page.getByRole("button", { name: "Invite to a project" }).click();
  await expect(
    page.getByText("You need an active project before inviting this company."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Post a project" }),
  ).toHaveAttribute("href", "/espace-client/projets/nouveau");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("French invitation controls and optional message work", async ({
  page,
}) => {
  await mount(page, "fr", projects.slice(1));
  await page.getByRole("button", { name: "Inviter à un projet" }).click();
  await page.getByLabel("Choisir un projet").selectOption("project-ready");
  await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation envoyée");
  const submission = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__submission,
  );
  expect(submission).toEqual({
    companyId: "company-1",
    projectId: "project-ready",
  });
});

test("company invitation list renders every state on desktop and remains responsive on mobile", async ({
  page,
}) => {
  const invitations = (["pending", "accepted", "declined"] as const).map(
    (status, index) => ({
      id: `invitation-${index}`,
      projectId: `project-${index}`,
      projectTitle: `Project ${index + 1}`,
      projectDescription:
        "A complete renovation project with plumbing and electrical work.",
      city: "rabat",
      category: "renovation",
      budgetRange: "100000_250000",
      companyId: "company-1",
      companyName: "Atlas Build",
      clientDisplayName: "Khadija C.",
      message: index === 0 ? "Please review this project." : null,
      status,
      createdAt: 1_790_000_000_000 + index,
      updatedAt: 1_790_000_000_000 + index,
      acceptedAt: status === "accepted" ? 1_790_000_000_100 : null,
      declinedAt: status === "declined" ? 1_790_000_000_100 : null,
    }),
  );
  await mountCompanyInvitations(page, "en", invitations);
  await expect(
    page.getByRole("heading", { name: "Project invitations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View project and submit proposal" }),
  ).toBeVisible();
  await expect(
    page.getByText("Declined", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  await expect(page.getByText("100,000–250,000 MAD", { exact: true })).toHaveCount(0);

  for (const button of await page.getByRole("button").all()) {
    await expect(button).toHaveClass(/min-h-11/);
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.setViewportSize({ width: 375, height: 812 });
  await mountCompanyInvitations(page, "fr", invitations);
  await expect(
    page.getByRole("heading", { name: "Invitations aux projets" }),
  ).toBeVisible();
  await expect(page.getByText("Budget", { exact: true })).toHaveCount(0);
  await expect(page.getByText("100 000–250 000 MAD", { exact: true })).toHaveCount(0);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
