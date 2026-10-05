import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { notificationIdentityForRecipient } from "./companyIdentity";
import {
  notificationEntityValidator,
  notificationPayloadValidator,
  notificationTypeValidator,
} from "./constants";

const MAX_PAGE_SIZE = 50;

const notificationValidator = v.object({
  id: v.id("notifications"),
  type: notificationTypeValidator,
  entity: notificationEntityValidator,
  projectId: v.union(v.id("projects"), v.null()),
  payload: notificationPayloadValidator,
  actorUserId: v.union(v.id("users"), v.null()),
  createdAt: v.number(),
  readAt: v.union(v.number(), v.null()),
});

async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  if (!(await ctx.db.get(userId))) throw new ConvexError("USER_NOT_FOUND");
  return userId;
}

async function recipientState(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("notificationRecipientStates")
    .withIndex("by_recipientUserId", (q) => q.eq("recipientUserId", userId))
    .unique();
}

export const listMyNotifications = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(notificationValidator),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > MAX_PAGE_SIZE) {
      throw new ConvexError("INVALID_NOTIFICATION_PAGE_SIZE");
    }
    const userId = await requireUserId(ctx);
    const [state, page] = await Promise.all([
      recipientState(ctx, userId),
      ctx.db
        .query("notifications")
        .withIndex("by_recipientUserId_and_createdAt", (q) => q.eq("recipientUserId", userId))
        .order("desc")
        .paginate(args.paginationOpts),
    ]);
    return {
      ...page,
      page: await Promise.all(page.page.map(async (notification) => {
        const [proposal, identity] = await Promise.all([
          notification.entity.type === "proposal" ? ctx.db.get(notification.entity.id) : null,
          notificationIdentityForRecipient(ctx, notification),
        ]);
        return {
          id: notification._id,
          type: notification.type,
          entity: notification.entity,
          projectId: proposal?.projectId ?? null,
          payload: identity.payload,
          actorUserId: notification.actorUserId ?? null,
          createdAt: notification.createdAt,
          readAt: notification.readAt ?? (
            state?.readThroughAt !== undefined && notification.createdAt <= state.readThroughAt
              ? state.readThroughAt
              : null
          ),
        };
      })),
    };
  },
});

export const getMyUnreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return (await recipientState(ctx, userId))?.unreadCount ?? 0;
  },
});

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.object({ changed: v.boolean(), readAt: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.recipientUserId !== userId) {
      throw new ConvexError("NOTIFICATION_NOT_FOUND");
    }
    const state = await recipientState(ctx, userId);
    const logicalReadAt = notification.readAt ?? (
      state?.readThroughAt !== undefined && notification.createdAt <= state.readThroughAt
        ? state.readThroughAt
        : undefined
    );
    if (logicalReadAt !== undefined) return { changed: false, readAt: logicalReadAt };

    const now = Date.now();
    await ctx.db.patch(notification._id, { readAt: now });
    if (state) {
      await ctx.db.patch(state._id, {
        unreadCount: Math.max(0, state.unreadCount - 1),
        updatedAt: now,
      });
    }
    return { changed: true, readAt: now };
  },
});

export const markAllNotificationsRead = mutation({
  args: {},
  returns: v.object({ markedCount: v.number(), readAt: v.number() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const state = await recipientState(ctx, userId);
    const now = Math.max(Date.now(), (state?.readThroughAt ?? 0) + 1);
    if (state) {
      await ctx.db.patch(state._id, { readThroughAt: now, unreadCount: 0, updatedAt: now });
    } else {
      await ctx.db.insert("notificationRecipientStates", {
        recipientUserId: userId,
        readThroughAt: now,
        unreadCount: 0,
        updatedAt: now,
      });
    }
    return { markedCount: state?.unreadCount ?? 0, readAt: now };
  },
});
