"use node";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { retireLegacyImageObject } from "../storage/r2Client";
import { retirementRequestValidator, retirementResultValidator } from "./retirementConstants";

export const retire = action({
  args: retirementRequestValidator.fields, returns: retirementResultValidator,
  handler: async (ctx, args): Promise<typeof retirementResultValidator.type> => {
    const reservation = await ctx.runMutation(internal.legacyMediaIngestion.retirement.reserve, args);
    if (!reservation.attemptId || !reservation.source) return reservation.result;
    const attempt = { ingestionId: args.ingestionId, attemptId: reservation.attemptId };
    try {
      if (reservation.source.provider === "convex") return await ctx.runMutation(internal.legacyMediaIngestion.retirement.retireNative, attempt);
      await retireLegacyImageObject({ objectKey: reservation.source.sourceRef, etag: reservation.source.sourceEtag!,
        size: reservation.source.size, contentType: reservation.source.contentType }, async () => {
        await ctx.runMutation(internal.legacyMediaIngestion.retirement.authorizeDeletion, attempt);
      });
      return await ctx.runMutation(internal.legacyMediaIngestion.retirement.finishR2, attempt);
    } catch {
      // Provider exceptions can include credentials/keys. A confirmed-but-uncommitted delete
      // remains retryable; retry rechecks preservation and recognizes provider not-found.
      return await ctx.runMutation(internal.legacyMediaIngestion.retirement.fail, attempt);
    }
  },
});
