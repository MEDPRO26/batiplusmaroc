import { build } from "esbuild";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

let harnessBundle = "";

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
});

async function mount(page: Page, locale: "en" | "fr") {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate((value) => { (window as Window & { __notificationLocale?: string }).__notificationLocale = value; }, locale);
  await page.addScriptTag({ content: harnessBundle });
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
