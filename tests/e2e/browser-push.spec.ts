import { build } from "esbuild";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

let harnessBundle = "";

test.beforeAll(async () => {
  const result = await build({
    bundle: true,
    define: {
      "process.env.NODE_ENV": '"test"',
      "process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY": '"AQIDBA"',
    },
    format: "iife",
    jsx: "automatic",
    platform: "browser",
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { NextIntlClientProvider } from "next-intl";
        import { BrowserPushDeviceFlow } from "./features/notifications/components/browser-push-device-controls";
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";

        function Harness() {
          const locale = window.__pushLocale || "en";
          return <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} timeZone="Africa/Casablanca">
            <BrowserPushDeviceFlow
              globalPushEnabled={window.__globalPushEnabled || false}
              isRegistered={async (endpoint) => window.__registeredEndpoint === endpoint}
              locale={locale}
              publicVapidKey="AQIDBA"
              registerSubscription={async (subscription) => { window.__registeredEndpoint = subscription.endpoint; }}
              unregisterSubscription={async (endpoint) => {
                window.__unregisteredEndpoint = endpoint;
                window.__registeredEndpoint = null;
              }}
              sendTestPush={async () => {
                window.__testPushCalls += 1;
                return { sent: 1, removed: 0, failed: 0 };
              }}
            />
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
  options: { locale?: "en" | "fr"; mode?: "default" | "denied" | "unsupported" } = {},
) {
  const locale = options.locale ?? "en";
  const mode = options.mode ?? "default";
  await page.setContent('<main class="mx-auto max-w-3xl p-4"><div id="root"></div></main>');
  await page.evaluate(({ locale: nextLocale, mode: nextMode }) => {
    const target = window as unknown as Record<string, unknown>;
    target.__pushLocale = nextLocale;
    target.__registeredEndpoint = null;
    target.__testPushCalls = 0;
    target.__permissionCalls = 0;
    target.__unsubscribeCalls = 0;
    target.__registerCalls = 0;
    target.__subscribeCalls = 0;
    target.__globalPushEnabled = false;

    if (nextMode === "unsupported") {
      Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
      return;
    }

    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const key = new Uint8Array([1, 2, 3, 4]).buffer;
    const subscription = {
      endpoint: "https://push.example.test/playwright-device",
      getKey: () => key,
      unsubscribe: async () => {
        target.__unsubscribeCalls = Number(target.__unsubscribeCalls) + 1;
        return true;
      },
    };
    let currentSubscription: typeof subscription | null = null;
    const pushManager = {
      getSubscription: async (): Promise<typeof subscription | null> => currentSubscription,
      subscribe: async () => {
        target.__subscribeCalls = Number(target.__subscribeCalls) + 1;
        currentSubscription = subscription;
        return subscription;
      },
    };
    const registration = { pushManager };
    let currentRegistration: typeof registration | undefined;
    const serviceWorker = {
      getRegistration: async (): Promise<typeof registration | undefined> => currentRegistration,
      register: async () => {
        target.__registerCalls = Number(target.__registerCalls) + 1;
        currentRegistration = registration;
        return registration;
      },
      ready: Promise.resolve(registration),
    };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
    Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
    const notification = {
      permission: nextMode === "denied" ? "denied" : "default",
      requestPermission: async () => {
        target.__permissionCalls = Number(target.__permissionCalls) + 1;
        notification.permission = nextMode === "denied" ? "denied" : "granted";
        return notification.permission;
      },
    };
    Object.defineProperty(window, "Notification", { configurable: true, value: notification });
  }, { locale, mode });
  await page.addScriptTag({ content: harnessBundle });
}

test("explicitly enables, tests, and disables only this browser device", async ({ page }) => {
  await mount(page);
  await expect(page.getByText("Not enabled on this device.")).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __permissionCalls?: number }).__permissionCalls)).toBe(0);

  await page.getByRole("button", { name: "Enable on this device" }).click();
  await expect(page.getByText("Enabled on this device.")).toBeVisible();
  expect(await page.evaluate(() => ({
    permission: (window as Window & { __permissionCalls?: number }).__permissionCalls,
    register: (window as Window & { __registerCalls?: number }).__registerCalls,
    subscribe: (window as Window & { __subscribeCalls?: number }).__subscribeCalls,
  }))).toEqual({ permission: 1, register: 1, subscribe: 1 });

  await page.getByRole("button", { name: "Send test notification" }).click();
  await expect(page.getByText("Test notification sent.")).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __testPushCalls?: number }).__testPushCalls)).toBe(1);

  await page.getByRole("button", { name: "Disable on this device" }).click();
  await expect(page.getByText("Not enabled on this device.")).toBeVisible();
  expect(await page.evaluate(() => ({
    endpoint: (window as Window & { __registeredEndpoint?: string | null }).__registeredEndpoint,
    removedEndpoint: (window as Window & { __unregisteredEndpoint?: string | null }).__unregisteredEndpoint,
    unsubscribe: (window as Window & { __unsubscribeCalls?: number }).__unsubscribeCalls,
  }))).toEqual({
    endpoint: null,
    removedEndpoint: "https://push.example.test/playwright-device",
    unsubscribe: 1,
  });
});

test("denied and unsupported browsers do not re-prompt or expose enable actions", async ({ page }) => {
  await mount(page, { mode: "denied" });
  await expect(page.getByText("Browser notification permission is denied.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable on this device" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __permissionCalls?: number }).__permissionCalls)).toBe(0);

  await mount(page, { mode: "unsupported" });
  await expect(page.getByText("Browser push is not supported on this device.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable on this device" })).toHaveCount(0);
});

test("French device controls remain responsive on desktop, tablet, and mobile", async ({ page }) => {
  await mount(page, { locale: "fr" });
  await expect(page.getByRole("heading", { name: "Cet appareil" })).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: "Activer sur cet appareil" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("the real service worker registers at root scope without offline caching", async ({ page }) => {
  await page.goto("/en");
  const result = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return {
      scope: registration.scope,
      cacheCount: "caches" in window ? (await caches.keys()).length : 0,
    };
  });
  expect(result.scope).toBe(new URL("/", page.url()).href);
  expect(result.cacheCount).toBe(0);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    await registration?.unregister();
  });
});
