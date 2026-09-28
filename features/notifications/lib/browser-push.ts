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
