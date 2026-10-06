import type { Id } from "@/convex/_generated/dataModel";
import { PUBLIC_MEDIA_MAX_BYTES } from "@/convex/storage/constants";

export type CoverContentType = "image/jpeg" | "image/png" | "image/webp";
const contentTypes = new Set<string>(["image/jpeg", "image/png", "image/webp"]);

/** Client checks improve feedback; the authenticated backend validates the bytes. */
export function validateCompanyCoverFile(file: File): CoverContentType {
  if (!contentTypes.has(file.type) || file.size < 1 || file.size > PUBLIC_MEDIA_MAX_BYTES) throw new Error("INVALID_COVER");
  return file.type as CoverContentType;
}

/** Construct every authenticated URL ourselves; never trust a supplied upload/preview URL. */
function coverEndpoint(path: string) {
  const configured = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!configured) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  const site = new URL(configured);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  if ((site.protocol !== "https:" && !(site.protocol === "http:" && local)) || site.username || site.password ||
      site.pathname !== "/" || site.search || site.hash) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  return new URL(`/company-covers/${path}`, site.origin).href;
}

function sessionHeaders(token: string | null | undefined) {
  if (!token) throw new Error("NOT_AUTHENTICATED");
  return { Authorization: `Bearer ${token}` };
}

/** Public consumers fail closed for legacy storage URLs and every non-public cover endpoint. */
export function isApprovedCompanyCoverUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const expected = new URL(coverEndpoint("public/example"));
    return url.origin === expected.origin && /^\/company-covers\/public\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export async function uploadCompanyCover(args: {
  uploadToken: string; sessionToken: string | null | undefined; file: File; signal?: AbortSignal;
}): Promise<Id<"companyCoverImages">> {
  const contentType = validateCompanyCoverFile(args.file);
  const response = await fetch(coverEndpoint("upload"), {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
    headers: { ...sessionHeaders(args.sessionToken), "Content-Type": contentType, "X-Upload-Token": args.uploadToken },
    body: args.file,
  });
  if (!response.ok) {
    throw new Error(response.status === 400 ? "INVALID_COMPANY_COVER_UPLOAD" :
      [401, 403].includes(response.status) ? "NOT_AUTHENTICATED" : "PUBLIC_MEDIA_UPLOAD_FAILED");
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("imageId" in payload) || typeof payload.imageId !== "string" || !payload.imageId) {
    throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  }
  return payload.imageId as Id<"companyCoverImages">;
}

export async function fetchCompanyCoverPreview(args: {
  imageId: Id<"companyCoverImages">; sessionToken: string | null | undefined; signal?: AbortSignal;
}) {
  const response = await fetch(coverEndpoint(`private/${encodeURIComponent(args.imageId)}`), {
    headers: sessionHeaders(args.sessionToken), credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
  });
  if (!response.ok) throw new Error("COMPANY_COVER_NOT_FOUND");
  const blob = await response.blob();
  if (!contentTypes.has(blob.type) || blob.size < 1 || blob.size > PUBLIC_MEDIA_MAX_BYTES) throw new Error("COMPANY_COVER_NOT_FOUND");
  return blob;
}
