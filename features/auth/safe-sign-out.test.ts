import { beforeEach, describe, expect, test, vi } from "vitest";

const push = vi.hoisted(() => ({
  detachBrowserPushBeforeSignOut: vi.fn(),
}));

vi.mock("@/features/notifications/lib/browser-push", () => push);

import { signOutSafely } from "./lib/safe-sign-out";

describe("safe sign-out", () => {
  beforeEach(() => {
    push.detachBrowserPushBeforeSignOut.mockReset();
  });

  test("finishes push cleanup before clearing authentication", async () => {
    const events: string[] = [];
    const unregisterSubscription = vi.fn(async () => {
      events.push("server");
      return { removed: true };
    });
    push.detachBrowserPushBeforeSignOut.mockImplementation(async (
      unregister: (endpoint: string) => Promise<{ removed: boolean }>,
    ) => {
      await unregister("https://push.example.test/device");
      events.push("browser");
    });
    const signOut = vi.fn(async () => {
      events.push("auth");
    });

    await expect(signOutSafely({ unregisterSubscription, signOut })).resolves.toBe(true);
    expect(events).toEqual(["server", "browser", "auth"]);
  });

  test("does not clear authentication when device cleanup cannot make sign-out safe", async () => {
    push.detachBrowserPushBeforeSignOut.mockRejectedValue(
      new Error("PUSH_SIGN_OUT_CLEANUP_FAILED"),
    );
    const signOut = vi.fn(async () => undefined);

    await expect(signOutSafely({
      unregisterSubscription: vi.fn(),
      signOut,
    })).resolves.toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });
});
