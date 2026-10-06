import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

/** Prevent private verification, logo, cover and portfolio IDs from being reused through another file API. */
export async function assertNotVerificationStorage(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">) {
  const cover = await ctx.db.query("companyCoverImages")
    .withIndex("by_storageId", q => q.eq("storageId", storageId)).first();
  if (cover) throw new ConvexError("PRIVATE_COMPANY_COVER_FILE");
  const portfolio = await ctx.db.query("portfolioImages")
    .withIndex("by_storageId", q => q.eq("storageId", storageId)).first();
  if (portfolio) throw new ConvexError("PRIVATE_PORTFOLIO_IMAGE_FILE");
  const logo = await ctx.db.query("companyLogoImages")
    .withIndex("by_storageId", q => q.eq("storageId", storageId)).first();
  if (logo) throw new ConvexError("PRIVATE_COMPANY_LOGO_FILE");
  const document = await ctx.db.query("companyVerificationDocuments")
    .withIndex("by_storageId", q => q.eq("storageId", storageId)).first();
  const upload = await ctx.db.query("companyVerificationUploadIntents")
    .withIndex("by_storageId", q => q.eq("storageId", storageId)).first();
  if (document || upload) throw new ConvexError("PRIVATE_VERIFICATION_FILE");
}

export async function getNonVerificationStorageUrl(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">) {
  try {
    await assertNotVerificationStorage(ctx, storageId);
  } catch (error) {
    if (error instanceof ConvexError && ["PRIVATE_VERIFICATION_FILE", "PRIVATE_COMPANY_LOGO_FILE", "PRIVATE_PORTFOLIO_IMAGE_FILE", "PRIVATE_COMPANY_COVER_FILE"].includes(String(error.data))) return null;
    throw error;
  }
  return ctx.storage.getUrl(storageId);
}
