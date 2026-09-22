import { v } from "convex/values";

export const PUBLIC_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const COMPANY_LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const PUBLIC_MEDIA_UPLOAD_TTL_MS = 10 * 60 * 1000;
export const PUBLIC_MEDIA_UPLOAD_TTL_SECONDS = 10 * 60;

export const publicMediaPurposeValidator = v.union(
  v.literal("companyLogo"),
  v.literal("companyCover"),
  v.literal("portfolioCover"),
  v.literal("portfolioMedia"),
);

export type PublicMediaPurpose =
  | "companyLogo"
  | "companyCover"
  | "portfolioCover"
  | "portfolioMedia";

export const ALLOWED_PUBLIC_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validatePublicImageInput(
  purpose: PublicMediaPurpose,
  contentType: string,
  size: number,
) {
  const maximum = purpose === "companyLogo" ? COMPANY_LOGO_MAX_BYTES : PUBLIC_MEDIA_MAX_BYTES;
  return (
    ALLOWED_PUBLIC_IMAGE_TYPES.has(contentType) &&
    Number.isInteger(size) &&
    size >= 1 &&
    size <= maximum
  );
}

export function extensionForContentType(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  throw new Error("Unsupported public image content type");
}
