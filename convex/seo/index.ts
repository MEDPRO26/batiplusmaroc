import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireSeoTeamUser } from "./access";

/** Returns only the identity fields required by the future SEO workspace shell. */
export const getSeoSession = query({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    email: v.union(v.string(), v.null()),
    firstName: v.union(v.string(), v.null()),
    lastName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await requireSeoTeamUser(ctx);
    return {
      userId: user._id,
      email: user.email ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    };
  },
});
