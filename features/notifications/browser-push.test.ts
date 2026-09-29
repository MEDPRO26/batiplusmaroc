// @vitest-environment node

import { build } from "esbuild";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  detachBrowserPushBeforeSignOut,
  disableBrowserPush,
  enableBrowserPush,
  inspectBrowserPush,
  reconcileExistingBrowserPushLocale,
} from "./lib/browser-push";

function installBrowser({
  permission,
  requestResult = permission,
  existing = null,
}: {
  permission: NotificationPermission;
  requestResult?: NotificationPermission;
  existing?: PushSubscription | null;
}) {
  const subscription = existing ?? {
    endpoint: "https://push.example.test/device",
    getKey: (name: PushEncryptionKeyName) => new Uint8Array(
      name === "p256dh" ? [1, 2, 3, 4] : [5, 6, 7, 8],
    ).buffer,
    unsubscribe: vi.fn(async () => true),
  } as unknown as PushSubscription;
  const subscribe = vi.fn(async () => subscription);
  const pushManager = {
    getSubscription: vi.fn(async () => existing),
    subscribe,
  };
  const registration = { pushManager } as unknown as ServiceWorkerRegistration;
  const register = vi.fn(async () => registration);
  const getRegistration = vi.fn(async () => existing ? registration : undefined);
  const requestPermission = vi.fn(async () => requestResult);
  const notification = { permission, requestPermission };

  vi.stubGlobal("window", {
    isSecureContext: true,
    Notification: notification,
    PushManager: class PushManager {},
    atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
    btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
  });
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration,
      register,
      ready: Promise.resolve(registration),
    },
  });
  return { subscription, subscribe, register, getRegistration, requestPermission };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser push API", () => {
  test("reports unsupported without requesting permission", async () => {
    vi.stubGlobal("window", { isSecureContext: false });
    vi.stubGlobal("navigator", {});
    await expect(inspectBrowserPush()).resolves.toEqual({
      supported: false,
      permission: "unsupported",
      subscription: null,
    });
  });

  test("requests default permission only after enable and creates a subscription", async () => {
    const browser = installBrowser({ permission: "default", requestResult: "granted" });
    await expect(inspectBrowserPush()).resolves.toMatchObject({
      supported: true,
      permission: "default",
      subscription: null,
    });
    expect(browser.requestPermission).not.toHaveBeenCalled();

    const enabled = await enableBrowserPush("AQIDBA");
    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.register).toHaveBeenCalledWith("/push-sw.js", { scope: "/" });
    expect(browser.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(ArrayBuffer),
    });
    expect(enabled).toEqual({
      endpoint: "https://push.example.test/device",
      p256dh: "AQIDBA",
      auth: "BQYHCA",
    });
  });

  test("reuses a granted existing subscription without another prompt", async () => {
    const current = {
      endpoint: "https://push.example.test/existing",
      getKey: (name: PushEncryptionKeyName) => new Uint8Array(
        name === "p256dh" ? [1, 2, 3, 4] : [5, 6, 7, 8],
      ).buffer,
      unsubscribe: vi.fn(async () => true),
    } as unknown as PushSubscription;
    const browser = installBrowser({ permission: "granted", existing: current });
    await expect(enableBrowserPush("AQIDBA")).resolves.toMatchObject({
      endpoint: current.endpoint,
    });
    expect(browser.requestPermission).not.toHaveBeenCalled();
    expect(browser.subscribe).not.toHaveBeenCalled();
  });

  test("silently reconciles an existing subscription with the active English locale", async () => {
    const current = {
      endpoint: "https://push.example.test/legacy-english-device",
      getKey: (name: PushEncryptionKeyName) => new Uint8Array(
        name === "p256dh" ? [1, 2, 3, 4] : [5, 6, 7, 8],
      ).buffer,
      unsubscribe: vi.fn(async () => true),
    } as unknown as PushSubscription;
    const browser = installBrowser({ permission: "granted", existing: current });
    const registerSubscription = vi.fn(async () => undefined);

    await expect(reconcileExistingBrowserPushLocale("en", registerSubscription))
      .resolves.toBe(true);
    expect(registerSubscription).toHaveBeenCalledWith({
      endpoint: current.endpoint,
      p256dh: "AQIDBA",
      auth: "BQYHCA",
      locale: "en",
    });
    expect(browser.requestPermission).not.toHaveBeenCalled();
    expect(browser.register).not.toHaveBeenCalled();
    expect(browser.subscribe).not.toHaveBeenCalled();
  });

  test("does not create or register a subscription during passive locale reconciliation", async () => {
    const browser = installBrowser({ permission: "default" });
    const registerSubscription = vi.fn(async () => undefined);

    await expect(reconcileExistingBrowserPushLocale("en", registerSubscription))
      .resolves.toBe(false);
    expect(registerSubscription).not.toHaveBeenCalled();
    expect(browser.requestPermission).not.toHaveBeenCalled();
    expect(browser.register).not.toHaveBeenCalled();
    expect(browser.subscribe).not.toHaveBeenCalled();
  });

  test("stops after denial and does not register a service worker", async () => {
    const browser = installBrowser({ permission: "default", requestResult: "denied" });
    await expect(enableBrowserPush("AQIDBA")).rejects.toThrow("PUSH_PERMISSION_DENIED");
    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.register).not.toHaveBeenCalled();
  });

  test("unsubscribes only the current browser subscription", async () => {
    const current = {
      endpoint: "https://push.example.test/current",
      getKey: (name: PushEncryptionKeyName) => new Uint8Array(
        name === "p256dh" ? [1, 2, 3, 4] : [5, 6, 7, 8],
      ).buffer,
      unsubscribe: vi.fn(async () => true),
    } as unknown as PushSubscription;
    installBrowser({ permission: "granted", existing: current });
    await expect(disableBrowserPush()).resolves.toMatchObject({ endpoint: current.endpoint });
    expect(current.unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("removes the authenticated binding before unsubscribing on sign-out", async () => {
    const events: string[] = [];
    const current = {
      endpoint: "https://push.example.test/sign-out",
      getKey: (name: PushEncryptionKeyName) => new Uint8Array(
        name === "p256dh" ? [1, 2, 3, 4] : [5, 6, 7, 8],
      ).buffer,
      unsubscribe: vi.fn(async () => {
        events.push("browser");
        return true;
      }),
    } as unknown as PushSubscription;
    installBrowser({ permission: "granted", existing: current });

    await expect(detachBrowserPushBeforeSignOut(async (endpoint) => {
      events.push("server");
      expect(endpoint).toBe(current.endpoint);
      return { removed: true };
    })).resolves.toBeUndefined();
    expect(events).toEqual(["server", "browser"]);
  });

  test("allows sign-out when either server removal or browser unsubscribe protects the device", async () => {
    const browserFallback = {
      endpoint: "https://push.example.test/browser-fallback",
      getKey: (name: PushEncryptionKeyName) => new Uint8Array(
        name === "p256dh" ? [1, 2, 3, 4] : [5, 6, 7, 8],
      ).buffer,
      unsubscribe: vi.fn(async () => true),
    } as unknown as PushSubscription;
    installBrowser({ permission: "granted", existing: browserFallback });
    await expect(detachBrowserPushBeforeSignOut(async () => {
      throw new Error("network unavailable");
    })).resolves.toBeUndefined();

    const serverFallback = {
      endpoint: "https://push.example.test/server-fallback",
      getKey: (name: PushEncryptionKeyName) => new Uint8Array(
        name === "p256dh" ? [1, 2, 3, 4] : [5, 6, 7, 8],
      ).buffer,
      unsubscribe: vi.fn(async () => {
        throw new Error("browser refused");
      }),
    } as unknown as PushSubscription;
    installBrowser({ permission: "granted", existing: serverFallback });
    await expect(detachBrowserPushBeforeSignOut(async () => ({ removed: true })))
      .resolves.toBeUndefined();
  });

  test("blocks sign-out cleanup when both protections fail", async () => {
    const current = {
      endpoint: "https://push.example.test/unsafe",
      getKey: (name: PushEncryptionKeyName) => new Uint8Array(
        name === "p256dh" ? [1, 2, 3, 4] : [5, 6, 7, 8],
      ).buffer,
      unsubscribe: vi.fn(async () => {
        throw new Error("browser refused");
      }),
    } as unknown as PushSubscription;
    installBrowser({ permission: "granted", existing: current });
    await expect(detachBrowserPushBeforeSignOut(async () => ({ removed: false })))
      .rejects.toThrow("PUSH_SIGN_OUT_CLEANUP_FAILED");
  });
});

test("the browser bundle contains only the public VAPID key", async () => {
  const result = await build({
    bundle: true,
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY": '"public-vapid-test-key"',
    },
    format: "esm",
    platform: "browser",
    stdin: {
      contents: 'export { BrowserPushDeviceControls } from "./features/notifications/components/browser-push-device-controls";',
      loader: "ts",
      resolveDir: process.cwd(),
    },
    write: false,
  });
  const bundle = result.outputFiles[0].text;
  expect(bundle).toContain("public-vapid-test-key");
  expect(bundle).not.toContain("VAPID_PRIVATE_KEY");
  expect(bundle).not.toContain("VAPID_SUBJECT");
});
