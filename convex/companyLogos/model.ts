import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env, type QueryCtx, type MutationCtx } from "../_generated/server";
import { LOGO_HTTP_PREFIX } from "./constants";

type DatabaseCtx = QueryCtx | MutationCtx;

export function logoHttpUrl(path: string) {
  return `${env.CONVEX_SITE_URL.replace(/\/$/, "")}${LOGO_HTTP_PREFIX}${path}`;
}

/** Matches public profile visibility. Suspension hides directory entries, not historical profiles. */
export function hasPublicCompanyProfile(company: Doc<"companies">) {
  return company.onboardingStatus === "completed" && !!company.slug && !!company.name &&
    !!company.city && !!company.description;
}

export async function resolveApprovedLogoUrl(ctx: DatabaseCtx, company: Doc<"companies">) {
  if (!hasPublicCompanyProfile(company) || !company.approvedLogoImageId) return null;
  const image = await ctx.db.get(company.approvedLogoImageId);
  if (!image || image.companyId !== company._id || image.moderationStatus !== "approved") return null;
  return logoHttpUrl(`public/${image._id}`);
}

/** Storage-derived metadata is immutable; no client supplies or changes a file reference. */
export async function assertLogoFile(ctx: DatabaseCtx, image: Doc<"companyLogoImages">) {
  const metadata = await ctx.db.system.get("_storage", image.storageId);
  if (!metadata || metadata.size !== image.size || (metadata.contentType !== undefined && metadata.contentType !== image.contentType) ||
      metadata.sha256 !== image.sha256) throw new ConvexError("COMPANY_LOGO_NOT_FOUND");
}

export function logoDto(image: Doc<"companyLogoImages">) {
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
    previewUrl: logoHttpUrl(`private/${image._id}`),
  };
}
