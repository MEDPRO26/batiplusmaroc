import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ensureAccountFoundation } from "./accountFoundation";
import { isPublicAccountType } from "./constants";

/** V1 operates only in Morocco — never accept country from the browser. */
const V1_COUNTRY_CODE = "MA" as const;

type AuthProfile = Record<string, unknown> & {
  email?: string;
  emailVerified?: boolean;
};

type CreateOrUpdateAuthUserArgs = {
  existingUserId: Id<"users"> | null;
  type: "oauth" | "credentials" | "email" | "phone" | "verification";
  profile: AuthProfile;
};

export const SEO_TEAM_ACCOUNT_CREATION_MARKER = "internal-seo-team-account" as const;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown) {
  return value === true || value === "true";
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: undefined, lastName: undefined };
  if (parts.length === 1) return { firstName: parts[0], lastName: undefined };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function validatePasswordRequirements(password: string) {
  if (password.length < 8) {
    throw new ConvexError("PASSWORD_TOO_SHORT");
  }
}

export function buildPasswordProfile(params: Record<string, unknown>) {
  const email = asString(params.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConvexError("INVALID_EMAIL");
  }

  if (params.flow !== "signUp") {
    return { email };
  }

  const accountType = params.accountType;
  if (!isPublicAccountType(accountType)) {
    throw new ConvexError("INVALID_ACCOUNT_TYPE");
  }

  if (!asBoolean(params.acceptedTerms)) {
    throw new ConvexError("TERMS_REQUIRED");
  }

  const firstName = asString(params.firstName);
  const lastName = asString(params.lastName);
  if (!firstName || !lastName) {
    throw new ConvexError("INVALID_PROFILE");
  }

  return {
    email,
    name: `${firstName} ${lastName}`,
    firstName,
    lastName,
    countryCode: V1_COUNTRY_CODE,
    accountType,
    acceptedTerms: true,
    marketingOptIn: asBoolean(params.marketingOptIn),
  };
}

async function usersWithEmail(ctx: MutationCtx, email: string) {
  return await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(2);
}

/**
 * Owns account linking for Convex Auth. A new Google identity may attach to an
 * existing user only when that user's email was already verified.
 */
export async function createOrUpdateAuthUser(
  ctx: MutationCtx,
  args: CreateOrUpdateAuthUserArgs,
) {
  const now = Date.now();

  if (args.existingUserId) {
    const existing = await ctx.db.get(args.existingUserId);
    if (!existing) {
      throw new ConvexError("USER_NOT_FOUND");
    }
    const profileName = typeof args.profile.name === "string" ? args.profile.name : "";
    const profileNames = splitName(profileName);
    await ctx.db.patch(args.existingUserId, {
      email:
        typeof args.profile.email === "string"
          ? args.profile.email.trim().toLowerCase()
          : existing.email,
      name: profileName || existing.name,
      image: typeof args.profile.image === "string" ? args.profile.image : existing.image,
      firstName: existing.firstName ?? profileNames.firstName,
      lastName: existing.lastName ?? profileNames.lastName,
      countryCode: V1_COUNTRY_CODE,
      termsAcceptedAt:
        existing.termsAcceptedAt ??
        (existing.acceptedTerms === true ? existing._creationTime : undefined),
      marketingOptIn: existing.marketingOptIn === true,
      onboardingStatus: existing.onboardingStatus ?? "pending",
      createdAt: existing.createdAt ?? existing._creationTime,
      updatedAt: now,
    });
    if (isPublicAccountType(existing.accountType)) {
      await ensureAccountFoundation(ctx, {
        userId: args.existingUserId,
        accountType: existing.accountType,
        now,
      });
    }
    return args.existingUserId;
  }

  // Only the internal SEO account action can construct this profile. Public
  // password signup goes through buildPasswordProfile(), which deliberately
  // accepts only client/company and never copies this marker from input.
  if (
    args.type === "credentials" &&
    args.profile.accountType === "seo_team" &&
    args.profile.internalAccountCreation === SEO_TEAM_ACCOUNT_CREATION_MARKER
  ) {
    const email = asString(args.profile.email).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("INVALID_EMAIL");
    }

    const matches = await usersWithEmail(ctx, email);
    if (matches.length > 1) {
      throw new ConvexError("SEO_ACCOUNT_AMBIGUOUS_EMAIL");
    }
    const existing = matches[0];
    if (existing) {
      if (existing.accountType !== "seo_team") {
        throw new ConvexError("SEO_ACCOUNT_TYPE_CONFLICT");
      }
      await ctx.db.patch(existing._id, {
        countryCode: V1_COUNTRY_CODE,
        onboardingStatus: "completed",
        createdAt: existing.createdAt ?? existing._creationTime,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      email,
      countryCode: V1_COUNTRY_CODE,
      accountType: "seo_team",
      marketingOptIn: false,
      onboardingStatus: "completed",
      createdAt: now,
      updatedAt: now,
    });
  }

  // OAuth (Google): create or link by an email that was already verified on
  // the existing Batiplus user. Never upgrade an unverified password account.
  if (args.type === "oauth") {
    const email = asString(args.profile.email).toLowerCase();
    if (!email) {
      throw new ConvexError("INVALID_EMAIL");
    }

    const matches = await usersWithEmail(ctx, email);
    if (matches.length > 1) {
      throw new ConvexError("OAUTH_ACCOUNT_LINKING_BLOCKED");
    }

    const linked = matches[0];
    if (linked) {
      if (linked.emailVerificationTime === undefined) {
        throw new ConvexError("OAUTH_ACCOUNT_LINKING_BLOCKED");
      }
      const profileName = typeof args.profile.name === "string" ? args.profile.name : "";
      const profileNames = splitName(profileName);
      await ctx.db.patch(linked._id, {
        email,
        name: profileName || linked.name,
        image: typeof args.profile.image === "string" ? args.profile.image : linked.image,
        firstName: linked.firstName ?? profileNames.firstName,
        lastName: linked.lastName ?? profileNames.lastName,
        countryCode: V1_COUNTRY_CODE,
        termsAcceptedAt:
          linked.termsAcceptedAt ??
          (linked.acceptedTerms === true ? linked._creationTime : undefined),
        marketingOptIn: linked.marketingOptIn === true,
        onboardingStatus: linked.onboardingStatus ?? "pending",
        createdAt: linked.createdAt ?? linked._creationTime,
        updatedAt: now,
      });
      if (isPublicAccountType(linked.accountType)) {
        await ensureAccountFoundation(ctx, {
          userId: linked._id,
          accountType: linked.accountType,
          now,
        });
      }
      return linked._id;
    }

    const fullName = typeof args.profile.name === "string" ? args.profile.name : "";
    const { firstName, lastName } = splitName(fullName);

    return await ctx.db.insert("users", {
      email,
      name: fullName || undefined,
      image: typeof args.profile.image === "string" ? args.profile.image : undefined,
      firstName,
      lastName,
      countryCode: V1_COUNTRY_CODE,
      emailVerificationTime: now,
      marketingOptIn: false,
      onboardingStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Password / credentials signup.
  const accountType = args.profile.accountType;
  if (!isPublicAccountType(accountType)) {
    throw new ConvexError("INVALID_ACCOUNT_TYPE");
  }
  if (args.profile.acceptedTerms !== true) {
    throw new ConvexError("TERMS_REQUIRED");
  }

  const userId = await ctx.db.insert("users", {
    email: typeof args.profile.email === "string" ? args.profile.email : undefined,
    name: typeof args.profile.name === "string" ? args.profile.name : undefined,
    firstName: typeof args.profile.firstName === "string" ? args.profile.firstName : undefined,
    lastName: typeof args.profile.lastName === "string" ? args.profile.lastName : undefined,
    countryCode: V1_COUNTRY_CODE,
    accountType,
    acceptedTerms: true,
    termsAcceptedAt: now,
    marketingOptIn: args.profile.marketingOptIn === true,
    onboardingStatus: "pending",
    createdAt: now,
    updatedAt: now,
  });
  await ensureAccountFoundation(ctx, { userId, accountType, now });
  return userId;
}
