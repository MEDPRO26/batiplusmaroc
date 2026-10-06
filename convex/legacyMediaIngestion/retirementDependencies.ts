import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { PUBLIC_MEDIA_UPLOAD_TTL_MS } from "../storage/constants";
import { assertNotVerificationStorage } from "../storage/verificationPrivacy";
import type { blockerValidator } from "./retirementConstants";

type Ctx = QueryCtx | MutationCtx;
type Blocker = typeof blockerValidator.type;

/** Exact reverse indexes; allow only the confirmed target's retained historical reference. */
export async function retirementDependencies(ctx: Ctx, record: Doc<"legacyMediaIngestions">, sourceMedia: Doc<"publicMedia"> | null, now: number) {
  const blockers: Blocker[] = [];
  const provenance = await ctx.db.query("legacyMediaIngestions").withIndex("by_provider_and_sourceRef", q => q.eq("provider", record.provider).eq("sourceRef", record.sourceRef)).take(2);
  if (provenance.length !== 1 || provenance[0]._id !== record._id) blockers.push("dependency_ambiguous");
  if (record.provider === "convex") {
    const id = ctx.db.system.normalizeId("_storage", record.sourceRef);
    if (!id) return [...blockers, "source_invalid" as const];
    try { await assertNotVerificationStorage(ctx, id); }
    catch { blockers.push("dependency_found"); }
    const [companies, projects, slots, messages, quotes, attachments] = await Promise.all([
      ctx.db.query("companies").withIndex("by_logoStorageId", q => q.eq("logoStorageId", id)).take(2),
      ctx.db.query("portfolioProjects").withIndex("by_coverImageStorageId", q => q.eq("coverImageStorageId", id)).take(2),
      ctx.db.query("portfolioMedia").withIndex("by_storageId", q => q.eq("storageId", id)).take(2),
      ctx.db.query("messageAttachments").withIndex("by_storageId", q => q.eq("storageId", id)).take(1),
      ctx.db.query("finalQuoteRevisions").withIndex("by_pdfStorageId", q => q.eq("pdfStorageId", id)).take(1),
      ctx.db.query("projectAttachments").withIndex("by_storageId", q => q.eq("storageId", id)).take(1),
    ]);
    if (companies.some(row => record.mediaType !== "companyLogo" || row._id !== record.companyId) ||
      projects.some(row => record.mediaType !== "portfolioCover" || row._id !== record.portfolioProjectId) ||
      slots.some(row => record.mediaType !== "portfolioGallery" || row._id !== record.gallerySlotId) ||
      messages.length || quotes.length || attachments.length) blockers.push("dependency_found");
  } else {
    if (!sourceMedia) return [...blockers, "relationship_changed" as const];
    const key = record.sourceRef;
    const [media, logos, covers, projects, slots, grants, projectMedia, projectGrants, avatars, avatarGrants, seo, seoGrants] = await Promise.all([
      ctx.db.query("publicMedia").withIndex("by_objectKey", q => q.eq("objectKey", key)).take(2),
      ctx.db.query("companies").withIndex("by_logoMediaId", q => q.eq("logoMediaId", sourceMedia._id)).take(2),
      ctx.db.query("companies").withIndex("by_coverMediaId", q => q.eq("coverMediaId", sourceMedia._id)).take(2),
      ctx.db.query("portfolioProjects").withIndex("by_coverMediaId", q => q.eq("coverMediaId", sourceMedia._id)).take(2),
      ctx.db.query("portfolioMedia").withIndex("by_publicMediaId", q => q.eq("publicMediaId", sourceMedia._id)).take(2),
      ctx.db.query("publicMediaUploadIntents").withIndex("by_objectKey", q => q.eq("objectKey", key)).take(2),
      ctx.db.query("projectMedia").withIndex("by_objectKey", q => q.eq("objectKey", key)).take(1),
      ctx.db.query("projectMediaUploadIntents").withIndex("by_objectKey", q => q.eq("objectKey", key)).take(1),
      ctx.db.query("clientProfiles").withIndex("by_avatarObjectKey", q => q.eq("avatarObjectKey", key)).take(1),
      ctx.db.query("clientAvatarUploadIntents").withIndex("by_objectKey", q => q.eq("objectKey", key)).take(1),
      ctx.db.query("seoMedia").withIndex("by_objectKey", q => q.eq("objectKey", key)).take(1),
      ctx.db.query("seoMediaUploadIntents").withIndex("by_objectKey", q => q.eq("objectKey", key)).take(1),
    ]);
    if (media.length !== 1 || media[0]._id !== sourceMedia._id || grants.length > 1) blockers.push("dependency_ambiguous");
    if (logos.some(row => record.mediaType !== "companyLogo" || row._id !== record.companyId) ||
      covers.some(row => record.mediaType !== "companyCover" || row._id !== record.companyId) ||
      projects.some(row => record.mediaType !== "portfolioCover" || row._id !== record.portfolioProjectId) ||
      slots.some(row => record.mediaType !== "portfolioGallery" || row._id !== record.gallerySlotId) ||
      projectMedia.length || projectGrants.length || avatars.length || avatarGrants.length || seo.length || seoGrants.length) blockers.push("dependency_found");
    // Claimed PUT grants remain reusable until expiry. Missing legacy intents require the full
    // issuance TTL since the trusted media creation time; arbitrary external writers are a dev gate check.
    if (grants.some(row => row.expiresAt >= now) || !Number.isFinite(sourceMedia.createdAt) ||
      sourceMedia.createdAt + PUBLIC_MEDIA_UPLOAD_TTL_MS >= now) blockers.push("upload_grant_active");
    if (grants.some(row => !Number.isFinite(row.expiresAt) || !Number.isFinite(row.createdAt) || row.expiresAt < row.createdAt ||
      row.companyId !== record.companyId || row.purpose !== sourceMedia.purpose ||
      (row.portfolioProjectId !== undefined && row.portfolioProjectId !== record.portfolioProjectId))) blockers.push("dependency_ambiguous");
  }
  return blockers;
}

export function exactImageTarget(image: Doc<"companyLogoImages"> | Doc<"companyCoverImages"> | Doc<"portfolioImages">, record: Doc<"legacyMediaIngestions">) {
  return image.companyId === record.companyId && (record.mediaType.startsWith("portfolio")
    ? "portfolioProjectId" in image && image.portfolioProjectId === record.portfolioProjectId &&
      image.purpose === (record.mediaType === "portfolioCover" ? "cover" : "gallery") && image.gallerySlotId === record.gallerySlotId
    : !("portfolioProjectId" in image));
}

export type ModerationId = Id<"companyLogoImages"> | Id<"companyCoverImages"> | Id<"portfolioImages">;
