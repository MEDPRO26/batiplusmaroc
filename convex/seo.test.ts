/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type AccountType = "client" | "company" | "admin" | "seo_team";

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

async function seedUser(
  t: ReturnType<typeof convexTest>,
  accountType: AccountType | undefined,
  email: string,
) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      firstName: "Test",
      lastName: "Account",
      accountType,
      countryCode: "MA",
      onboardingStatus: accountType ? "completed" : "pending",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

describe("SEO backend boundary", () => {
  test("denies public, client, company, and admin callers", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client", "client@example.test");
    const companyId = await seedUser(t, "company", "company@example.test");
    const adminId = await seedUser(t, "admin", "admin@example.test");

    await expect(t.query(api.seo.index.getSeoSession, {})).rejects.toThrow("NOT_AUTHENTICATED");
    for (const userId of [clientId, companyId, adminId]) {
      await expect(asUser(t, userId).query(api.seo.index.getSeoSession, {})).rejects.toThrow(
        "SEO_TEAM_REQUIRED",
      );
    }
  });

  test("returns only safe identity fields for the SEO team user", async () => {
    const t = convexTest(schema, modules);
    const seoId = await seedUser(t, "seo_team", "seo@example.test");

    await expect(asUser(t, seoId).query(api.seo.index.getSeoSession, {})).resolves.toEqual({
      userId: seoId,
      email: "seo@example.test",
      firstName: "Test",
      lastName: "Account",
    });
  });

  test("keeps admin and SEO privileges mutually isolated", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin", "admin@example.test");
    const seoId = await seedUser(t, "seo_team", "seo@example.test");

    await expect(asUser(t, adminId).query(api.seo.index.getSeoSession, {})).rejects.toThrow(
      "SEO_TEAM_REQUIRED",
    );
    await expect(asUser(t, seoId).query(api.admin.index.getAdminSession, {})).rejects.toThrow(
      "ADMIN_REQUIRED",
    );
  });
});

describe("SEO operator provisioning", () => {
  const createConfirmation = "CREATE_BATIPLUS_SEO_TEAM";
  const provisionConfirmation = "PROVISION_BATIPLUS_SEO_TEAM";
  const revokeConfirmation = "REVOKE_BATIPLUS_SEO_TEAM";

  test("creates a fresh SEO password account that signs in through the normal provider", async () => {
    const t = convexTest(schema, modules);
    const email = "seo2@example.test";
    const password = "TestPassword123!";

    const created = await t.action(internal.seo.accounts.createSeoTeamAccount, {
      email: ` ${email.toUpperCase()} `,
      password,
      confirmation: createConfirmation,
    });

    expect(created).toMatchObject({ email, alreadyExists: false });
    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(created.userId),
      clientProfiles: await ctx.db
        .query("clientProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", created.userId))
        .collect(),
      companyMemberships: await ctx.db
        .query("companyMembers")
        .withIndex("by_userId", (q) => q.eq("userId", created.userId))
        .collect(),
    }));
    expect(state.user).toMatchObject({
      email,
      accountType: "seo_team",
      countryCode: "MA",
      onboardingStatus: "completed",
    });
    expect(state.clientProfiles).toHaveLength(0);
    expect(state.companyMemberships).toHaveLength(0);

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signIn", email, password },
      }),
    ).resolves.toMatchObject({ tokens: expect.anything() });
    await expect(
      asUser(t, created.userId).query(api.seo.index.getSeoSession, {}),
    ).resolves.toMatchObject({ userId: created.userId, email });
  });

  test("requires the create confirmation and preserves public-role conflicts", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(internal.seo.accounts.createSeoTeamAccount, {
        email: "seo2@example.test",
        password: "TestPassword123!",
        confirmation: "wrong",
      }),
    ).rejects.toThrow("SEO_CREATE_CONFIRMATION_REQUIRED");

    for (const accountType of ["client", "company", "admin"] as const) {
      const email = `existing-${accountType}@example.test`;
      const userId = await seedUser(t, accountType, email);
      await expect(
        t.action(internal.seo.accounts.createSeoTeamAccount, {
          email,
          password: "TestPassword123!",
          confirmation: createConfirmation,
        }),
      ).rejects.toThrow("SEO_ACCOUNT_TYPE_CONFLICT");
      expect((await t.run((ctx) => ctx.db.get(userId)))?.accountType).toBe(accountType);
    }
  });

  test("handles an existing SEO password account without changing its role or password", async () => {
    const t = convexTest(schema, modules);
    const args = {
      email: "existing-seo@example.test",
      password: "TestPassword123!",
      confirmation: createConfirmation,
    };
    const first = await t.action(internal.seo.accounts.createSeoTeamAccount, args);
    const second = await t.action(internal.seo.accounts.createSeoTeamAccount, args);

    expect(second).toEqual({ ...first, alreadyExists: true });
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signIn", email: args.email, password: args.password },
      }),
    ).resolves.toMatchObject({ tokens: expect.anything() });
  });

  test("keeps SEO users out of client, company, and admin workspaces", async () => {
    const t = convexTest(schema, modules);
    const seoId = await seedUser(t, "seo_team", "seo-workspaces@example.test");
    const seo = asUser(t, seoId);

    await expect(seo.query(api.clients.getOnboardingProfile, {})).rejects.toThrow(
      "CLIENT_ACCOUNT_REQUIRED",
    );
    await expect(seo.query(api.companies.index.getOnboardingProfile, {})).rejects.toThrow(
      "COMPANY_ACCOUNT_REQUIRED",
    );
    await expect(seo.query(api.admin.index.getAdminSession, {})).rejects.toThrow("ADMIN_REQUIRED");
  });

  test("provisions role-free identities and allows multiple SEO accounts", async () => {
    const t = convexTest(schema, modules);
    const firstId = await seedUser(t, undefined, "first@example.test");
    const secondId = await seedUser(t, undefined, "second@example.test");

    await expect(
      t.mutation(internal.seo.accounts.provisionSeoTeamUser, {
        email: " FIRST@example.test ",
        confirmation: provisionConfirmation,
      }),
    ).resolves.toEqual({
      userId: firstId,
      email: "first@example.test",
      alreadyProvisioned: false,
    });
    await expect(
      t.mutation(internal.seo.accounts.provisionSeoTeamUser, {
        email: "first@example.test",
        confirmation: provisionConfirmation,
      }),
    ).resolves.toEqual({
      userId: firstId,
      email: "first@example.test",
      alreadyProvisioned: true,
    });
    await t.mutation(internal.seo.accounts.provisionSeoTeamUser, {
      email: "second@example.test",
      confirmation: provisionConfirmation,
    });

    const [first, second] = await t.run(async (ctx) => [
      await ctx.db.get(firstId),
      await ctx.db.get(secondId),
    ]);
    expect(first).toMatchObject({ accountType: "seo_team", onboardingStatus: "completed" });
    expect(second).toMatchObject({ accountType: "seo_team", onboardingStatus: "completed" });
  });

  test.each(["client", "company", "admin"] as const)(
    "refuses to convert an existing %s account",
    async (accountType) => {
      const t = convexTest(schema, modules);
      const userId = await seedUser(t, accountType, `${accountType}@example.test`);

      await expect(
        t.mutation(internal.seo.accounts.provisionSeoTeamUser, {
          email: `${accountType}@example.test`,
          confirmation: provisionConfirmation,
        }),
      ).rejects.toThrow("SEO_ACCOUNT_TYPE_CONFLICT");

      expect((await t.run((ctx) => ctx.db.get(userId)))?.accountType).toBe(accountType);
    },
  );

  test("requires explicit confirmations", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, undefined, "seo@example.test");

    await expect(
      t.mutation(internal.seo.accounts.provisionSeoTeamUser, {
        email: "seo@example.test",
        confirmation: "wrong",
      }),
    ).rejects.toThrow("SEO_PROVISION_CONFIRMATION_REQUIRED");
    await expect(
      t.mutation(internal.seo.accounts.revokeSeoTeamUser, {
        email: "seo@example.test",
        confirmation: "wrong",
      }),
    ).rejects.toThrow("SEO_REVOCATION_CONFIRMATION_REQUIRED");
  });

  test("revokes access immediately and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const seoId = await seedUser(t, "seo_team", "seo@example.test");

    await expect(
      t.mutation(internal.seo.accounts.revokeSeoTeamUser, {
        email: "seo@example.test",
        confirmation: revokeConfirmation,
      }),
    ).resolves.toEqual({ userId: seoId, email: "seo@example.test", alreadyRevoked: false });
    await expect(asUser(t, seoId).query(api.seo.index.getSeoSession, {})).rejects.toThrow(
      "SEO_TEAM_REQUIRED",
    );
    await expect(
      t.mutation(internal.seo.accounts.revokeSeoTeamUser, {
        email: "seo@example.test",
        confirmation: revokeConfirmation,
      }),
    ).resolves.toEqual({ userId: seoId, email: "seo@example.test", alreadyRevoked: true });
  });
});
