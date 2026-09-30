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
  dedupeEntries?: Map<string, Response>;
} = {}) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const windows = overrides.windows ?? [];
  const dedupeEntries = overrides.dedupeEntries ?? new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => dedupeEntries.get(request.url)),
    put: vi.fn(async (request: Request, response: Response) => { dedupeEntries.set(request.url, response); }),
    keys: vi.fn(async () => [...dedupeEntries.keys()].map((url) => new Request(url))),
    delete: vi.fn(async (request: Request) => dedupeEntries.delete(request.url)),
  };
  const self = {
    location: { origin: "https://batiplus.example" },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => windows),
      openWindow,
    },
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
  };
  vm.runInNewContext(source, {
    self,
    URL,
    Request,
    Response,
    caches: { open: vi.fn(async () => cache) },
  });
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
        notificationId: "notification-1",
        body: "Les notifications Batiplus sont activées.",
        locale: "fr",
        url: "/fr/notifications",
        tag: "test",
      }) },
    });
    expect(state.showNotification).toHaveBeenCalledWith("Batiplus Maroc", {
      body: "Les notifications Batiplus sont activées.",
      tag: "test",
      data: { locale: "fr", url: "/fr/notifications" },
    });
  });

  test("does not display a retried notification after the worker restarts", async () => {
    const dedupeEntries = new Map<string, Response>();
    const payload = {
      notificationId: "notification-crash-window",
      title: "Batiplus Maroc",
      body: "New marketplace activity.",
      locale: "en",
      url: "/en/notifications",
      tag: "batiplus-notification-notification-crash-window",
    };
    const firstWorker = worker({ dedupeEntries });
    await dispatch(firstWorker.listeners.get("push")!, { data: { json: () => payload } });
    expect(firstWorker.showNotification).toHaveBeenCalledTimes(1);

    const reclaimedWorker = worker({ dedupeEntries });
    await dispatch(reclaimedWorker.listeners.get("push")!, { data: { json: () => payload } });
    expect(reclaimedWorker.showNotification).not.toHaveBeenCalled();
  });

  test("serializes concurrent duplicate deliveries in one worker", async () => {
    const state = worker();
    const payload = {
      notificationId: "notification-concurrent-retry",
      title: "Batiplus Maroc",
      body: "New marketplace activity.",
      locale: "en",
      url: "/en/notifications",
      tag: "batiplus-notification-notification-concurrent-retry",
    };
    await Promise.all([
      dispatch(state.listeners.get("push")!, { data: { json: () => payload } }),
      dispatch(state.listeners.get("push")!, { data: { json: () => payload } }),
    ]);
    expect(state.showNotification).toHaveBeenCalledTimes(1);
  });

  test("derives an English fallback from an existing client for a malformed payload", async () => {
    const englishClient = {
      url: "https://batiplus.example/en/client/dashboard",
      navigate: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
    };
    const state = worker({ windows: [englishClient] });
    await dispatch(state.listeners.get("push")!, {
      data: { json: () => { throw new Error("malformed"); } },
    });
    expect(state.showNotification).toHaveBeenCalledWith("Batiplus Maroc", {
      body: "",
      tag: "batiplus-notification",
      data: { locale: "en", url: "/en/notifications" },
    });
  });

  test("uses the payload locale for a URL-less push", async () => {
    const state = worker();
    await dispatch(state.listeners.get("push")!, {
      data: { json: () => ({ title: "Batiplus Maroc", locale: "en" }) },
    });
    expect(state.showNotification).toHaveBeenCalledWith("Batiplus Maroc", {
      body: "",
      tag: "batiplus-notification",
      data: { locale: "en", url: "/en/notifications" },
    });
  });

  test("focuses only an existing window that already matches the target URL", async () => {
    const unrelated = {
      url: "https://batiplus.example/en",
      navigate: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
    };
    const matching = {
      url: "https://batiplus.example/fr/notifications?source=push",
      navigate: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
    };
    const state = worker({ windows: [unrelated, matching] });
    const close = vi.fn();
    await dispatch(state.listeners.get("notificationclick")!, {
      notification: { data: { url: "/fr/notifications?source=push" }, close },
    });
    expect(close).toHaveBeenCalled();
    expect(matching.focus).toHaveBeenCalled();
    expect(matching.navigate).not.toHaveBeenCalled();
    expect(unrelated.focus).not.toHaveBeenCalled();
    expect(unrelated.navigate).not.toHaveBeenCalled();
    expect(state.openWindow).not.toHaveBeenCalled();
  });

  test("opens a new window instead of navigating an unrelated Batiplus tab", async () => {
    const unrelated = {
      url: "https://batiplus.example/en/client/projects/new",
      navigate: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
    };
    const state = worker({ windows: [unrelated] });
    await dispatch(state.listeners.get("notificationclick")!, {
      notification: {
        data: { url: "/en/notifications" },
        close: vi.fn(),
      },
    });
    expect(unrelated.navigate).not.toHaveBeenCalled();
    expect(unrelated.focus).not.toHaveBeenCalled();
    expect(state.openWindow).toHaveBeenCalledWith(
      "https://batiplus.example/en/notifications",
    );
  });

  test.each([
    "https://evil.example/phish",
    "//evil.example/phish",
  ])("rejects external click target %s and preserves its validated locale", async (url) => {
    const state = worker();
    await dispatch(state.listeners.get("notificationclick")!, {
      notification: { data: { locale: "en", url }, close: vi.fn() },
    });
    expect(state.openWindow).toHaveBeenCalledWith(
      "https://batiplus.example/en/notifications",
    );
  });

  test("derives a URL-less click fallback from an existing localized client", async () => {
    const englishClient = {
      url: "https://batiplus.example/en/client/projects/new",
      navigate: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
    };
    const state = worker({ windows: [englishClient] });
    await dispatch(state.listeners.get("notificationclick")!, {
      notification: { data: {}, close: vi.fn() },
    });
    expect(state.openWindow).toHaveBeenCalledWith(
      "https://batiplus.example/en/notifications",
    );
  });

  test("does not invent a French fallback when no locale can be recovered", async () => {
    const state = worker();
    await dispatch(state.listeners.get("notificationclick")!, {
      notification: { data: {}, close: vi.fn() },
    });
    expect(state.openWindow).not.toHaveBeenCalled();
  });

  test("has no fetch interception, install, or activation behavior", () => {
    expect(source).not.toMatch(/addEventListener\(["']fetch["']/);
    expect(source).not.toMatch(/addEventListener\(["']install["']/);
    expect(source).not.toMatch(/addEventListener\(["']activate["']/);
  });
});
