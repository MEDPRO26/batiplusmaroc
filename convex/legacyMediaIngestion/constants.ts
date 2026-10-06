import { v, type Infer } from "convex/values";

export const mediaTypeValidator = v.union(v.literal("companyLogo"), v.literal("companyCover"), v.literal("portfolioCover"), v.literal("portfolioGallery"));
export const providerValidator = v.union(v.literal("r2"), v.literal("convex"));
export const ingestionStatusValidator = v.union(v.literal("processing"), v.literal("ingested"), v.literal("conflict"), v.literal("failed"));
export const ingestionImageValidator = v.union(v.id("companyLogoImages"), v.id("companyCoverImages"), v.id("portfolioImages"));
export const targetValidator = v.object({
  mediaType: mediaTypeValidator, provider: providerValidator, companyId: v.id("companies"),
  portfolioProjectId: v.optional(v.id("portfolioProjects")), gallerySlotId: v.optional(v.id("portfolioMedia")),
});
export type LegacyTarget = Infer<typeof targetValidator>;
export const requestValidator = targetValidator.extend({ sourceKey: v.string() });
export const resultValidator = v.object({
  ingestionId: v.id("legacyMediaIngestions"), status: ingestionStatusValidator,
  imageId: v.union(ingestionImageValidator, v.null()),
});
export const sourceValidator = v.object({
  sourceRef: v.string(), sourceRecordId: v.string(),
  storageId: v.optional(v.id("_storage")), objectKey: v.optional(v.string()),
  contentType: v.optional(v.string()), size: v.optional(v.number()),
});
// Longer than bounded R2 IO and the action execution window. Retry fences a lost attempt.
export const INGESTION_LEASE_MS = 10 * 60 * 1000;
