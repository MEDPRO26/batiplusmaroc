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

async function seedCompletedClient(
  t: ReturnType<typeof convexTest>,
  label: string,
  options?: { city?: string },
) {
  return await t.run(async (ctx) => {
    const now = 1_700_000_000_000;
    const userId = await ctx.db.insert("users", {
      email: `${label}@example.test`,
      firstName: "Amine",
      lastName: "Benali",
      phone: "0612345678",
      accountType: "client",
      countryCode: "MA",
      acceptedTerms: true,
      termsAcceptedAt: now,
      marketingOptIn: false,
      onboardingStatus: "completed",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("clientProfiles", {
      userId,
      city: options?.city ?? "Rabat",
      onboardingStatus: "completed",
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
}

async function seedVerifiedAvatarIntent(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  objectKey?: string,
) {
  return await t.run(async (ctx) => {
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const key = objectKey ?? `clients/${userId}/avatar/${crypto.randomUUID()}.webp`;
    await ctx.db.insert("clientAvatarUploadIntents", {
      userId,
      expectedContentType: "image/webp",
      expectedSize: 128,
      objectKey: key,
      token: uploadToken,
      expiresAt: Date.now() + 60_000,
      verifiedAt: Date.now(),
      createdAt: Date.now(),
    });
    return { uploadToken, objectKey: key };
  });
}

describe("client profile management", () => {
  beforeAll(async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
  });

  test("client can open their private profile with initials and derived stats", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCompletedClient(t, "profile-open");
    await t.run(async (ctx) => {
      await ctx.db.insert("projects", {
        clientId: userId,
        countryCode: "MA",
        surfaceUnknown: true,
        budgetUnknown: true,
        visibility: "marketplace",
        status: "published",
        lastCompletedStep: 7,
        createdAt: 1,
        updatedAt: 1,
        title: "Villa",
      });
      await ctx.db.insert("projects", {
        clientId: userId,
        countryCode: "MA",
        surfaceUnknown: true,
        budgetUnknown: true,
        visibility: "marketplace",
        status: "completed",
        lastCompletedStep: 7,
        createdAt: 2,
        updatedAt: 2,
        title: "Done",
      });
      await ctx.db.insert("projects", {
        clientId: userId,
        countryCode: "MA",
        surfaceUnknown: true,
        budgetUnknown: true,
        visibility: "marketplace",
        status: "draft",
        lastCompletedStep: 2,
        createdAt: 3,
        updatedAt: 3,
      });
    });

    const profile = await asUser(t, userId).query(api.clients.getMyProfile, {});
    expect(profile).toMatchObject({
      firstName: "Amine",
      lastName: "Benali",
      initials: "AB",
      city: "Rabat",
      phone: "0612345678",
      email: "profile-open@example.test",
      projectsPostedCount: 2,
      projectsCompletedCount: 1,
      profilePhotoUrl: null,
    });
    expect(profile?.joinedAt).toEqual(expect.any(Number));
  });

  test("unauthenticated getMyProfile returns null and update is rejected", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.clients.getMyProfile, {})).resolves.toBeNull();
    await expect(
      t.mutation(api.clients.updateMyProfile, {
        firstName: "A",
        lastName: "B",
        phone: "0612345678",
        city: "Rabat",
      }),
    ).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("company cannot edit or load client profile manager", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedUser(t, "company");
    await expect(asUser(t, companyId).query(api.clients.getMyProfile, {})).rejects.toThrow(
      "CLIENT_ACCOUNT_REQUIRED",
    );
    await expect(
      asUser(t, companyId).mutation(api.clients.updateMyProfile, {
        firstName: "Hack",
        lastName: "Attempt",
        phone: "0612345678",
        city: "Rabat",
      }),
    ).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
  });

  test("client A cannot change client B profile through authenticated identity alone", async () => {
    const t = convexTest(schema, modules);
    const clientA = await seedCompletedClient(t, "client-a");
    const clientB = await seedCompletedClient(t, "client-b", { city: "Fes" });

    await asUser(t, clientA).mutation(api.clients.updateMyProfile, {
      firstName: "Updated",
      lastName: "Owner",
      phone: "0712345678",
      city: "Tangier",
    });

    const profileA = await asUser(t, clientA).query(api.clients.getMyProfile, {});
    const profileB = await asUser(t, clientB).query(api.clients.getMyProfile, {});
    expect(profileA).toMatchObject({
      firstName: "Updated",
      lastName: "Owner",
      phone: "0712345678",
      city: "Tangier",
    });
    expect(profileB).toMatchObject({
      firstName: "Amine",
      lastName: "Benali",
      city: "Fes",
      phone: "0612345678",
    });
  });

  test("updates name, phone, and city for the authenticated client only", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCompletedClient(t, "editable");

    await expect(
      asUser(t, userId).mutation(api.clients.updateMyProfile, {
        firstName: "  Sara ",
        lastName: " Alaoui ",
        phone: "+212 7 11 22 33 44",
        city: "  Casablanca ",
      }),
    ).resolves.toEqual({ updated: true });

    const profile = await asUser(t, userId).query(api.clients.getMyProfile, {});
    expect(profile).toMatchObject({
      firstName: "Sara",
      lastName: "Alaoui",
      phone: "+212711223344",
      city: "Casablanca",
      initials: "SA",
    });
  });

  test("uploads, replaces, and removes profile photo through verified R2 intents", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCompletedClient(t, "avatar");
    const first = await seedVerifiedAvatarIntent(t, userId);

    await asUser(t, userId).mutation(api.clients.updateMyProfile, {
      firstName: "Amine",
      lastName: "Benali",
      phone: "0612345678",
      city: "Rabat",
      avatarUploadToken: first.uploadToken,
    });

    let profile = await asUser(t, userId).query(api.clients.getMyProfile, {});
    expect(profile?.profilePhotoUrl).toBe(
      `https://media.example.test/${first.objectKey.split("/").map(encodeURIComponent).join("/")}`,
    );

    const second = await seedVerifiedAvatarIntent(t, userId);
    await asUser(t, userId).mutation(api.clients.updateMyProfile, {
      firstName: "Amine",
      lastName: "Benali",
      phone: "0612345678",
      city: "Rabat",
      avatarUploadToken: second.uploadToken,
    });

    profile = await asUser(t, userId).query(api.clients.getMyProfile, {});
    expect(profile?.profilePhotoUrl).toContain(encodeURIComponent("avatar"));
    expect(profile?.profilePhotoUrl).not.toBe(
      `https://media.example.test/${first.objectKey.split("/").map(encodeURIComponent).join("/")}`,
    );

    await asUser(t, userId).mutation(api.clients.updateMyProfile, {
      firstName: "Amine",
      lastName: "Benali",
      phone: "0612345678",
      city: "Rabat",
      removeAvatar: true,
    });

    profile = await asUser(t, userId).query(api.clients.getMyProfile, {});
    expect(profile?.profilePhotoUrl).toBeNull();
    expect(profile?.initials).toBe("AB");
  });

  test("rejects avatar intent owned by another client", async () => {
    const t = convexTest(schema, modules);
    const clientA = await seedCompletedClient(t, "avatar-a");
    const clientB = await seedCompletedClient(t, "avatar-b");
    const stolen = await seedVerifiedAvatarIntent(
      t,
      clientB,
      `clients/${clientB}/avatar/${crypto.randomUUID()}.webp`,
    );

    await expect(
      asUser(t, clientA).mutation(api.clients.updateMyProfile, {
        firstName: "Amine",
        lastName: "Benali",
        phone: "0612345678",
        city: "Rabat",
        avatarUploadToken: stolen.uploadToken,
      }),
    ).rejects.toThrow("INVALID_CLIENT_AVATAR");
  });

  test("public client data never returns private fields", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedCompletedClient(t, "public-shape");
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("clientProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (!profile) throw new Error("missing profile");
      await ctx.db.patch(profile._id, {
        avatarObjectKey: `clients/${userId}/avatar/secret.webp`,
        avatarMimeType: "image/webp",
        avatarSize: 10,
      });
      await ctx.db.insert("projects", {
        clientId: userId,
        countryCode: "MA",
        surfaceUnknown: true,
        budgetUnknown: true,
        visibility: "marketplace",
        status: "completed",
        lastCompletedStep: 7,
        createdAt: 1,
        updatedAt: 1,
        title: "Done",
      });
    });

    const publicClient = await t.query(api.clients.getPublicClient, { userId });
    expect(publicClient).toEqual({
      firstName: "Amine",
      lastInitial: "B",
      displayName: "Amine B.",
      city: "Rabat",
      joinedAt: 1_700_000_000_000,
      projectsPostedCount: 1,
      projectsCompletedCount: 1,
    });
    expect(publicClient).not.toHaveProperty("phone");
    expect(publicClient).not.toHaveProperty("email");
    expect(publicClient).not.toHaveProperty("profilePhotoUrl");
    expect(publicClient).not.toHaveProperty("lastName");
    expect(JSON.stringify(publicClient)).not.toContain("0612345678");
    expect(JSON.stringify(publicClient)).not.toContain("public-shape@example.test");
    expect(JSON.stringify(publicClient)).not.toContain("secret.webp");
  });
});
