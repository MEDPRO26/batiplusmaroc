const FALLBACK_TITLE = "Batiplus Maroc";
const MAX_TEXT_LENGTH = 240;

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() && value.length <= MAX_TEXT_LENGTH
    ? value.trim()
    : fallback;
}

function safeLocale(value) {
  return value === "fr" || value === "en" ? value : null;
}

function localeFromUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin !== self.location.origin) return null;
    return safeLocale(parsed.pathname.split("/")[1]);
  } catch {
    return null;
  }
}

function localeFromWindows(windows) {
  for (const client of windows) {
    const locale = localeFromUrl(client.url);
    if (locale) return locale;
  }
  return null;
}

function localizedFallback(locale) {
  return locale ? `/${locale}/notifications` : null;
}

function safeInternalUrl(value, locale) {
  const fallback = localizedFallback(locale);
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  try {
    const parsed = new URL(value, self.location.origin);
    return parsed.origin === self.location.origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

function rawPushPayload(event) {
  let value = {};
  try {
    value = event.data ? event.data.json() : {};
  } catch {
    value = {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  return value;
}

async function safePushPayload(event) {
  const value = rawPushPayload(event);
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const locale = safeLocale(value.locale)
    ?? localeFromUrl(value.url)
    ?? localeFromWindows(windows);
  return {
    title: safeText(value.title, FALLBACK_TITLE),
    body: safeText(value.body),
    locale,
    url: safeInternalUrl(value.url, locale),
    tag: safeText(value.tag, "batiplus-notification"),
  };
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const payload = await safePushPayload(event);
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { locale: payload.locale, url: payload.url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const data = event.notification.data ?? {};
    const locale = safeLocale(data.locale)
      ?? localeFromUrl(data.url)
      ?? localeFromWindows(windows);
    const relativeUrl = safeInternalUrl(data.url, locale);
    // A locale-less fallback is not safe in this app because routing defaults
    // it to French. Real Batiplus payloads always carry a validated locale.
    if (!relativeUrl) return undefined;
    const targetUrl = new URL(relativeUrl, self.location.origin).href;
    const existing = windows.find((client) => client.url === targetUrl);
    if (existing) {
      return await existing.focus();
    }
    return await self.clients.openWindow(targetUrl);
  })());
});
