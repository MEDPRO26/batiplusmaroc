import { ConvexError } from "convex/values";

export const MESSAGE_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_UPLOAD_TTL_MS = 10 * 60 * 1000;

export function normalizePdfContentType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function sanitizeMessagePdfFileName(value: string) {
  const basename = value.split(/[\\/]/).at(-1) ?? "";
  const cleaned = basename
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (!cleaned) throw new ConvexError("INVALID_MESSAGE_PDF");
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

export function validateMessagePdfMetadata(contentType: string, size: number) {
  if (normalizePdfContentType(contentType) !== "application/pdf") {
    throw new ConvexError("INVALID_MESSAGE_PDF");
  }
  if (!Number.isInteger(size) || size < 1 || size > MESSAGE_PDF_MAX_BYTES) {
    throw new ConvexError("MESSAGE_PDF_TOO_LARGE");
  }
}

export function hasPdfMagicBytes(bytes: Uint8Array) {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}
