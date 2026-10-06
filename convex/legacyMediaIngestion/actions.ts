"use node";

import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { COMPANY_LOGO_MAX_BYTES, PUBLIC_MEDIA_MAX_BYTES, validatePublicImageInput } from "../storage/constants";
import { matchesImageSignature } from "../storage/imageValidation";
import { readLegacyImageObject } from "../storage/r2Client";
import { requestValidator, resultValidator, sourceValidator } from "./constants";
import { imagePurpose, sha256 } from "./model";

type Reservation = { result: typeof resultValidator.type; attemptId: string | null; source: typeof sourceValidator.type | null };

/** One Admin-triggered copy. No batch, public URL fetch, deletion or automatic approval. */
export const ingest = action({
  args: requestValidator.fields, returns: resultValidator,
  handler: async (ctx, args): Promise<typeof resultValidator.type> => {
    const reservation: Reservation = await ctx.runMutation(internal.legacyMediaIngestion.index.begin, args);
    if (!reservation.attemptId || !reservation.source) return reservation.result;
    const ingestionId = reservation.result.ingestionId;
    const attemptId = reservation.attemptId;
    let storageId: Id<"_storage"> | undefined;
    try {
      const source = reservation.source;
      let bytes: Uint8Array;
      let contentType: string;
      let sourceEtag: string | undefined;
      if (args.provider === "r2" && source.objectKey) {
        const read = await readLegacyImageObject(source.objectKey, args.mediaType === "companyLogo" ? COMPANY_LOGO_MAX_BYTES : PUBLIC_MEDIA_MAX_BYTES);
        bytes = read.bytes; contentType = read.contentType; sourceEtag = read.etag;
      } else if (args.provider === "convex" && source.storageId && source.size &&
          validatePublicImageInput(imagePurpose(args.mediaType), source.contentType ?? "image/png", source.size)) {
        const blob = await ctx.storage.get(source.storageId);
        if (!blob || blob.size !== source.size || (blob.type && source.contentType && blob.type !== source.contentType)) throw new Error("Invalid legacy source");
        bytes = new Uint8Array(await blob.arrayBuffer()); contentType = source.contentType ?? blob.type;
      } else throw new Error("Legacy source unavailable");
      if (!validatePublicImageInput(imagePurpose(args.mediaType), contentType, bytes.byteLength) || !matchesImageSignature(contentType, bytes)) {
        throw new Error("Invalid legacy image bytes");
      }
      const hash = await sha256(bytes);
      storageId = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: contentType }));
      return await ctx.runMutation(internal.legacyMediaIngestion.index.finish, {
        ingestionId, attemptId, storageId, contentType: contentType as "image/jpeg" | "image/png" | "image/webp",
        size: bytes.byteLength, sha256: hash, sourceEtag,
      });
    } catch {
      // Never persist or return provider exception messages (credentials/keys can appear in them).
      if (storageId) {
        try { await ctx.runMutation(internal.legacyMediaIngestion.index.cleanupCopy, { ingestionId, storageId }); }
        catch { await ctx.runMutation(internal.legacyMediaIngestion.index.scheduleCleanup, { ingestionId, storageId }); }
      }
      const result: typeof resultValidator.type = await ctx.runMutation(internal.legacyMediaIngestion.index.fail, { ingestionId, attemptId });
      if (result.status === "processing") throw new ConvexError("LEGACY_MEDIA_STALE_ATTEMPT");
      return result;
    }
  },
});
