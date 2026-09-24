import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ensureAccountFoundation } from "./lib/accountFoundation";
import { clientInitials, toPublicClientProfile } from "./lib/clientPublicShape";
import { getPublicMediaUrl } from "./storage/publicUrl";

const onboardingProfileValidator = v.union(
  v.null(),
  v.object({
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    city: v.string(),
    onboardingStatus: v.union(v.literal("pending"), v.literal("completed")),
  }),
);

const privateProfileValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  initials: v.string(),
  profilePhotoUrl: v.union(v.string(), v.null()),
  city: v.string(),
  phone: v.string(),
  email: v.string(),
  joinedAt: v.number(),
  projectsPostedCount: v.number(),
  projectsCompletedCount: v.number(),
});

const publicClientValidator = v.union(
  v.null(),
  v.object({
    firstName: v.string(),
    lastInitial: v.string(),
    displayName: v.string(),
    city: v.union(v.string(), v.null()),
    joinedAt: v.number(),
    projectsPostedCount: v.number(),
    projectsCompletedCount: v.number(),
  }),
);

function normalizeName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length < 1 ||
    normalized.length > 80 ||
    !/^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u.test(normalized)
  ) {
    throw new ConvexError("INVALID_NAME");
  }
  return normalized;
}

function normalizeCity(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length < 2 ||
    normalized.length > 80 ||
    !/^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u.test(normalized)
  ) {
    throw new ConvexError("INVALID_CITY");
  }
  return normalized;
}

function normalizeMoroccanPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("00212") ? `+212${compact.slice(5)}` : compact;
  if (!/^(?:\+212[5-7]\d{8}|0[5-7]\d{8})$/.test(normalized)) {
    throw new ConvexError("INVALID_PHONE");
  }
  return normalized;
}

async function requireClientUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("NOT_AUTHENTICATED");
  }
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("USER_NOT_FOUND");
  }
  if (user.accountType !== "client") {
    throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
  }
  return { userId, user };
}

async function getOwnedClientProfile(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const profiles = await ctx.db
    .query("clientProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(2);
  if (profiles.length > 1) {
    throw new ConvexError("DUPLICATE_ACCOUNT_FOUNDATION");
  }
  return profiles[0] ?? null;
}

async function deriveProjectStats(ctx: QueryCtx | MutationCtx, clientId: Id<"users">) {
  // Bound per-client project list; V1 clients will not approach this ceiling.
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .take(500);

  let projectsPostedCount = 0;
  let projectsCompletedCount = 0;
  for (const project of projects) {
    if (project.status !== "draft") {
      projectsPostedCount += 1;
    }
    if (project.status === "completed") {
      projectsCompletedCount += 1;
    }
  }
  return { projectsPostedCount, projectsCompletedCount };
}

async function consumeVerifiedAvatarIntent(
  ctx: MutationCtx,
  args: { uploadToken: string; userId: Id<"users"> },
) {
  const intent = await ctx.db
    .query("clientAvatarUploadIntents")
    .withIndex("by_token", (q) => q.eq("token", args.uploadToken))
    .unique();
  const now = Date.now();
  if (
    !intent ||
    intent.userId !== args.userId ||
    intent.claimedAt !== undefined ||
    intent.verifiedAt === undefined ||
    intent.expiresAt < now ||
    !intent.objectKey.startsWith(`clients/${args.userId}/avatar/`)
  ) {
    throw new ConvexError("INVALID_CLIENT_AVATAR");
  }

  await ctx.db.patch(intent._id, { claimedAt: now });
  return {
    objectKey: intent.objectKey,
    mimeType: intent.expectedContentType,
    size: intent.expectedSize,
  };
}

export const getOnboardingProfile = query({
  args: {},
  returns: onboardingProfileValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;
    if (user.accountType !== "client") {
      throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
    }

    const profile = await getOwnedClientProfile(ctx, userId);

    return {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      city: profile?.city ?? "",
      onboardingStatus: profile?.onboardingStatus ?? user.onboardingStatus ?? "pending",
    };
  },
});

export const getMyProfile = query({
  args: {},
  returns: v.union(v.null(), privateProfileValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;
    if (user.accountType !== "client") {
      throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
    }

    const profile = await getOwnedClientProfile(ctx, userId);
    const stats = await deriveProjectStats(ctx, userId);
    const firstName = user.firstName ?? "";
    const lastName = user.lastName ?? "";
    const joinedAt = profile?.createdAt ?? user.createdAt ?? user._creationTime;

    return {
      firstName,
      lastName,
      initials: clientInitials(firstName, lastName),
      profilePhotoUrl: profile?.avatarObjectKey
        ? getPublicMediaUrl(profile.avatarObjectKey)
        : null,
      city: profile?.city ?? "",
      phone: user.phone ?? "",
      email: user.email ?? "",
      joinedAt,
      projectsPostedCount: stats.projectsPostedCount,
      projectsCompletedCount: stats.projectsCompletedCount,
    };
  },
});

/**
 * Safe public client data for later project pages.
 * Never returns phone, email, avatar, or other private fields.
 */
export const getPublicClient = query({
  args: { userId: v.id("users") },
  returns: publicClientValidator,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.accountType !== "client") return null;

    const profile = await getOwnedClientProfile(ctx, args.userId);
    const stats = await deriveProjectStats(ctx, args.userId);
    return toPublicClientProfile({
      user,
      profile,
      projectsPostedCount: stats.projectsPostedCount,
      projectsCompletedCount: stats.projectsCompletedCount,
    });
  },
});

export const completeOnboarding = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    city: v.string(),
  },
  returns: v.object({
    onboardingStatus: v.literal("completed"),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const firstName = normalizeName(args.firstName);
    const lastName = normalizeName(args.lastName);
    const phone = normalizeMoroccanPhone(args.phone);
    const city = normalizeCity(args.city);
    const now = Date.now();

    const foundation = await ensureAccountFoundation(ctx, {
      userId,
      accountType: "client",
      now,
    });
    if (foundation.accountType !== "client") {
      throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
    }

    await ctx.db.patch(userId, {
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone,
      onboardingStatus: "completed",
      updatedAt: now,
    });
    await ctx.db.patch(foundation.clientProfileId, {
      city,
      onboardingStatus: "completed",
      updatedAt: now,
    });

    return { onboardingStatus: "completed" as const };
  },
});

export const updateMyProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    city: v.string(),
    avatarUploadToken: v.optional(v.string()),
    removeAvatar: v.optional(v.boolean()),
  },
  returns: v.object({ updated: v.literal(true) }),
  handler: async (ctx, args) => {
    const { userId, user } = await requireClientUser(ctx);
    if (user.onboardingStatus !== "completed") {
      throw new ConvexError("CLIENT_ONBOARDING_REQUIRED");
    }
    if (args.avatarUploadToken && args.removeAvatar) {
      throw new ConvexError("INVALID_CLIENT_AVATAR");
    }

    const firstName = normalizeName(args.firstName);
    const lastName = normalizeName(args.lastName);
    const phone = normalizeMoroccanPhone(args.phone);
    const city = normalizeCity(args.city);
    const now = Date.now();

    const foundation = await ensureAccountFoundation(ctx, {
      userId,
      accountType: "client",
      now,
    });
    if (foundation.accountType !== "client") {
      throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
    }

    const profile = await ctx.db.get(foundation.clientProfileId);
    if (!profile || profile.userId !== userId) {
      throw new ConvexError("USER_NOT_FOUND");
    }

    const previousAvatarKey = profile.avatarObjectKey;
    let avatarPatch: Partial<Doc<"clientProfiles">> = {};

    if (args.avatarUploadToken) {
      const avatar = await consumeVerifiedAvatarIntent(ctx, {
        uploadToken: args.avatarUploadToken,
        userId,
      });
      avatarPatch = {
        avatarObjectKey: avatar.objectKey,
        avatarMimeType: avatar.mimeType,
        avatarSize: avatar.size,
      };
    } else if (args.removeAvatar) {
      avatarPatch = {
        avatarObjectKey: undefined,
        avatarMimeType: undefined,
        avatarSize: undefined,
      };
    }

    await ctx.db.patch(userId, {
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone,
      updatedAt: now,
    });
    await ctx.db.patch(foundation.clientProfileId, {
      city,
      ...avatarPatch,
      updatedAt: now,
    });

    const replacedOrRemoved =
      (args.avatarUploadToken || args.removeAvatar) &&
      previousAvatarKey &&
      previousAvatarKey !== (avatarPatch.avatarObjectKey ?? undefined);
    if (replacedOrRemoved && previousAvatarKey) {
      await ctx.scheduler.runAfter(0, internal.clientAvatarMedia.deleteAvatarObjectIfUnreferenced, {
        objectKey: previousAvatarKey,
      });
    }

    return { updated: true as const };
  },
});
