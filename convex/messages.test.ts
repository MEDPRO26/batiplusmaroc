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

async function seedUser(t: ReturnType<typeof convexTest>, accountType: "client" | "company") {
  return await t.run(async (ctx) => {
    const now = 123;
    return await ctx.db.insert("users", {
      email: `${accountType}-messages@example.test`,
      firstName: "Hamza",
      lastName: "Ifguisse",
      accountType,
      countryCode: "MA",
      acceptedTerms: true,
      termsAcceptedAt: now,
      marketingOptIn: false,
      onboardingStatus: "completed",
      createdAt: now,
      updatedAt: now,
    });
  });
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

describe("messages inbox", () => {
  test("rejects unauthenticated callers and returns no threads before mutual interest", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.messages.index.listMyThreads, {})).rejects.toThrow("NOT_AUTHENTICATED");

    const clientId = await seedUser(t, "client");
    await expect(asUser(t, clientId).query(api.messages.index.listMyThreads, {})).resolves.toEqual([]);

    const companyId = await seedUser(t, "company");
    await expect(asUser(t, companyId).query(api.messages.index.listMyThreads, {})).resolves.toEqual([]);
  });
});
