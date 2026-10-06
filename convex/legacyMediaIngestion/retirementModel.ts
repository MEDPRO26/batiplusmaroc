import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { validatePublicImageInput } from "../storage/constants";
import { getPublicMediaUrl } from "../storage/publicUrl";
import { imagePurpose, sha256, storageHashMatches } from "./model";
import { exactImageTarget, retirementDependencies, type ModerationId } from "./retirementDependencies";
import type { blockerValidator, readinessValidator } from "./retirementConstants";

type Ctx = QueryCtx | MutationCtx;
type Record = Doc<"legacyMediaIngestions">;
type Image = Doc<"companyLogoImages"> | Doc<"companyCoverImages"> | Doc<"portfolioImages">;

export function assertRevocationEnabled(provider: Record["provider"]) {
  if (process.env.LEGACY_MEDIA_REVOCATION_ENABLED !== "true") throw new ConvexError("LEGACY_MEDIA_REVOCATION_DISABLED");
  // Cloudflare does not document conditional S3 DELETE. No destructive R2 call is permitted
  // until a separately authorized disposable dev probe proves If-Match is enforced.
  if (provider === "r2" && process.env.LEGACY_MEDIA_R2_CONDITIONAL_DELETE_VERIFIED !== "true") {
    throw new ConvexError("LEGACY_MEDIA_R2_SAFETY_UNVERIFIED");
  }
}

/** Missing/malformed leases stay locked; only a known expired lease permits recovery. */
export function hasActiveRetirementLease(record: Record, now: number) {
  return record.retirementStatus === "retiring" &&
    (record.retirementLeaseUntil === undefined || !Number.isFinite(record.retirementLeaseUntil) || record.retirementLeaseUntil > now);
}

async function getImage(ctx: Ctx, id: ModerationId | undefined, record: Record): Promise<Image | null> {
  if (!id) return null;
  const table = record.mediaType === "companyLogo" ? "companyLogoImages" : record.mediaType === "companyCover" ? "companyCoverImages" : "portfolioImages";
  const normalized = ctx.db.normalizeId(table, id);
  return normalized ? await ctx.db.get(normalized) : null;
}
async function validPrivateImage(ctx: Ctx, image: Image | null, record: Record, preserved = false) {
  if (!image || !exactImageTarget(image, record) || !validatePublicImageInput(imagePurpose(record.mediaType), image.contentType, image.size)) return false;
  const metadata = await ctx.db.system.get("_storage", image.storageId);
  return !!metadata && metadata.size === image.size && metadata.sha256 === image.sha256 &&
    (metadata.contentType === undefined || metadata.contentType === image.contentType) &&
    (!preserved || (image.storageId !== record.sourceRef && image.size === record.size && image.contentType === record.contentType &&
      !!record.sha256 && /^[a-f0-9]{64}$/.test(record.sha256) && storageHashMatches(metadata.sha256, record.sha256)));
}

/** No provider byte reads. Missing originals are allowed only with the exact retained relationship. */
export async function evaluateRetirement(ctx: Ctx, record: Record, now: number): Promise<typeof readinessValidator.type> {
  const blockers: (typeof blockerValidator.type)[] = [];
  if (record.status !== "ingested" || !record.imageId || record.completedAt === undefined || !record.sha256 ||
    !record.size || !record.contentType || (record.provider === "r2" && !record.sourceEtag)) blockers.push("ingestion_incomplete");
  const company = await ctx.db.get(record.companyId);
  const project = record.portfolioProjectId ? await ctx.db.get(record.portfolioProjectId) : null;
  const slot = record.gallerySlotId ? await ctx.db.get(record.gallerySlotId) : null;
  const portfolio = record.mediaType.startsWith("portfolio");
  let relationship = !!company && (portfolio ? !!project && project.companyId === record.companyId &&
    (record.mediaType === "portfolioGallery" ? !!slot && slot.portfolioProjectId === project._id : !record.gallerySlotId)
    : !record.portfolioProjectId && !record.gallerySlotId);
  const target = slot ?? project ?? company;
  const mediaId = record.mediaType === "companyLogo" ? company?.logoMediaId : record.mediaType === "companyCover" ? company?.coverMediaId :
    record.mediaType === "portfolioCover" ? project?.coverMediaId : slot?.publicMediaId;
  const originalId = record.mediaType === "companyLogo" ? company?.logoStorageId : record.mediaType === "portfolioCover" ? project?.coverImageStorageId :
    record.mediaType === "portfolioGallery" ? slot?.storageId : undefined;
  const media = record.provider === "r2" && mediaId ? await ctx.db.get(mediaId) : null;
  if (record.provider === "r2") {
    relationship = relationship && !!media && media._id === record.sourceRecordId && media.objectKey === record.sourceRef &&
      media.companyId === record.companyId && media.portfolioProjectId === record.portfolioProjectId &&
      media.purpose === imagePurpose(record.mediaType) && media.objectKey.startsWith(`companies/${record.companyId}/`);
  } else relationship = relationship && !!originalId && originalId === record.sourceRef && target?._id === record.sourceRecordId;
  const identity = await sha256(new TextEncoder().encode(JSON.stringify([
    record.provider, record.sourceRef, record.mediaType, record.companyId, record.portfolioProjectId ?? null, record.gallerySlotId ?? null,
  ])));
  if (!relationship || identity !== record.sourceKey) blockers.push("relationship_changed");

  const copy = await getImage(ctx, record.imageId, record);
  if (!await validPrivateImage(ctx, copy, record, true)) blockers.push("preservation_invalid");
  if (!copy || copy.moderationStatus === "pending") blockers.push("moderation_pending");
  else if (copy.moderatedAt === undefined || !copy.moderatedBy || (copy.moderationStatus === "rejected" &&
    (!copy.moderationReason || copy.moderationReason.trim().length < 3 || copy.moderationReason.trim().length > 500))) blockers.push("public_state_unsafe");

  const submittedId = record.mediaType === "companyLogo" ? company?.submittedLogoImageId : record.mediaType === "companyCover" ? company?.submittedCoverImageId : (slot ?? project)?.submittedImageId;
  const approvedId = record.mediaType === "companyLogo" ? company?.approvedLogoImageId : record.mediaType === "companyCover" ? company?.approvedCoverImageId : (slot ?? project)?.approvedImageId;
  const submitted = await getImage(ctx, submittedId, record);
  const approved = await getImage(ctx, approvedId, record);
  let publicState: typeof readinessValidator.type["publicState"] = record.mediaType === "portfolioGallery" ? "omitted" : "generic";
  if (submittedId && !await validPrivateImage(ctx, submitted, record)) publicState = "unsafe";
  if (approvedId) {
    if (approved?.moderationStatus === "approved" && await validPrivateImage(ctx, approved, record)) publicState = "approved";
    else publicState = "unsafe";
  } else if (copy?.moderationStatus !== "rejected") publicState = "unsafe";
  if (publicState === "unsafe") blockers.push("public_state_unsafe");
  // Still validate the submitted pointer even when an approved replacement exists.
  if (submittedId && !await validPrivateImage(ctx, submitted, record)) blockers.push("public_state_unsafe");

  const dependencies = await retirementDependencies(ctx, record, media, now);
  blockers.push(...dependencies);
  let nativeUrl: string | null = null;
  let originalMetadata = null;
  if (record.provider === "convex") {
    const id = ctx.db.system.normalizeId("_storage", record.sourceRef);
    if (id) {
      originalMetadata = await ctx.db.system.get("_storage", id);
      if (originalMetadata && (!record.sha256 || !storageHashMatches(originalMetadata.sha256, record.sha256) || originalMetadata.size !== record.size ||
        (originalMetadata.contentType !== undefined && originalMetadata.contentType !== record.contentType))) blockers.push("source_invalid");
      nativeUrl = await ctx.storage.getUrl(id);
    } else blockers.push("source_invalid");
  }
  const url = record.provider === "r2" ? getPublicMediaUrl(record.sourceRef) : nativeUrl;
  const knownUrls = Array.from(new Set([...(record.retirementUrls ?? []), ...(url ? [url] : [])]));
  const uniqueBlockers = Array.from(new Set(blockers));
  const fingerprint = await sha256(new TextEncoder().encode(JSON.stringify([
    record.sourceKey, record.sourceRecordId, record.imageId, record.sha256, record.size, record.contentType, record.sourceEtag,
    copy?.moderationStatus, copy?.moderatedAt, copy?.storageId, submittedId, submitted?.moderationStatus, submitted?.moderatedAt,
    approvedId, approved?.moderationStatus, approved?.moderatedAt, slot?.sortOrder, knownUrls, uniqueBlockers,
    originalMetadata?._id ?? null, originalMetadata?.sha256 ?? null,
  ])));
  const activeLease = hasActiveRetirementLease(record, now);
  const expiredLease = record.retirementStatus === "retiring" && !activeLease;
  const ready = uniqueBlockers.length === 0 && record.retirementStatus !== "retired" && !activeLease;
  return {
    ingestionId: record._id, mediaType: record.mediaType, provider: record.provider, companyId: record.companyId,
    portfolioProjectId: record.portfolioProjectId, gallerySlotId: record.gallerySlotId,
    companyName: company?.name ?? null, projectTitle: project?.title ?? null, order: slot?.sortOrder ?? null,
    ingestionStatus: record.status, moderationStatus: copy?.moderationStatus ?? null, publicState,
    dependencyResult: dependencies.length ? "blocked" : "clear", ready,
    retryable: ready && (expiredLease || record.retirementStatus === "failed"), blockers: uniqueBlockers, fingerprint,
    recoveryImageId: record.imageId ?? null,
    retirementStatus: record.retirementStatus === "retired" ? "retired" : activeLease ? "retiring" :
      record.retirementStatus === "failed" ? "failed" : ready ? "ready" : "not_ready",
    knownUrls, cacheVerificationRequired: record.cacheVerification === "verification_required",
  };
}

export function retirementResult(record: Record) {
  return { ingestionId: record._id, retirementStatus: record.retirementStatus ?? "not_ready" as const,
    cacheVerificationRequired: record.cacheVerification === "verification_required", knownUrls: record.retirementUrls ?? [] };
}

export function originalStorageId(ctx: Ctx, record: Record): Id<"_storage"> {
  const id = ctx.db.system.normalizeId("_storage", record.sourceRef);
  if (record.provider !== "convex" || !id) throw new ConvexError("LEGACY_MEDIA_RETIREMENT_NOT_READY");
  return id;
}
