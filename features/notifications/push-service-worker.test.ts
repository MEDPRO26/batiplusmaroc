// @vitest-environment node

import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { beforeAll, describe, expect, test, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

let source = "";

beforeAll(async () => {
  source = await readFile(new URL("../../public/push-sw.js", import.meta.url), "utf8");
});

function worker(overrides: {
  windows?: Array<{ url: string; navigate: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }>;
} = {}) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const windows = overrides.windows ?? [];
  const self = {
    location: { origin: "https://batiplus.example" },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => windows),
      openWindow,
    },
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
  };
  vm.runInNewContext(source, { self, URL });
  return { listeners, showNotification, openWindow };
}

async function dispatch(listener: Listener, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  listener({
    ...event,
    waitUntil(value: Promise<unknown>) {
      pending = value;
    },
  });
  await pending;
}

describe("push service worker", () => {
  test("shows a valid localized payload", async () => {
    const state = worker();
    await dispatch(state.listeners.get("push")!, {
      data: { json: () => ({
        title: "Batiplus Maroc",
        body: "Les notifications Batiplus sont activées.",
        url: "/fr/notifications",
        tag: "test",
      }) },
    });
    expect(state.showNotification).toHaveBeenCalledWith("Batiplus Maroc", {
      body: "Les notifications Batiplus sont activées.",
      tag: "test",
      data: { url: "/fr/notifications" },
    });
  });

  test("handles malformed payloads with safe fallbacks", async () => {
    const state = worker();
    await dispatch(state.listeners.get("push")!, {
      data: { json: () => { throw new Error("malformed"); } },
    });
    expect(state.showNotification).toHaveBeenCalledWith("Batiplus Maroc", {
      body: "",
      tag: "batiplus-notification",
      data: { url: "/fr/notifications" },
    });
  });

  test("focuses and navigates an existing Batiplus window for a safe local click", async () => {
    const existing = {
      url: "https://batiplus.example/en",
      navigate: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
    };
    const state = worker({ windows: [existing] });
    const close = vi.fn();
    await dispatch(state.listeners.get("notificationclick")!, {
      notification: { data: { url: "/fr/notifications?source=push" }, close },
    });
    expect(close).toHaveBeenCalled();
    expect(existing.navigate).toHaveBeenCalledWith(
      "https://batiplus.example/fr/notifications?source=push",
    );
    expect(existing.focus).toHaveBeenCalled();
    expect(state.openWindow).not.toHaveBeenCalled();
  });

  test.each([
    "https://evil.example/phish",
    "//evil.example/phish",
  ])("rejects external click target %s and opens the safe fallback", async (url) => {
    const state = worker();
    await dispatch(state.listeners.get("notificationclick")!, {
      notification: { data: { url }, close: vi.fn() },
    });
    expect(state.openWindow).toHaveBeenCalledWith(
      "https://batiplus.example/fr/notifications",
    );
  });

  test("has no fetch interception, cache, install, or activation behavior", () => {
    expect(source).not.toMatch(/addEventListener\(["']fetch["']/);
    expect(source).not.toMatch(/addEventListener\(["']install["']/);
    expect(source).not.toMatch(/addEventListener\(["']activate["']/);
    expect(source).not.toContain("caches.");
  });
});
