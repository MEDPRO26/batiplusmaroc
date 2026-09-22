import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { PublicMediaPurpose } from "./constants";

type DatabaseCtx = QueryCtx | MutationCtx;

export async function requireOwnerCompanyByUserId(
  ctx: DatabaseCtx,
  userId: Id<"users">,
) {
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.accountType !== "company") throw new ConvexError("COMPANY_ACCOUNT_REQUIRED");

  const memberships = await ctx.db
    .query("companyMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(2);
  if (memberships.length !== 1) {
    throw new ConvexError(
      memberships.length === 0 ? "COMPANY_MEMBERSHIP_REQUIRED" : "DUPLICATE_ACCOUNT_FOUNDATION",
    );
  }
  const membership = memberships[0];
  if (membership.role !== "owner" || membership.status !== "active") {
    throw new ConvexError("COMPANY_OWNER_REQUIRED");
  }
  const company = await ctx.db.get(membership.companyId);
  if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
  return { company, membership, user };
}

export async function consumeVerifiedPublicMediaIntent(
  ctx: MutationCtx,
  args: {
    uploadToken: string;
    companyId: Id<"companies">;
    userId: Id<"users">;
    purpose: PublicMediaPurpose;
    portfolioProjectId?: Id<"portfolioProjects">;
  },
) {
  const intent = await ctx.db
    .query("publicMediaUploadIntents")
    .withIndex("by_token", (q) => q.eq("token", args.uploadToken))
    .unique();
  const now = Date.now();
  if (
    !intent ||
    intent.companyId !== args.companyId ||
    intent.userId !== args.userId ||
    intent.purpose !== args.purpose ||
    (intent.portfolioProjectId !== undefined &&
      intent.portfolioProjectId !== args.portfolioProjectId) ||
    intent.claimedAt !== undefined ||
    intent.verifiedAt === undefined ||
    intent.expiresAt < now
  ) {
    throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
  }

  const mediaId = await ctx.db.insert("publicMedia", {
    storageProvider: "r2",
    companyId: intent.companyId,
    portfolioProjectId: args.portfolioProjectId,
    purpose: intent.purpose,
    objectKey: intent.objectKey,
    mimeType: intent.expectedContentType,
    size: intent.expectedSize,
    etag: intent.etag,
    uploadedBy: intent.userId,
    createdAt: now,
  });
  await ctx.db.patch(intent._id, { claimedAt: now });
  return mediaId;
}
