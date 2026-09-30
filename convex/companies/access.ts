import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertCompanyMarketplaceWriteAllowed } from "./operationalStatus";

type Ctx = QueryCtx | MutationCtx;

/**
 * Resolve the caller's one active Company membership without applying
 * marketplace eligibility rules. Operational support must remain available
 * independently of verification and future suspension state.
 */
export async function requireActiveCompanyMembership(
  ctx: Ctx,
  options: { requireCompletedOnboarding?: boolean } = {},
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");

  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.accountType !== "company") throw new ConvexError("COMPANY_ACCOUNT_REQUIRED");
  if (options.requireCompletedOnboarding && user.onboardingStatus !== "completed") {
    throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
  }

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
  if (membership.status !== "active") throw new ConvexError("COMPANY_MEMBERSHIP_REQUIRED");
  const company = await ctx.db.get(membership.companyId);
  if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
  if (options.requireCompletedOnboarding && company.onboardingStatus !== "completed") {
    throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
  }

  return { user, userId, membership, company };
}

/** Resolve an active, fully-onboarded company membership from server-side identity. */
export async function requireCompanyUser(ctx: Ctx) {
  return await requireActiveCompanyMembership(ctx, { requireCompletedOnboarding: true });
}

/** Reusable guard for the future proposal mutation. */
export async function requireVerifiedCompanyUser(ctx: Ctx) {
  const access = await requireCompanyUser(ctx);
  if (access.company.verificationStatus !== "verified") {
    throw new ConvexError("COMPANY_VERIFICATION_REQUIRED");
  }
  return access;
}

/** Verified Company access for new marketplace acquisition/progression writes. */
export async function requireVerifiedCompanyMarketplaceUser(ctx: Ctx) {
  const access = await requireVerifiedCompanyUser(ctx);
  assertCompanyMarketplaceWriteAllowed(access.company);
  return access;
}
