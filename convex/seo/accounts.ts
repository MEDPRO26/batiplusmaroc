import { createAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import {
  SEO_TEAM_ACCOUNT_CREATION_MARKER,
  validatePasswordRequirements,
} from "../lib/authSecurity";

const CREATE_CONFIRMATION = "CREATE_BATIPLUS_SEO_TEAM";
const PROVISION_CONFIRMATION = "PROVISION_BATIPLUS_SEO_TEAM";
const REVOCATION_CONFIRMATION = "REVOKE_BATIPLUS_SEO_TEAM";

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConvexError("INVALID_EMAIL");
  }
  return email;
}

type CreationState =
  | { status: "available" }
  | { status: "seo_team"; userId: Id<"users"> }
  | { status: "conflict" }
  | { status: "ambiguous" };

export const getSeoAccountCreationState = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.object({ status: v.literal("available") }),
    v.object({ status: v.literal("seo_team"), userId: v.id("users") }),
    v.object({ status: v.literal("conflict") }),
    v.object({ status: v.literal("ambiguous") }),
  ),
  handler: async (ctx, args): Promise<CreationState> => {
    const matches = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .take(2);
    if (matches.length > 1) return { status: "ambiguous" };
    const user = matches[0];
    if (!user) return { status: "available" };
    return user.accountType === "seo_team"
      ? { status: "seo_team", userId: user._id }
      : { status: "conflict" };
  },
});

/**
 * Deployment-operator-only creation of a complete SEO password account.
 * createAccount delegates hashing and credential storage to the configured
 * Convex Auth Password provider; this function never stores the password.
 */
export const createSeoTeamAccount = internalAction({
  args: { email: v.string(), password: v.string(), confirmation: v.string() },
  returns: v.object({
    userId: v.id("users"),
    email: v.string(),
    alreadyExists: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ userId: Id<"users">; email: string; alreadyExists: boolean }> => {
    if (args.confirmation !== CREATE_CONFIRMATION) {
      throw new ConvexError("SEO_CREATE_CONFIRMATION_REQUIRED");
    }

    const email = normalizeEmail(args.email);
    validatePasswordRequirements(args.password);
    const state: CreationState = await ctx.runQuery(
      internal.seo.accounts.getSeoAccountCreationState,
      { email },
    );
    if (state.status === "ambiguous") {
      throw new ConvexError("SEO_ACCOUNT_AMBIGUOUS_EMAIL");
    }
    if (state.status === "conflict") {
      throw new ConvexError("SEO_ACCOUNT_TYPE_CONFLICT");
    }

    try {
      const profile = {
        email,
        accountType: "seo_team",
        internalAccountCreation: SEO_TEAM_ACCOUNT_CREATION_MARKER,
      } as const;
      const created = await createAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: email, secret: args.password },
        profile,
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      });
      if (created.user.accountType !== "seo_team") {
        throw new ConvexError("SEO_ACCOUNT_TYPE_CONFLICT");
      }
      return {
        userId: created.user._id,
        email,
        alreadyExists: state.status === "seo_team",
      };
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      if (state.status === "seo_team") {
        throw new ConvexError("SEO_PASSWORD_ACCOUNT_EXISTS");
      }
      throw error;
    }
  },
});

/**
 * Operator-only provisioning for an existing role-free Convex Auth identity.
 * Public clients cannot invoke internal mutations.
 */
export const provisionSeoTeamUser = internalMutation({
  args: { email: v.string(), confirmation: v.string() },
  returns: v.object({
    userId: v.id("users"),
    email: v.string(),
    alreadyProvisioned: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.confirmation !== PROVISION_CONFIRMATION) {
      throw new ConvexError("SEO_PROVISION_CONFIRMATION_REQUIRED");
    }

    const email = normalizeEmail(args.email);
    const matches = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(2);
    if (matches.length !== 1) {
      throw new ConvexError(matches.length === 0 ? "USER_NOT_FOUND" : "SEO_ACCOUNT_AMBIGUOUS_EMAIL");
    }

    const target = matches[0];
    if (target.accountType === "seo_team") {
      return { userId: target._id, email, alreadyProvisioned: true };
    }
    if (target.accountType !== undefined) {
      throw new ConvexError("SEO_ACCOUNT_TYPE_CONFLICT");
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      accountType: "seo_team",
      countryCode: "MA",
      onboardingStatus: "completed",
      createdAt: target.createdAt ?? target._creationTime,
      updatedAt: now,
    });

    return { userId: target._id, email, alreadyProvisioned: false };
  },
});

/** Removes SEO access immediately while preserving the underlying auth identity. */
export const revokeSeoTeamUser = internalMutation({
  args: { email: v.string(), confirmation: v.string() },
  returns: v.object({
    userId: v.id("users"),
    email: v.string(),
    alreadyRevoked: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.confirmation !== REVOCATION_CONFIRMATION) {
      throw new ConvexError("SEO_REVOCATION_CONFIRMATION_REQUIRED");
    }

    const email = normalizeEmail(args.email);
    const matches = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(2);
    if (matches.length !== 1) {
      throw new ConvexError(matches.length === 0 ? "USER_NOT_FOUND" : "SEO_ACCOUNT_AMBIGUOUS_EMAIL");
    }

    const target = matches[0];
    if (target.accountType === undefined) {
      return { userId: target._id, email, alreadyRevoked: true };
    }
    if (target.accountType !== "seo_team") {
      throw new ConvexError("SEO_ACCOUNT_TYPE_CONFLICT");
    }

    await ctx.db.patch(target._id, {
      accountType: undefined,
      onboardingStatus: "pending",
      updatedAt: Date.now(),
    });

    return { userId: target._id, email, alreadyRevoked: false };
  },
});
