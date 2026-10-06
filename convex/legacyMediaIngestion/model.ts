import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { assertNotVerificationStorage } from "../storage/verificationPrivacy";
import type { LegacyTarget } from "./constants";

export function imagePurpose(mediaType: LegacyTarget["mediaType"]) {
  return mediaType === "portfolioGallery" ? "portfolioMedia" : mediaType;
}

/** Resolve all operative file references from persisted targets, never browser URLs/keys. */
export async function resolveSource(ctx: QueryCtx | MutationCtx, target: LegacyTarget) {
  const company = await ctx.db.get(target.companyId);
  if (!company) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
  const portfolio = target.mediaType === "portfolioCover" || target.mediaType === "portfolioGallery";
  const project = portfolio && target.portfolioProjectId ? await ctx.db.get(target.portfolioProjectId) : null;
  const slot = target.mediaType === "portfolioGallery" && target.gallerySlotId ? await ctx.db.get(target.gallerySlotId) : null;
  if (portfolio ? !project || project.companyId !== company._id ||
      (target.mediaType === "portfolioGallery" ? !slot || slot.portfolioProjectId !== project._id : !!target.gallerySlotId)
    : !!target.portfolioProjectId || !!target.gallerySlotId) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
  const mediaId = target.mediaType === "companyLogo" ? company.logoMediaId : target.mediaType === "companyCover" ? company.coverMediaId :
    target.mediaType === "portfolioCover" ? project?.coverMediaId : slot?.publicMediaId;
  const storageId = target.mediaType === "companyLogo" ? company.logoStorageId :
    target.mediaType === "portfolioCover" ? project?.coverImageStorageId : target.mediaType === "portfolioGallery" ? slot?.storageId : undefined;
  let source: { sourceRef: string; sourceRecordId: string; objectKey?: string; storageId?: typeof storageId; contentType?: string; size?: number };
  if (target.provider === "r2") {
    const media = mediaId ? await ctx.db.get(mediaId) : null;
    if (!media || media.companyId !== company._id || media.purpose !== imagePurpose(target.mediaType) ||
      media.portfolioProjectId !== project?._id || !media.objectKey.startsWith(`companies/${company._id}/`)) {
      throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    }
    source = { sourceRef: media.objectKey, sourceRecordId: media._id, objectKey: media.objectKey };
  } else {
    if (!storageId) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    await assertNotVerificationStorage(ctx, storageId);
    const metadata = await ctx.db.system.get("_storage", storageId);
    if (!metadata) {
      throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    }
    source = { sourceRef: storageId, sourceRecordId: (slot ?? project ?? company)._id, storageId, contentType: metadata.contentType, size: metadata.size };
  }
  const submitted = target.mediaType === "companyLogo" ? company.submittedLogoImageId : target.mediaType === "companyCover" ? company.submittedCoverImageId : (slot ?? project)?.submittedImageId;
  const approved = target.mediaType === "companyLogo" ? company.approvedLogoImageId : target.mediaType === "companyCover" ? company.approvedCoverImageId : (slot ?? project)?.approvedImageId;
  const sourceKey = await sha256(new TextEncoder().encode(JSON.stringify([
    target.provider, source.sourceRef, target.mediaType, company._id, project?._id ?? null, slot?._id ?? null,
  ])));
  return { company, project, slot, source, sourceKey, conflict: !!submitted || !!approved };
}

export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Compare digest bytes independently of storage metadata encoding (hex or standard base64). */
export function storageHashMatches(stored: string, hex: string) {
  if (/^[a-f0-9]{64}$/i.test(stored)) return stored.toLowerCase() === hex;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(stored)) return false;
  const bytes = Uint8Array.from(atob(stored), char => char.charCodeAt(0));
  return bytes.length === 32 && Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("") === hex;
}

export function resultDto(record: Doc<"legacyMediaIngestions">) {
  return { ingestionId: record._id, status: record.status, imageId: record.imageId ?? null };
}
