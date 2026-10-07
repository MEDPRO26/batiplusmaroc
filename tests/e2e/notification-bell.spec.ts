import { build, type Plugin } from "esbuild";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { CLIENT_SUPPORT_NOTIFICATION_TYPES } from "../../convex/notifications/constants";

let harnessBundle = "";
let integratedBellBundle = "";

// Standalone bundles do not run Next's framework transforms/router. Preserve the
// real bell while adapting its string-href footer link to a normal anchor.
const nextLinkMock: Plugin = {
  name: "notification-bell-next-link",
  setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "notification-link" }));
    builder.onLoad({ filter: /.*/, namespace: "notification-link" }, () => ({
      loader: "js",
      resolveDir: process.cwd(),
      contents: `import { createElement } from "react";
        export default function Link({ href, children, ...props }) {
          return createElement("a", { ...props, href }, children);
        }`,
    }));
  },
};

test.beforeAll(async () => {
  const result = await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"' },
    format: "iife",
    jsx: "automatic",
    platform: "browser",
    plugins: [nextLinkMock],
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
    plugins: [nextLinkMock, {
      name: "notification-bell-test-dependencies",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({ path: "convex-react", namespace: "notification-test" }));
        builder.onResolve({ filter: /^@\/i18n\/navigation$/ }, () => ({ path: "navigation", namespace: "notification-test" }));
        builder.onLoad({ filter: /.*/, namespace: "notification-test" }, ({ path }) => ({
          loader: "js",
          resolveDir: process.cwd(),
          contents: path === "convex-react" ? `
            import { useState } from "react";
            import { getFunctionName } from "convex/server";
            export function useQuery() { return window.__notificationTest.unreadCount; }
            export function usePaginatedQuery() {
              const [loaded, setLoaded] = useState(0);
              const state = window.__notificationTest;
              return {
                results: loaded < state.filteredPages ? [] : [state.notification],
                status: loaded < state.filteredPages ? "CanLoadMore" : "Exhausted",
                loadMore() { state.loadMoreCalls += 1; setLoaded((current) => current + 1); },
              };
            }
            export function useMutation(reference) { return async (args) => {
              window.__notificationTest.mutations.push({ name: getFunctionName(reference), args });
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
              "/espace-entreprise/batiplus": "/company/batiplus",
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
              if (destination.pathname === "/admin/companies/[companyId]") {
                const companies = state.locale === "en" ? "companies" : "entreprises";
                return "/" + state.locale + "/admin/" + companies + "/" + encodeURIComponent(destination.params.companyId) + "?tab=messages";
              }
              if (destination.pathname === "/admin/support") {
                return "/" + state.locale + "/admin/" + (state.locale === "fr" ? "assistance" : "support") + "?projectId=" + encodeURIComponent(destination.query.projectId);
              }
              if (destination.pathname === "/espace-client/projets/[projectId]/batiplus") {
                return "/" + state.locale + (state.locale === "en" ? "/client/projects/" : "/espace-client/projets/") + encodeURIComponent(destination.params.projectId) + "/batiplus";
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
    accountType?: "client" | "company" | "admin";
    notification?: Partial<IntegratedNotification>;
    failRead?: boolean;
    filteredPages?: number;
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
    mutations: [],
    filteredPages: options.filteredPages ?? 0,
    loadMoreCalls: 0,
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

test("operational notifications render safe previews and open role-localized destinations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountIntegratedBell(page, {
    locale: "en",
    accountType: "company",
    notification: {
      type: "admin_company_message_received",
      entity: { type: "admin_company_message", id: "message-1" },
      payload: {
        companyId: "company-atlas",
        companyName: "Atlas Build",
        messagePreview: "Please review the compliance request.",
      },
    },
  });
  await page.getByRole("button", { name: /Open notifications/ }).click();
  await expect(page.getByText("Please review the compliance request.")).toBeVisible();
  await page.getByRole("button", { name: /Unread: Batiplus sent you/ }).click();
  await expect(page).toHaveURL(/\/en\/company\/batiplus$/);

  await mountIntegratedBell(page, {
    locale: "fr",
    accountType: "admin",
    notification: {
      type: "company_admin_message_received",
      entity: { type: "admin_company_message", id: "message-2" },
      payload: {
        companyId: "company-atlas",
        companyName: "Atlas Build",
        messagePreview: "Le justificatif demandé est prêt.",
      },
    },
  });
  await page.getByRole("button", { name: /Ouvrir les notifications/ }).click();
  await expect(page.getByText("Le justificatif demandé est prêt.")).toBeVisible();
  await page.getByRole("button", { name: /Non lue.*Atlas Build/ }).click();
  await expect(page).toHaveURL(/\/fr\/admin\/entreprises\/company-atlas\?tab=messages$/);

  await mountIntegratedBell(page, {
    locale: "fr",
    accountType: "company",
    notification: {
      type: "company_reactivated",
      entity: { type: "company_operational_status", id: "status-1" },
      payload: { companyId: "company-atlas", companyName: "Atlas Build" },
    },
  });
  await page.getByRole("button", { name: /Ouvrir les notifications/ }).click();
  await page.getByRole("button", { name: /Non lue.*accès.*rétabli/ }).click();
  await expect(page).toHaveURL(/\/fr\/espace-entreprise$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const locale of ["en", "fr"] as const) {
  for (const type of CLIENT_SUPPORT_NOTIFICATION_TYPES) {
    test(`${locale} ${type} opens support directly with generic copy and independent notification reads`, async ({ page }) => {
      await page.setViewportSize(locale === "fr" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      const isReply = type === "client_support_admin_reply_received";
      await mountIntegratedBell(page, {
        locale, accountType: isReply ? "client" : "admin",
        notification: { type, entity: { type: "client_support_entry", id: "support-entry" }, payload: {}, readAt: isReply ? Date.now() : null },
      });
      await page.getByRole("button", { name: locale === "en" ? /Open notifications/ : /Ouvrir les notifications/ }).click();
      const label = (locale === "en" ? en : fr).notifications.events[type];
      const row = page.getByRole("button", { name: label, exact: isReply });
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await row.press("Enter");
      const target = isReply
        ? `/${locale}/${locale === "en" ? "client/projects" : "espace-client/projets"}/project-1/batiplus`
        : `/${locale}/admin/${locale === "fr" ? "assistance" : "support"}?projectId=project-1`;
      await expect(page).toHaveURL(new URL(target, test.info().project.use.baseURL).href);
      const mutations = await page.evaluate(() => (window as Window & { __notificationTest?: { mutations: { name: string; args: unknown }[] } }).__notificationTest!.mutations);
      expect(mutations).toEqual([{ name: "notifications/index:markNotificationRead", args: { notificationId: "notification-1" } }]);
    });
  }

  test(`${locale} already-read revoked support alert stays in the bell on failed access recheck`, async ({ page }) => {
    await mountIntegratedBell(page, { locale, failRead: true, notification: {
      type: "client_support_admin_reply_received", entity: { type: "client_support_entry", id: "support-entry" }, payload: {}, readAt: Date.now(),
    } });
    await page.getByRole("button", { name: locale === "en" ? /Open notifications/ : /Ouvrir les notifications/ }).click();
    await page.getByRole("button", { name: (locale === "en" ? en : fr).notifications.events.client_support_admin_reply_received, exact: true }).click();
    await expect(page).toHaveURL(new URL(`/${locale}`, test.info().project.use.baseURL).href);
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { __notificationTest?: { pushCalls: unknown[] } }).__notificationTest!.pushCalls)).toEqual([]);
  });
}

test("bell advances filtered empty pages without announcing an empty inbox or acknowledging reads", async ({ page }) => {
  await mountIntegratedBell(page, { filteredPages: 2, accountType: "admin", notification: {
    type: "client_support_free_help_requested", entity: { type: "client_support_entry", id: "support-entry" }, payload: {},
  } });
  await page.getByRole("button", { name: /Open notifications/ }).click();
  await expect(page.getByText(en.notifications.events.client_support_free_help_requested, { exact: true })).toBeVisible();
  const state = await page.evaluate(() => (window as Window & { __notificationTest?: { loadMoreCalls: number; mutations: unknown[] } }).__notificationTest!);
  expect(state.loadMoreCalls).toBe(2);
  expect(state.mutations).toEqual([]);
});
