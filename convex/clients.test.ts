/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

async function seedUser(
  t: ReturnType<typeof convexTest>,
  accountType: "client" | "company",
  options?: { withProfile?: boolean },
) {
  return await t.run(async (ctx) => {
    const now = 123;
    const userId = await ctx.db.insert("users", {
      email: `${accountType}@example.test`,
      firstName: "Existing",
      lastName: "Person",
      accountType,
      countryCode: "MA",
      acceptedTerms: true,
      termsAcceptedAt: now,
      marketingOptIn: false,
      onboardingStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
    if (accountType === "client" && options?.withProfile !== false) {
      await ctx.db.insert("clientProfiles", {
        userId,
        city: "Rabat",
        onboardingStatus: "pending",
        createdAt: now,
        updatedAt: now,
      });
    }
    return userId;
  });
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

describe("client onboarding", () => {
  test("loads existing names and profile city for prefilling", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "client");

    await expect(asUser(t, userId).query(api.clients.getOnboardingProfile, {})).resolves.toEqual({
      firstName: "Existing",
      lastName: "Person",
      phone: "",
      city: "Rabat",
      onboardingStatus: "pending",
    });
  });

  test("rejects unauthenticated and company callers", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedUser(t, "company");
    const args = {
      firstName: "Test",
      lastName: "Client",
      phone: "0612345678",
      city: "Casablanca",
    };

    await expect(t.mutation(api.clients.completeOnboarding, args)).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
    await expect(asUser(t, companyId).mutation(api.clients.completeOnboarding, args)).rejects.toThrow(
      "CLIENT_ACCOUNT_REQUIRED",
    );
  });

  test("saves contact fields and completes the same user and client profile", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "client");

    await expect(
      asUser(t, userId).mutation(api.clients.completeOnboarding, {
        firstName: "  Amine ",
        lastName: " El Mansouri ",
        phone: "+212 6 12 34 56 78",
        city: "  Casablanca ",
      }),
    ).resolves.toEqual({ onboardingStatus: "completed" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      profiles: await ctx.db
        .query("clientProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(2),
    }));

    expect(state.user).toMatchObject({
      firstName: "Amine",
      lastName: "El Mansouri",
      phone: "+212612345678",
      onboardingStatus: "completed",
    });
    expect(state.user?.updatedAt).toEqual(expect.any(Number));
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({
      city: "Casablanca",
      onboardingStatus: "completed",
    });
    expect(state.profiles[0].updatedAt).toEqual(expect.any(Number));
  });

  test("creates one missing legacy profile and resubmits by updating it", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "client", { withProfile: false });
    const client = asUser(t, userId);

    await client.mutation(api.clients.completeOnboarding, {
      firstName: "Sara",
      lastName: "Alaoui",
      phone: "0612345678",
      city: "Agadir",
    });
    await client.mutation(api.clients.completeOnboarding, {
      firstName: "Sara",
      lastName: "Alaoui",
      phone: "0712345678",
      city: "Marrakech",
    });

    const profiles = await t.run((ctx) =>
      ctx.db
        .query("clientProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(2),
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ city: "Marrakech", onboardingStatus: "completed" });
  });

  test("fails closed when duplicate client profiles already exist", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "client");
    await t.run((ctx) =>
      ctx.db.insert("clientProfiles", {
        userId,
        onboardingStatus: "pending",
        createdAt: 456,
        updatedAt: 456,
      }),
    );

    await expect(
      asUser(t, userId).mutation(api.clients.completeOnboarding, {
        firstName: "Test",
        lastName: "Client",
        phone: "0612345678",
        city: "Rabat",
      }),
    ).rejects.toThrow("DUPLICATE_ACCOUNT_FOUNDATION");
  });

  test("validates names, Moroccan phone numbers, and city", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "client");
    const client = asUser(t, userId);
    const valid = {
      firstName: "Test",
      lastName: "Client",
      phone: "0612345678",
      city: "Rabat",
    };

    await expect(
      client.mutation(api.clients.completeOnboarding, { ...valid, firstName: "123" }),
    ).rejects.toThrow("INVALID_NAME");
    await expect(
      client.mutation(api.clients.completeOnboarding, { ...valid, phone: "123" }),
    ).rejects.toThrow("INVALID_PHONE");
    await expect(
      client.mutation(api.clients.completeOnboarding, { ...valid, city: "!" }),
    ).rejects.toThrow("INVALID_CITY");
  });
});
