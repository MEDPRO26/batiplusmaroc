import type { Id } from "@/convex/_generated/dataModel";
import { COMPANY_LOGO_MAX_BYTES } from "@/convex/storage/constants";

export type LogoContentType = "image/jpeg" | "image/png" | "image/webp";
const contentTypes = new Set<string>(["image/jpeg", "image/png", "image/webp"]);

/** Client checks improve feedback; the authenticated backend validates the bytes. */
export function validateCompanyLogoFile(file: File): LogoContentType {
  if (!contentTypes.has(file.type) || file.size < 1 || file.size > COMPANY_LOGO_MAX_BYTES) throw new Error("INVALID_LOGO");
  return file.type as LogoContentType;
}

/** Construct every authenticated URL ourselves; never trust a supplied upload/preview URL. */
function logoEndpoint(path: string) {
  const configured = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!configured) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  const site = new URL(configured);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  if ((site.protocol !== "https:" && !(site.protocol === "http:" && local)) || site.username || site.password ||
      site.pathname !== "/" || site.search || site.hash) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  return new URL(`/company-logos/${path}`, site.origin).href;
}

function sessionHeaders(token: string | null | undefined) {
  if (!token) throw new Error("NOT_AUTHENTICATED");
  return { Authorization: `Bearer ${token}` };
}

/** Public consumers fail closed for legacy storage URLs and every non-public logo endpoint. */
export function isApprovedCompanyLogoUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    const expected = new URL(logoEndpoint("public/example"));
    return url.origin === expected.origin && /^\/company-logos\/public\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export async function uploadCompanyLogo(args: {
  uploadToken: string; sessionToken: string | null | undefined; file: File; signal?: AbortSignal;
}): Promise<Id<"companyLogoImages">> {
  const contentType = validateCompanyLogoFile(args.file);
  const response = await fetch(logoEndpoint("upload"), {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
    headers: { ...sessionHeaders(args.sessionToken), "Content-Type": contentType, "X-Upload-Token": args.uploadToken },
    body: args.file,
  });
  if (!response.ok) {
    throw new Error(response.status === 400 ? "INVALID_COMPANY_LOGO_UPLOAD" :
      [401, 403].includes(response.status) ? "NOT_AUTHENTICATED" : "PUBLIC_MEDIA_UPLOAD_FAILED");
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("imageId" in payload) || typeof payload.imageId !== "string" || !payload.imageId) {
    throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
  }
  return payload.imageId as Id<"companyLogoImages">;
}

export async function fetchCompanyLogoPreview(args: {
  imageId: Id<"companyLogoImages">; sessionToken: string | null | undefined; signal?: AbortSignal;
}) {
  const response = await fetch(logoEndpoint(`private/${encodeURIComponent(args.imageId)}`), {
    headers: sessionHeaders(args.sessionToken), credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
  });
  if (!response.ok) throw new Error("COMPANY_LOGO_NOT_FOUND");
  const blob = await response.blob();
  if (!contentTypes.has(blob.type) || blob.size < 1 || blob.size > COMPANY_LOGO_MAX_BYTES) throw new Error("COMPANY_LOGO_NOT_FOUND");
  return blob;
}
