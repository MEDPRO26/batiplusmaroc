import { ALLOWED_PUBLIC_IMAGE_TYPES, PUBLIC_MEDIA_MAX_BYTES, PUBLIC_MEDIA_UPLOAD_TTL_MS } from "../storage/constants";

export const SEO_MEDIA_MAX_BYTES = PUBLIC_MEDIA_MAX_BYTES;
export const SEO_MEDIA_UPLOAD_TTL_MS = PUBLIC_MEDIA_UPLOAD_TTL_MS;
export const SEO_MEDIA_DIMENSION_PROBE_BYTES = 256 * 1024;

export function validateSeoMediaInput(contentType: string, size: number) {
  return (
    ALLOWED_PUBLIC_IMAGE_TYPES.has(contentType) &&
    Number.isInteger(size) &&
    size >= 1 &&
    size <= SEO_MEDIA_MAX_BYTES
  );
}

export function normalizeSeoMediaFileName(value: string) {
  const normalized = value
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized || normalized.length > 255) return null;
  return normalized;
}
