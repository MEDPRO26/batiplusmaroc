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
        import { NotificationPreferencesView } from "./features/notifications/components/notification-preferences-view";
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";

        const defaults = {
          pushEnabled: false,
          pushCategories: {
            projects: true,
            messages: true,
            site_visits: true,
            commercial: true,
            account: true,
          },
        };

        function Harness() {
          const locale = window.__preferenceLocale || "en";
          const accountType = window.__preferenceAccountType || "client";
          const [value, setValue] = useState(defaults);
          const [saved, setSaved] = useState(false);
          return <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} timeZone="Africa/Casablanca">
            <NotificationPreferencesView
              accountType={accountType}
              dirty={JSON.stringify(value) !== JSON.stringify(defaults)}
              error={false}
              onChange={(next) => { setValue(next); setSaved(false); }}
              onSave={() => { setSaved(true); document.querySelector("output").textContent = JSON.stringify(value); }}
              saved={saved}
              saving={false}
              value={value}
            />
            <output data-testid="saved-value"></output>
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

async function mount(
  page: Page,
  locale: "en" | "fr",
  accountType: "client" | "company" | "admin" | "seo_team",
) {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate(({ locale: nextLocale, accountType: nextAccountType }) => {
    const target = window as Window & {
      __preferenceLocale?: string;
      __preferenceAccountType?: string;
      __permissionCalls?: number;
    };
    target.__preferenceLocale = nextLocale;
    target.__preferenceAccountType = nextAccountType;
    target.__permissionCalls = 0;
    if ("Notification" in window) {
      Object.defineProperty(window.Notification, "requestPermission", {
        configurable: true,
        value: () => {
          target.__permissionCalls = (target.__permissionCalls ?? 0) + 1;
          return Promise.resolve("denied");
        },
      });
    }
  }, { locale, accountType });
  await page.addScriptTag({ content: harnessBundle });
}

test("marketplace user changes and saves push preferences without a permission request", async ({ page }) => {
  await mount(page, "en", "company");
  await expect(page.getByText("Important Batiplus marketplace updates are always available", { exact: false })).toBeVisible();
  await expect(page.getByText("does not request browser permission", { exact: false })).toBeVisible();

  const master = page.getByRole("switch", { name: "Enable browser push preference" });
  const messages = page.getByRole("switch", { name: "Enable push for messages" });
  await expect(master).not.toBeChecked();
  await expect(messages).toBeDisabled();

  await master.focus();
  await master.press("Space");
  await expect(master).toBeChecked();
  await expect(messages).toBeEnabled();
  await messages.click();
  await expect(messages).not.toBeChecked();

  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences updated.")).toBeVisible();
  await expect(page.getByTestId("saved-value")).toContainText('"pushEnabled":true');
  await expect(page.getByTestId("saved-value")).toContainText('"messages":false');
  expect(await page.evaluate(() => (window as Window & { __permissionCalls?: number }).__permissionCalls)).toBe(0);
});

test("French internal-role UI stays concise and responsive", async ({ page }) => {
  await mount(page, "fr", "seo_team");
  await expect(page.getByRole("heading", { name: "Préférences de notification" })).toBeVisible();
  await expect(page.getByText("Les catégories sont masquées", { exact: false })).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(1);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("switch", { name: "Activer la préférence des notifications push" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => (window as Window & { __permissionCalls?: number }).__permissionCalls)).toBe(0);
});
