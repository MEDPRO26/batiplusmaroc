import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";

const threadValidator = v.object({
  id: v.string(),
  title: v.string(),
  preview: v.string(),
  unread: v.boolean(),
  favorite: v.boolean(),
  projectId: v.union(v.string(), v.null()),
});

/**
 * Authenticated inbox list. Threads are created only after mutual interest;
 * V1 returns an empty list until that module is wired.
 */
export const listMyThreads = query({
  args: {},
  returns: v.array(threadValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError("USER_NOT_FOUND");
    }
    if (user.accountType !== "client" && user.accountType !== "company") {
      throw new ConvexError("INVALID_ACCOUNT_TYPE");
    }
    return [];
  },
});
