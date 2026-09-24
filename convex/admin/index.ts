import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAdminUser } from "./access";

/**
 * Minimal authenticated admin boundary. Future admin modules must call the
 * same role guard before reading or mutating operational data.
 */
export const getAdminSession = query({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    email: v.union(v.string(), v.null()),
    firstName: v.union(v.string(), v.null()),
    lastName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await requireAdminUser(ctx);
    return {
      userId: user._id,
      email: user.email ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    };
  },
});
