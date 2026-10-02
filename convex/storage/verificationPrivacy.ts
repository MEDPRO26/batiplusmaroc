import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

/** Prevent private verification IDs from being reused through another file API. */
export async function assertNotVerificationStorage(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">) {
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
    if (error instanceof ConvexError && error.data === "PRIVATE_VERIFICATION_FILE") return null;
    throw error;
  }
  return ctx.storage.getUrl(storageId);
}
