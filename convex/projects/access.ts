import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function requireClientByUserId(ctx: Ctx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.accountType !== "client") throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
  if (user.onboardingStatus !== "completed") throw new ConvexError("CLIENT_ONBOARDING_REQUIRED");
  return user;
}

export async function requireClientUser(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  const user = await requireClientByUserId(ctx, userId);
  return { userId, user };
}

export async function requireOwnedProject(ctx: Ctx, userId: Id<"users">, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project || project.clientId !== userId) throw new ConvexError("PROJECT_NOT_FOUND");
  return project;
}

export async function requireOwnedDraft(ctx: Ctx, userId: Id<"users">, projectId: Id<"projects">) {
  const project = await requireOwnedProject(ctx, userId, projectId);
  if (project.status !== "draft") throw new ConvexError("PROJECT_NOT_EDITABLE");
  return project;
}
