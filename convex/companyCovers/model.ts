import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env, type QueryCtx, type MutationCtx } from "../_generated/server";
import { hasPublicCompanyProfile } from "../companyLogos/model";
import { COVER_HTTP_PREFIX } from "./constants";

type DatabaseCtx = QueryCtx | MutationCtx;

export function coverHttpUrl(path: string) {
  return `${env.CONVEX_SITE_URL.replace(/\/$/, "")}${COVER_HTTP_PREFIX}${path}`;
}

export async function resolveApprovedCoverUrl(ctx: DatabaseCtx, company: Doc<"companies">) {
  if (!hasPublicCompanyProfile(company) || !company.approvedCoverImageId) return null;
  const image = await ctx.db.get(company.approvedCoverImageId);
  if (!image || image.companyId !== company._id || image.moderationStatus !== "approved") return null;
  return coverHttpUrl(`public/${image._id}`);
}

/** Storage-derived metadata is immutable; no client supplies or changes a file reference. */
export async function assertCoverFile(ctx: DatabaseCtx, image: Doc<"companyCoverImages">) {
  const metadata = await ctx.db.system.get("_storage", image.storageId);
  if (!metadata || metadata.size !== image.size || (metadata.contentType !== undefined && metadata.contentType !== image.contentType) ||
      metadata.sha256 !== image.sha256) throw new ConvexError("COMPANY_COVER_NOT_FOUND");
}

export function coverDto(image: Doc<"companyCoverImages">) {
  return {
    imageId: image._id,
    companyId: image.companyId,
    contentType: image.contentType,
    size: image.size,
    sha256: image.sha256,
    uploadedBy: image.uploadedBy,
    uploadedAt: image.uploadedAt,
    moderationStatus: image.moderationStatus,
    reason: image.moderationReason ?? null,
    previewUrl: coverHttpUrl(`private/${image._id}`),
  };
}
