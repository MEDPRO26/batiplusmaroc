import { v } from "convex/values";

export const portfolioImageStatusValidator = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"));
export const portfolioImageTypeValidator = v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp"));
export const portfolioImagePurposeValidator = v.union(v.literal("cover"), v.literal("gallery"));
export const PORTFOLIO_IMAGE_HTTP_PREFIX = "/portfolio-images/";
export const PORTFOLIO_IMAGE_UPLOAD_TTL_MS = 10 * 60 * 1000;
export const PORTFOLIO_GALLERY_LIMIT = 8;
