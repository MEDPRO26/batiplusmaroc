import { build } from "esbuild";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

let harnessBundle = "";
let integratedBellBundle = "";

test.beforeAll(async () => {
  const result = await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"' },
    format: "iife",
    jsx: "automatic",
    platform: "browser",
    stdin: {
      contents: `
        import React, { useState } from "react";
        import { createRoot } from "react-dom/client";
        import { NextIntlClientProvider } from "next-intl";
        import { NotificationBellView } from "./features/notifications/components/notification-bell-view";
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";

        const base = {
          id: "notification-1",
          type: "proposal_received",
          entity: { type: "proposal", id: "proposal-1" },
          payload: { companyName: "Atlas Build", projectTitle: "Villa Atlas" },
          actorUserId: null,
          createdAt: Date.now() - 60_000,
          readAt: null,
        };

        function Harness() {
          const locale = window.__notificationLocale || "en";
          const [items, setItems] = useState([base]);
          const unread = items.filter((item) => item.readAt === null).length;
          const [forcedCount, setForcedCount] = useState(100);
          return <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} timeZone="Africa/Casablanca" now={new Date()}>
            <button onClick={() => { setItems((current) => [{ ...base, id: "notification-2", type: "message_received", entity: { type: "conversation", id: "conversation-1" }, payload: { actorDisplayName: "Sara", projectTitle: "Villa Atlas", messagePreview: "Updated in realtime" } }, ...current]); setForcedCount(2); }} type="button">Simulate realtime</button>
            <NotificationBellView
              error={false}
              loading={false}
              notifications={items}
              onMarkAll={() => { setItems((current) => current.map((item) => ({ ...item, readAt: Date.now() }))); setForcedCount(0); }}
              onOpen={(selected) => { setItems((current) => current.map((item) => item.id === selected.id ? { ...item, readAt: Date.now() } : item)); setForcedCount(Math.max(0, unread - 1)); document.querySelector("output").textContent = selected.id; }}
              pending={false}
              unreadCount={forcedCount}
            />
            <output data-testid="opened"></output>
          </NextIntlClientProvider>;
        }
        createRoot(document.getElementById("root")).render(<Harness />);
      `,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    write: false,
  });
  harnessBundle = result.outputFiles[0].text;

  const integrated = await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"' },
    format: "iife",
    jsx: "automatic",
    platform: "browser",
    plugins: [{
      name: "notification-bell-test-dependencies",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({ path: "convex-react", namespace: "notification-test" }));
        builder.onResolve({ filter: /^@\/i18n\/navigation$/ }, () => ({ path: "navigation", namespace: "notification-test" }));
        builder.onLoad({ filter: /.*/, namespace: "notification-test" }, ({ path }) => ({
          loader: "js",
          contents: path === "convex-react" ? `
            export function useQuery() { return window.__notificationTest.unreadCount; }
            export function usePaginatedQuery() { return { results: [window.__notificationTest.notification], status: "Exhausted" }; }
            export function useMutation() { return async (args) => {
              if (args.notificationId) {
                window.__notificationTest.markCalls += 1;
                if (window.__notificationTest.failRead) throw new Error("mark failed");
              }
              return {};
            }; }
          ` : `
            const english = {
              "/espace-client/tableau-de-bord": "/client/dashboard",
              "/espace-entreprise/projets": "/company/projects",
              "/espace-entreprise/invitations": "/company/invitations",
              "/espace-entreprise/commissions": "/company/commissions",
              "/espace-entreprise": "/company",
            };
            function destinationPath(destination) {
              const state = window.__notificationTest;
              if (typeof destination === "string") {
                const pathname = state.locale === "en" ? english[destination] || destination : destination;
                return "/" + state.locale + (pathname === "/" ? "" : pathname);
              }
              if (destination.pathname === "/messages/[conversationId]") {
                return "/" + state.locale + "/messages/" + encodeURIComponent(destination.params.conversationId);
              }
              const area = destination.pathname === "/espace-client/projets/[projectId]"
                ? state.locale === "en" ? "client" : "espace-client"
                : state.locale === "en" ? "company" : "espace-entreprise";
              const projects = state.locale === "en" ? "projects" : "projets";
              return "/" + state.locale + "/" + area + "/" + projects + "/" + encodeURIComponent(destination.params.projectId);
            }
            export function useRouter() { return { push(destination) {
              window.__notificationTest.pushCalls.push(destination);
              history.pushState({}, "", destinationPath(destination));
            } }; }
          `,
        }));
      },
    }],
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { NextIntlClientProvider } from "next-intl";
        import { NotificationBell } from "./features/notifications/components/notification-bell";
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";

        const state = window.__notificationTest;
        createRoot(document.getElementById("root")).render(
          <NextIntlClientProvider locale={state.locale} messages={state.locale === "fr" ? fr : en} timeZone="Africa/Casablanca" now={new Date()}>
            <NotificationBell accountType={state.accountType} />
          </NextIntlClientProvider>,
        );
      `,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    write: false,
  });
  integratedBellBundle = integrated.outputFiles[0].text;
});

async function mount(page: Page, locale: "en" | "fr") {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate((value) => { (window as Window & { __notificationLocale?: string }).__notificationLocale = value; }, locale);
  await page.addScriptTag({ content: harnessBundle });
}

type IntegratedNotification = {
  id: string;
  type: string;
  entity: { type: string; id: string };
  payload: Record<string, string>;
  actorUserId: null;
  createdAt: number;
  readAt: number | null;
};

async function mountIntegratedBell(
  page: Page,
  options: {
    locale?: "en" | "fr";
    accountType?: "client" | "company";
    notification?: Partial<IntegratedNotification>;
    failRead?: boolean;
  } = {},
) {
  const locale = options.locale ?? "en";
  await page.goto(`/${locale}`);
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate((value) => {
    (window as Window & { __notificationTest?: unknown }).__notificationTest = value;
  }, {
    locale,
    accountType: options.accountType ?? "client",
    unreadCount: options.notification?.readAt === undefined || options.notification.readAt === null ? 1 : 0,
    markCalls: 0,
    pushCalls: [],
    failRead: options.failRead ?? false,
    notification: {
      id: "notification-1",
      type: "proposal_received",
      entity: { type: "proposal", id: "proposal-1" },
      projectId: "project-1",
      payload: { companyName: "Atlas Build", projectTitle: "Villa Atlas" },
      actorUserId: null,
      createdAt: Date.now() - 60_000,
      readAt: null,
      ...options.notification,
    },
  });
  await page.addScriptTag({ content: integratedBellBundle });
}

test("bell, dropdown, read actions, and realtime updates work in English", async ({ page }) => {
  await mount(page, "en");
  const bell = page.getByRole("button", { name: /Open notifications/ });
  await expect(bell).toContainText("99+");
  await bell.click();
  await expect(page.getByText("Atlas Build sent a proposal for Villa Atlas.")).toBeVisible();
  await page.getByRole("button", { name: /Unread: Atlas Build/ }).click();
  await expect(page.getByTestId("opened")).toHaveText("notification-1");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open notifications" }).click();
  await expect(page.getByRole("button", { name: "Atlas Build sent a proposal for Villa Atlas." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Unread: Atlas Build/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Simulate realtime" }).click();
  await expect(bell).toContainText("2");
  await bell.click();
  await expect(page.getByText("Updated in realtime")).toBeVisible();
  await expect(page.getByRole("link", { name: "View all notifications" })).toHaveAttribute("href", "/en/notifications");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("No unread notifications")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open notifications" })).not.toContainText(/\d/);
});

test("French copy and responsive dropdown do not overflow", async ({ page }) => {
  await mount(page, "fr");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const bell = page.getByRole("button", { name: /Ouvrir les notifications/ });
    await bell.click();
    await expect(page.getByText("Atlas Build a envoyé une proposition pour Villa Atlas.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
  }
});

test("unread proposal marks read once, closes the dropdown, and opens the Client Project", async ({ page }) => {
  await mountIntegratedBell(page);
  await page.getByRole("button", { name: /Open notifications/ }).click();
  const row = page.getByRole("button", { name: /Unread: Atlas Build/ });
  await row.dblclick();
  await expect(page).toHaveURL(/\/en\/client\/projects\/project-1$/);
  await expect(page.getByText("Atlas Build sent a proposal for Villa Atlas.")).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as Window & { __notificationTest?: { markCalls: number } }).__notificationTest!.markCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as Window & { __notificationTest?: { pushCalls: unknown[] } }).__notificationTest!.pushCalls.length)).toBe(1);
});

test("an already-read proposal navigates by keyboard without a read mutation", async ({ page }) => {
  await mountIntegratedBell(page, { notification: { readAt: Date.now() } });
  await page.getByRole("button", { name: "Open notifications" }).click();
  const row = page.getByRole("button", { name: "Atlas Build sent a proposal for Villa Atlas." });
  await row.focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\/en\/client\/projects\/project-1$/);
  expect(await page.evaluate(() => (window as Window & { __notificationTest?: { markCalls: number } }).__notificationTest!.markCalls)).toBe(0);
});

test("a failed read stays put, keeps the dropdown open, and shows the safe error", async ({ page }) => {
  await mountIntegratedBell(page, { failRead: true });
  await page.getByRole("button", { name: /Open notifications/ }).click();
  await page.getByRole("button", { name: /Unread: Atlas Build/ }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Atlas Build sent a proposal for Villa Atlas.")).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __notificationTest?: { pushCalls: unknown[] } }).__notificationTest!.pushCalls)).toHaveLength(0);
});

test("FR Client and Company notification destinations remain localized and mobile-safe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountIntegratedBell(page, { locale: "fr" });
  await page.getByRole("button", { name: /Ouvrir les notifications/ }).click();
  await page.getByRole("button", { name: /Non lue.*Atlas Build/ }).press("Enter");
  await expect(page).toHaveURL(/\/fr\/espace-client\/projets\/project-1$/);

  await mountIntegratedBell(page, {
    locale: "fr",
    accountType: "company",
    notification: {
      type: "invitation_received",
      entity: { type: "invitation", id: "invitation-1" },
      payload: { projectTitle: "Villa Atlas" },
    },
  });
  await page.getByRole("button", { name: /Ouvrir les notifications/ }).click();
  await page.getByRole("button", { name: /Non lue.*Villa Atlas/ }).click();
  await expect(page).toHaveURL(/\/fr\/espace-entreprise\/invitations$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
