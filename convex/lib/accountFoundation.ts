import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { PublicAccountType } from "./constants";

type FoundationResult =
  | { accountType: "client"; clientProfileId: Id<"clientProfiles"> }
  | {
      accountType: "company";
      companyId: Id<"companies">;
      companyMemberId: Id<"companyMembers">;
    };

/**
 * Creates the domain-side account foundation inside the caller's transaction.
 * Replays are idempotent, while conflicting or corrupt cross-role state fails
 * closed instead of silently creating a second profile or membership.
 */
export async function ensureAccountFoundation(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    accountType: PublicAccountType;
    now: number;
  },
): Promise<FoundationResult> {
  const user = await ctx.db.get(args.userId);
  if (!user) {
    throw new ConvexError("USER_NOT_FOUND");
  }
  if (user.accountType !== args.accountType) {
    throw new ConvexError("ACCOUNT_TYPE_MISMATCH");
  }

  const clientProfiles = await ctx.db
    .query("clientProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .take(2);
  const memberships = await ctx.db
    .query("companyMembers")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .take(2);

  if (clientProfiles.length > 1 || memberships.length > 1) {
    throw new ConvexError("DUPLICATE_ACCOUNT_FOUNDATION");
  }

  if (args.accountType === "client") {
    if (memberships.length > 0) {
      throw new ConvexError("ACCOUNT_TYPE_MISMATCH");
    }
    const existing = clientProfiles[0];
    if (existing) {
      return { accountType: "client", clientProfileId: existing._id };
    }
    const clientProfileId = await ctx.db.insert("clientProfiles", {
      userId: args.userId,
      onboardingStatus: "pending",
      createdAt: args.now,
      updatedAt: args.now,
    });
    return { accountType: "client", clientProfileId };
  }

  if (clientProfiles.length > 0) {
    throw new ConvexError("ACCOUNT_TYPE_MISMATCH");
  }
  const existingMembership = memberships[0];
  if (existingMembership) {
    const company = await ctx.db.get(existingMembership.companyId);
    if (!company || existingMembership.role !== "owner" || existingMembership.status !== "active") {
      throw new ConvexError("INVALID_COMPANY_MEMBERSHIP");
    }
    return {
      accountType: "company",
      companyId: company._id,
      companyMemberId: existingMembership._id,
    };
  }

  const companyId = await ctx.db.insert("companies", {
    onboardingStatus: "pending",
    verificationStatus: "draft",
    createdAt: args.now,
    updatedAt: args.now,
  });
  const companyMemberId = await ctx.db.insert("companyMembers", {
    companyId,
    userId: args.userId,
    role: "owner",
    status: "active",
    createdAt: args.now,
  });
  return { accountType: "company", companyId, companyMemberId };
}
