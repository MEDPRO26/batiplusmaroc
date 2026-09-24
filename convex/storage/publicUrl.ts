const PUBLIC_BASE_URL_ENV = "R2_PUBLIC_BASE_URL";

export function getPublicMediaBaseUrl() {
  const raw = process.env[PUBLIC_BASE_URL_ENV]?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getPublicMediaUrl(objectKey: string) {
  const baseUrl = getPublicMediaBaseUrl();
  if (!baseUrl) return null;
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/${encodedKey}`;
}
