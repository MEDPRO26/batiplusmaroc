import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env, type QueryCtx, type MutationCtx } from "../_generated/server";
import { hasPublicCompanyProfile } from "../companyLogos/model";
import { PORTFOLIO_IMAGE_HTTP_PREFIX } from "./constants";

type DatabaseCtx = QueryCtx | MutationCtx;

export function portfolioImageHttpUrl(path: string) {
  return `${env.CONVEX_SITE_URL.replace(/\/$/, "")}${PORTFOLIO_IMAGE_HTTP_PREFIX}${path}`;
}

export async function hasPublicPortfolio(ctx: DatabaseCtx, project: Doc<"portfolioProjects">) {
  const company = await ctx.db.get(project.companyId);
  // Preserve historical public profiles, including the existing suspension rule.
  return project.status === "published" && !!company && hasPublicCompanyProfile(company);
}

/** A gallery row is a stable slot, not a file. Legacy file fields are never a fallback. */
export async function imageSlot(ctx: DatabaseCtx, image: Doc<"portfolioImages">) {
  const project = await ctx.db.get(image.portfolioProjectId);
  if (!project || project.companyId !== image.companyId) throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
  if (image.purpose === "cover" && image.gallerySlotId === undefined) return { project, slot: project };
  const slot = image.purpose === "gallery" && image.gallerySlotId ? await ctx.db.get(image.gallerySlotId) : null;
  if (!slot || slot.portfolioProjectId !== project._id) throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
  return { project, slot };
}

export async function resolveApprovedPortfolioImageUrl(
  ctx: DatabaseCtx,
  project: Doc<"portfolioProjects">,
  gallerySlot?: Doc<"portfolioMedia">,
) {
  if (!(await hasPublicPortfolio(ctx, project)) || (gallerySlot && gallerySlot.portfolioProjectId !== project._id)) return null;
  const imageId = (gallerySlot ?? project).approvedImageId;
  const image = imageId ? await ctx.db.get(imageId) : null;
  if (!image || image.companyId !== project.companyId || image.portfolioProjectId !== project._id ||
      image.purpose !== (gallerySlot ? "gallery" : "cover") || image.gallerySlotId !== gallerySlot?._id ||
      image.moderationStatus !== "approved") return null;
  return portfolioImageHttpUrl(`public/${image._id}`);
}

export async function assertPortfolioImageFile(ctx: DatabaseCtx, image: Doc<"portfolioImages">) {
  const metadata = await ctx.db.system.get("_storage", image.storageId);
  if (!metadata || metadata.size !== image.size || metadata.sha256 !== image.sha256 ||
      (metadata.contentType !== undefined && metadata.contentType !== image.contentType)) throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
}

export function portfolioImageDto(image: Doc<"portfolioImages">) {
  return {
    imageId: image._id, companyId: image.companyId, portfolioProjectId: image.portfolioProjectId,
    purpose: image.purpose, gallerySlotId: image.gallerySlotId ?? null,
    contentType: image.contentType, size: image.size, sha256: image.sha256,
    uploadedBy: image.uploadedBy, uploadedAt: image.uploadedAt, moderationStatus: image.moderationStatus,
    moderatedBy: image.moderatedBy ?? null, moderatedAt: image.moderatedAt ?? null,
    reason: image.moderationReason ?? null, previewUrl: portfolioImageHttpUrl(`private/${image._id}`),
  };
}
