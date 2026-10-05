import type { Id } from "@/convex/_generated/dataModel";
import { PUBLIC_MEDIA_MAX_BYTES } from "@/convex/storage/constants";

type ContentType = "image/jpeg" | "image/png" | "image/webp";
const contentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function endpoint(path: string) {
  const configured = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!configured) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  const site = new URL(configured);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  if ((site.protocol !== "https:" && !(site.protocol === "http:" && local)) || site.username || site.password ||
      site.pathname !== "/" || site.search || site.hash) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  return new URL(`/portfolio-images/${path}`, site.origin).href;
}

function sessionHeaders(token: string | null | undefined) {
  if (!token) throw new Error("NOT_AUTHENTICATED");
  return { Authorization: `Bearer ${token}` };
}

export function isApprovedPortfolioImageUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.origin === new URL(endpoint("public/example")).origin && /^\/portfolio-images\/public\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function validatePortfolioImageFile(file: File): ContentType {
  if (!contentTypes.has(file.type) || file.size < 1 || file.size > PUBLIC_MEDIA_MAX_BYTES) throw new Error("INVALID_PORTFOLIO_IMAGE_UPLOAD");
  return file.type as ContentType;
}

/** Construct the trusted destination, ignoring any caller-supplied URL. */
export async function uploadPortfolioImage(args: { uploadToken: string; sessionToken: string | null | undefined; file: File; signal?: AbortSignal }): Promise<Id<"portfolioImages">> {
  const contentType = validatePortfolioImageFile(args.file);
  const response = await fetch(endpoint("upload"), {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
    headers: { ...sessionHeaders(args.sessionToken), "Content-Type": contentType, "X-Upload-Token": args.uploadToken }, body: args.file,
  });
  if (!response.ok) throw new Error(response.status === 400 ? "INVALID_PORTFOLIO_IMAGE_UPLOAD" :
    [401, 403].includes(response.status) ? "NOT_AUTHENTICATED" : "PUBLIC_MEDIA_UPLOAD_FAILED");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("imageId" in payload) || typeof payload.imageId !== "string" || !payload.imageId) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  return payload.imageId as Id<"portfolioImages">;
}

/** Return a Blob, never a permanent link. Caller must cancel and revoke its temporary URL on session changes. */
export async function fetchPortfolioImagePreview(args: { imageId: Id<"portfolioImages">; sessionToken: string | null | undefined; signal?: AbortSignal }) {
  const response = await fetch(endpoint(`private/${encodeURIComponent(args.imageId)}`), {
    headers: sessionHeaders(args.sessionToken), credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
  });
  if (!response.ok) throw new Error("PORTFOLIO_IMAGE_NOT_FOUND");
  const blob = await response.blob();
  if (!contentTypes.has(blob.type) || blob.size < 1 || blob.size > PUBLIC_MEDIA_MAX_BYTES) throw new Error("PORTFOLIO_IMAGE_NOT_FOUND");
  return blob;
}
