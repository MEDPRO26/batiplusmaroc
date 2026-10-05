import { v } from "convex/values";

export const logoStatusValidator = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"));
export const logoContentTypeValidator = v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp"));
export const LOGO_UPLOAD_TTL_MS = 10 * 60 * 1000;
export const LOGO_HTTP_PREFIX = "/company-logos/";
