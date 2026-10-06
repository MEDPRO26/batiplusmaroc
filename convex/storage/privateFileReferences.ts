import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertNotVerificationStorage } from "./verificationPrivacy";

/** Read every persistent private-file reference in the deletion transaction. */
export async function assertUnreferencedPrivateFile(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">) {
  await assertNotVerificationStorage(ctx, storageId);
  const references = await Promise.all([
    ctx.db.query("projectAttachments").withIndex("by_storageId", q => q.eq("storageId", storageId)).first(),
    ctx.db.query("messageAttachments").withIndex("by_storageId", q => q.eq("storageId", storageId)).first(),
    ctx.db.query("finalQuoteRevisions").withIndex("by_pdfStorageId", q => q.eq("pdfStorageId", storageId)).first(),
  ]);
  if (references.some(Boolean)) throw new ConvexError("PRIVATE_FILE_REFERENCED");
}
