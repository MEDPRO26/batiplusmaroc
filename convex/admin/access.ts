import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AdminContext = QueryCtx | MutationCtx;

/**
 * Resolves the authenticated Convex Auth user and enforces the stored admin role.
 * Never accepts an identity or role from function arguments.
 */
export async function requireAdminUser(ctx: AdminContext) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");

  const user = await ctx.db.get(userId);
  if (!user || user.accountType !== "admin") {
    throw new ConvexError("ADMIN_REQUIRED");
  }

  return user;
}
