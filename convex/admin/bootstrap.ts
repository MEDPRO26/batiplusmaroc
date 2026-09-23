import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";

const BOOTSTRAP_CONFIRMATION = "PROMOTE_FIRST_BATIPLUS_ADMIN";

/**
 * Operator-only first-admin bootstrap. This is internal, so browsers and the
 * public Convex API cannot invoke it; use the authenticated Convex CLI against
 * an explicitly selected deployment.
 */
export const promoteFirstAdmin = internalMutation({
  args: {
    email: v.string(),
    confirmation: v.string(),
  },
  returns: v.object({
    userId: v.id("users"),
    email: v.string(),
    alreadyAdmin: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.confirmation !== BOOTSTRAP_CONFIRMATION) {
      throw new ConvexError("ADMIN_BOOTSTRAP_CONFIRMATION_REQUIRED");
    }

    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("INVALID_EMAIL");
    }

    const matches = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(2);
    if (matches.length !== 1) {
      throw new ConvexError(matches.length === 0 ? "USER_NOT_FOUND" : "ADMIN_BOOTSTRAP_AMBIGUOUS_EMAIL");
    }

    const target = matches[0];
    const existingAdmins = await ctx.db
      .query("users")
      .withIndex("by_accountType", (q) => q.eq("accountType", "admin"))
      .take(2);

    if (target.accountType === "admin") {
      return { userId: target._id, email, alreadyAdmin: true };
    }
    if (existingAdmins.length > 0) {
      throw new ConvexError("ADMIN_ALREADY_EXISTS");
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      accountType: "admin",
      countryCode: "MA",
      onboardingStatus: "completed",
      createdAt: target.createdAt ?? target._creationTime,
      updatedAt: now,
    });

    return { userId: target._id, email, alreadyAdmin: false };
  },
});
