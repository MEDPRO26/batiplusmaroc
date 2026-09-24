/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildPasswordProfile,
  createOrUpdateAuthUser,
  validatePasswordRequirements,
} from "./lib/authSecurity";
import { ensureAccountFoundation } from "./lib/accountFoundation";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

const validSignup = {
  flow: "signUp",
  email: "person@example.com",
  firstName: "Test",
  lastName: "Person",
  acceptedTerms: true,
  marketingOptIn: false,
};

describe("password signup policy", () => {
  test("rejects invalid and every internal account type", () => {
    expect(() => buildPasswordProfile({ ...validSignup, accountType: "other" })).toThrow(
      "INVALID_ACCOUNT_TYPE",
    );
    expect(() => buildPasswordProfile({ ...validSignup, accountType: "admin" })).toThrow(
      "INVALID_ACCOUNT_TYPE",
    );
    expect(() => buildPasswordProfile({ ...validSignup, accountType: "seo_team" })).toThrow(
      "INVALID_ACCOUNT_TYPE",
    );
  });

  test("requires terms and keeps marketing optional", () => {
    expect(() =>
      buildPasswordProfile({ ...validSignup, accountType: "client", acceptedTerms: false }),
    ).toThrow("TERMS_REQUIRED");

    expect(buildPasswordProfile({ ...validSignup, accountType: "client" })).toMatchObject({
      acceptedTerms: true,
      marketingOptIn: false,
    });
  });

  test("enforces an eight-character password in backend policy", () => {
    expect(() => validatePasswordRequirements("1234567")).toThrow("PASSWORD_TOO_SHORT");
    expect(() => validatePasswordRequirements("12345678")).not.toThrow();
  });
});

describe("Google account linking policy", () => {
  test("does not silently link an unverified password account", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "person@example.com", accountType: "client" }),
    );

    await expect(
      t.run((ctx) =>
        createOrUpdateAuthUser(ctx, {
          existingUserId: null,
          type: "oauth",
          profile: { email: "person@example.com", name: "Google Person" },
        }),
      ),
    ).rejects.toThrow("OAUTH_ACCOUNT_LINKING_BLOCKED");

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.emailVerificationTime).toBeUndefined();
  });

  test("links a verified existing email safely", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "person@example.com",
        emailVerificationTime: 123,
        accountType: "client",
      }),
    );

    const linkedId = await t.run((ctx) =>
      createOrUpdateAuthUser(ctx, {
        existingUserId: null,
        type: "oauth",
        profile: { email: "person@example.com", name: "Google Person" },
      }),
    );

    expect(linkedId).toBe(userId);
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.emailVerificationTime).toBe(123);
  });
});

describe("OAuth finalization policy", () => {
  async function oauthUser(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "oauth@example.com",
        emailVerificationTime: 123,
      }),
    );
  }

  test("cannot create an admin role", async () => {
    const t = convexTest(schema, modules);
    const userId = await oauthUser(t);
    const asUser = t.withIdentity({ subject: `${userId}|test-session` });

    await expect(
      asUser.mutation(api.users.finalizeOAuthSignup, {
        accountType: "admin" as never,
        acceptedTerms: true,
        marketingOptIn: false,
      }),
    ).rejects.toThrow();

    const user = await t.run((ctx) => ctx.db.get(userId as Id<"users">));
    expect(user?.accountType).toBeUndefined();
  });

  test("cannot create an SEO team role", async () => {
    const t = convexTest(schema, modules);
    const userId = await oauthUser(t);
    const asUser = t.withIdentity({ subject: `${userId}|test-session` });

    await expect(
      asUser.mutation(api.users.finalizeOAuthSignup, {
        accountType: "seo_team" as never,
        acceptedTerms: true,
        marketingOptIn: false,
      }),
    ).rejects.toThrow();

    const user = await t.run((ctx) => ctx.db.get(userId as Id<"users">));
    expect(user?.accountType).toBeUndefined();
  });

  test("cannot overwrite an already provisioned SEO account with a public role", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "seo@example.com",
        emailVerificationTime: 123,
        accountType: "seo_team",
      }),
    );
    const asUser = t.withIdentity({ subject: `${userId}|test-session` });

    await expect(
      asUser.mutation(api.users.finalizeOAuthSignup, {
        accountType: "client",
        acceptedTerms: true,
        marketingOptIn: false,
      }),
    ).rejects.toThrow("INVALID_ACCOUNT_TYPE");

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.accountType).toBe("seo_team");
  });

  test("requires terms", async () => {
    const t = convexTest(schema, modules);
    const userId = await oauthUser(t);
    const asUser = t.withIdentity({ subject: `${userId}|test-session` });

    await expect(
      asUser.mutation(api.users.finalizeOAuthSignup, {
        accountType: "client",
        acceptedTerms: false,
        marketingOptIn: false,
      }),
    ).rejects.toThrow("TERMS_REQUIRED");
  });
});

describe("account foundation integration", () => {
  test.each(["client", "company"] as const)(
    "password %s signup atomically creates its account foundation",
    async (accountType) => {
      const t = convexTest(schema, modules);
      const email = `${accountType}@example.com`;

      await t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "signUp",
          email,
          password: "secure-password",
          firstName: "Test",
          lastName: "Person",
          accountType,
          acceptedTerms: "true",
          marketingOptIn: "false",
        },
      });

      const state = await t.run(async (ctx) => {
        const user = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .unique();
        if (!user) throw new Error("Expected signup user");
        const clientProfiles = await ctx.db
          .query("clientProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect();
        const memberships = await ctx.db
          .query("companyMembers")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect();
        const company = memberships[0]
          ? await ctx.db.get(memberships[0].companyId)
          : null;
        return { user, clientProfiles, memberships, company };
      });

      expect(state.user).toMatchObject({
        accountType,
        countryCode: "MA",
        marketingOptIn: false,
        onboardingStatus: "pending",
      });
      expect(state.user.termsAcceptedAt).toEqual(expect.any(Number));
      expect(state.user.createdAt).toEqual(expect.any(Number));
      expect(state.user.updatedAt).toEqual(expect.any(Number));

      if (accountType === "client") {
        expect(state.clientProfiles).toHaveLength(1);
        expect(state.clientProfiles[0]).toMatchObject({ onboardingStatus: "pending" });
        expect(state.memberships).toHaveLength(0);
        expect(state.company).toBeNull();
      } else {
        expect(state.clientProfiles).toHaveLength(0);
        expect(state.memberships).toHaveLength(1);
        expect(state.memberships[0]).toMatchObject({ role: "owner", status: "active" });
        expect(state.company).toMatchObject({
          onboardingStatus: "pending",
          verificationStatus: "draft",
        });
      }
    },
  );

  test.each(["client", "company"] as const)(
    "repairs a legacy accepted %s account and creates its missing foundation",
    async (accountType) => {
      const t = convexTest(schema, modules);
      const userId = await t.run((ctx) =>
        ctx.db.insert("users", {
          email: `legacy-${accountType}@example.com`,
          accountType,
          acceptedTerms: true,
        }),
      );
      const before = await t.run((ctx) => ctx.db.get(userId));
      const asUser = t.withIdentity({ subject: `${userId}|test-session` });

      await expect(
        asUser.mutation(api.users.ensureCurrentUserFoundation, {}),
      ).resolves.toEqual({ accountType });
      await asUser.mutation(api.users.ensureCurrentUserFoundation, {});

      const state = await t.run(async (ctx) => ({
        user: await ctx.db.get(userId),
        clientProfiles: await ctx.db
          .query("clientProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect(),
        memberships: await ctx.db
          .query("companyMembers")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect(),
        companies: await ctx.db.query("companies").collect(),
      }));

      expect(state.user).toMatchObject({
        countryCode: "MA",
        marketingOptIn: false,
        onboardingStatus: "pending",
        termsAcceptedAt: before?._creationTime,
        createdAt: before?._creationTime,
      });
      expect(state.user?.updatedAt).toEqual(expect.any(Number));
      expect(state.clientProfiles).toHaveLength(accountType === "client" ? 1 : 0);
      expect(state.memberships).toHaveLength(accountType === "company" ? 1 : 0);
      expect(state.companies).toHaveLength(accountType === "company" ? 1 : 0);
    },
  );

  test("denies unauthenticated legacy foundation repair", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.users.ensureCurrentUserFoundation, {}),
    ).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("denies privileged and unaccepted legacy accounts", async () => {
    const t = convexTest(schema, modules);
    const [adminId, seoId, unacceptedId] = await t.run(async (ctx) => [
      await ctx.db.insert("users", { accountType: "admin", acceptedTerms: true }),
      await ctx.db.insert("users", { accountType: "seo_team", acceptedTerms: true }),
      await ctx.db.insert("users", { accountType: "client", acceptedTerms: false }),
    ]);

    await expect(
      t
        .withIdentity({ subject: `${adminId}|test-session` })
        .mutation(api.users.ensureCurrentUserFoundation, {}),
    ).rejects.toThrow("INVALID_ACCOUNT_TYPE");
    await expect(
      t
        .withIdentity({ subject: `${seoId}|test-session` })
        .mutation(api.users.ensureCurrentUserFoundation, {}),
    ).rejects.toThrow("INVALID_ACCOUNT_TYPE");
    await expect(
      t
        .withIdentity({ subject: `${unacceptedId}|test-session` })
        .mutation(api.users.ensureCurrentUserFoundation, {}),
    ).rejects.toThrow("TERMS_REQUIRED");
  });

  test("denies a legacy account with mismatched foundation data", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        accountType: "client",
        acceptedTerms: true,
      });
      const companyId = await ctx.db.insert("companies", {
        onboardingStatus: "pending",
        verificationStatus: "draft",
        createdAt: 123,
        updatedAt: 123,
      });
      await ctx.db.insert("companyMembers", {
        companyId,
        userId: id,
        role: "owner",
        status: "active",
        createdAt: 123,
      });
      return id;
    });

    await expect(
      t
        .withIdentity({ subject: `${userId}|test-session` })
        .mutation(api.users.ensureCurrentUserFoundation, {}),
    ).rejects.toThrow("ACCOUNT_TYPE_MISMATCH");
  });

  test.each(["client", "company"] as const)(
    "Google %s finalization creates exactly one account foundation",
    async (accountType) => {
      const t = convexTest(schema, modules);
      const userId = await t.run((ctx) =>
        createOrUpdateAuthUser(ctx, {
          existingUserId: null,
          type: "oauth",
          profile: { email: `google-${accountType}@example.com`, name: "Google Person" },
        }),
      );
      const asUser = t.withIdentity({ subject: `${userId}|test-session` });
      const args = { accountType, acceptedTerms: true, marketingOptIn: false };

      await asUser.mutation(api.users.finalizeOAuthSignup, args);
      await asUser.mutation(api.users.finalizeOAuthSignup, args);

      const state = await t.run(async (ctx) => {
        const user = await ctx.db.get(userId);
        const clientProfiles = await ctx.db
          .query("clientProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect();
        const memberships = await ctx.db
          .query("companyMembers")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect();
        const companies = await ctx.db.query("companies").collect();
        return { user, clientProfiles, memberships, companies };
      });

      expect(state.user).toMatchObject({
        accountType,
        countryCode: "MA",
        onboardingStatus: "pending",
      });
      expect(state.user?.termsAcceptedAt).toEqual(expect.any(Number));
      expect(state.clientProfiles).toHaveLength(accountType === "client" ? 1 : 0);
      expect(state.memberships).toHaveLength(accountType === "company" ? 1 : 0);
      expect(state.companies).toHaveLength(accountType === "company" ? 1 : 0);
    },
  );

  test.each([
    ["client", "company"],
    ["company", "client"],
  ] as const)(
    "rejects %s-to-%s role mismatches without creating cross-role data",
    async (existingAccountType, requestedAccountType) => {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => {
        const now = 123;
        const id = await ctx.db.insert("users", {
          email: `${existingAccountType}@example.com`,
          accountType: existingAccountType,
          countryCode: "MA",
          onboardingStatus: "pending",
          createdAt: now,
          updatedAt: now,
        });
        await ensureAccountFoundation(ctx, {
          userId: id,
          accountType: existingAccountType,
          now,
        });
        return id;
      });
      const asUser = t.withIdentity({ subject: `${userId}|test-session` });

      await expect(
        asUser.mutation(api.users.finalizeOAuthSignup, {
          accountType: requestedAccountType,
          acceptedTerms: true,
          marketingOptIn: false,
        }),
      ).rejects.toThrow("ACCOUNT_TYPE_MISMATCH");

      const counts = await t.run(async (ctx) => ({
        clientProfiles: (await ctx.db.query("clientProfiles").collect()).length,
        companies: (await ctx.db.query("companies").collect()).length,
        memberships: (await ctx.db.query("companyMembers").collect()).length,
      }));
      expect(counts).toEqual(
        existingAccountType === "client"
          ? { clientProfiles: 1, companies: 0, memberships: 0 }
          : { clientProfiles: 0, companies: 1, memberships: 1 },
      );
    },
  );
});
