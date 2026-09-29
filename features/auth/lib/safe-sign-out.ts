import { detachBrowserPushBeforeSignOut } from "@/features/notifications/lib/browser-push";

export async function signOutSafely({
  unregisterSubscription,
  signOut,
}: {
  unregisterSubscription: (endpoint: string) => Promise<{ removed: boolean }>;
  signOut: () => Promise<void>;
}) {
  try {
    await detachBrowserPushBeforeSignOut(unregisterSubscription);
    await signOut();
    return true;
  } catch {
    return false;
  }
}
