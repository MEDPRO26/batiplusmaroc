export type SerializedPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type BrowserPushInspection = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscription: SerializedPushSubscription | null;
};

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return window.btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function serializeSubscription(subscription: PushSubscription): SerializedPushSubscription {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) throw new Error("PUSH_SUBSCRIPTION_KEYS_MISSING");
  return {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64Url(p256dh),
    auth: arrayBufferToBase64Url(auth),
  };
}

export function browserPushSupported() {
  return typeof window !== "undefined"
    && window.isSecureContext
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

async function existingRegistration() {
  return await navigator.serviceWorker.getRegistration("/");
}

export async function inspectBrowserPush(): Promise<BrowserPushInspection> {
  if (!browserPushSupported()) {
    return { supported: false, permission: "unsupported", subscription: null };
  }
  const registration = await existingRegistration();
  const subscription = await registration?.pushManager.getSubscription() ?? null;
  return {
    supported: true,
    permission: Notification.permission,
    subscription: subscription ? serializeSubscription(subscription) : null,
  };
}

/**
 * Refresh an existing device binding with the active route locale.
 *
 * This is deliberately passive: it neither requests permission nor creates a
 * browser subscription. It only reconciles a device the user already enabled.
 */
export async function reconcileExistingBrowserPushLocale(
  locale: "fr" | "en",
  registerSubscription: (
    subscription: SerializedPushSubscription & { locale: "fr" | "en" },
  ) => Promise<unknown>,
): Promise<boolean> {
  const inspection = await inspectBrowserPush();
  if (
    !inspection.supported
    || inspection.permission !== "granted"
    || !inspection.subscription
  ) return false;

  await registerSubscription({ ...inspection.subscription, locale });
  return true;
}

export async function enableBrowserPush(
  vapidPublicKey: string,
): Promise<SerializedPushSubscription> {
  if (!browserPushSupported()) throw new Error("PUSH_UNSUPPORTED");
  if (!vapidPublicKey.trim()) throw new Error("PUSH_NOT_CONFIGURED");

  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted") throw new Error(`PUSH_PERMISSION_${permission.toUpperCase()}`);

  const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToArrayBuffer(vapidPublicKey.trim()),
  });
  return serializeSubscription(subscription);
}

export async function disableBrowserPush(): Promise<SerializedPushSubscription | null> {
  if (!browserPushSupported()) return null;
  const registration = await existingRegistration();
  const subscription = await registration?.pushManager.getSubscription() ?? null;
  if (!subscription) return null;
  const serialized = serializeSubscription(subscription);
  const removed = await subscription.unsubscribe();
  if (!removed) throw new Error("PUSH_UNSUBSCRIBE_FAILED");
  return serialized;
}

/**
 * Detach this browser before authentication is cleared.
 *
 * Either removing the authenticated server binding or unsubscribing the
 * browser is sufficient to stop delivery. We still attempt both so stale
 * records and stale browser subscriptions do not survive ordinary sign-out.
 */
export async function detachBrowserPushBeforeSignOut(
  unregisterSubscription: (endpoint: string) => Promise<{ removed: boolean }>,
): Promise<void> {
  let inspection: BrowserPushInspection;
  try {
    inspection = await inspectBrowserPush();
  } catch {
    // If inspection fails, a successful unsubscribe still makes the browser safe.
    await disableBrowserPush();
    return;
  }
  if (!inspection.subscription) return;

  let serverDetached = false;
  let browserDetached = false;
  try {
    const result = await unregisterSubscription(inspection.subscription.endpoint);
    serverDetached = result.removed;
  } catch {
    // Browser cleanup below is an independent privacy fallback.
  }
  try {
    await disableBrowserPush();
    browserDetached = true;
  } catch {
    // A removed server binding is already sufficient to stop delivery.
  }
  if (!serverDetached && !browserDetached) {
    throw new Error("PUSH_SIGN_OUT_CLEANUP_FAILED");
  }
}
