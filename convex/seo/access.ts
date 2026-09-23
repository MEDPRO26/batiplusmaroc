import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type SeoTeamContext = QueryCtx | MutationCtx;

/**
 * Resolves the authenticated Convex Auth user and enforces the exact SEO role.
 * Admin is intentionally not an allowed substitute for seo_team.
 */
export async function requireSeoTeamUser(ctx: SeoTeamContext) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");

  const user = await ctx.db.get(userId);
  if (!user || user.accountType !== "seo_team") {
    throw new ConvexError("SEO_TEAM_REQUIRED");
  }

  return user;
}
