const FALLBACK_URL = "/en/notifications";
const FALLBACK_TITLE = "Batiplus Maroc";
const MAX_TEXT_LENGTH = 240;

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() && value.length <= MAX_TEXT_LENGTH
    ? value.trim()
    : fallback;
}

function safeInternalUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return FALLBACK_URL;
  try {
    const parsed = new URL(value, self.location.origin);
    return parsed.origin === self.location.origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : FALLBACK_URL;
  } catch {
    return FALLBACK_URL;
  }
}

function safePushPayload(event) {
  let value = {};
  try {
    value = event.data ? event.data.json() : {};
  } catch {
    value = {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  return {
    title: safeText(value.title, FALLBACK_TITLE),
    body: safeText(value.body),
    url: safeInternalUrl(value.url),
    tag: safeText(value.tag, "batiplus-notification"),
  };
}

self.addEventListener("push", (event) => {
  const payload = safePushPayload(event);
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const relativeUrl = safeInternalUrl(event.notification.data?.url);
  const targetUrl = new URL(relativeUrl, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      if ("navigate" in existing) await existing.navigate(targetUrl);
      return await existing.focus();
    }
    return await self.clients.openWindow(targetUrl);
  })());
});
