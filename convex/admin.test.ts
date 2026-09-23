/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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
  accountType: "client" | "company" | "admin",
  email = `${accountType}@example.test`,
) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      firstName: "Test",
      lastName: "Account",
      accountType,
      countryCode: "MA",
      onboardingStatus: "completed",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

describe("admin backend boundary", () => {
  test("rejects unauthenticated, client, and company callers", async () => {
    const t = convexTest(schema, modules);
    const clientId = await seedUser(t, "client");
    const companyId = await seedUser(t, "company");

    await expect(t.query(api.admin.index.getAdminSession, {})).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
    await expect(asUser(t, clientId).query(api.admin.index.getAdminSession, {})).rejects.toThrow(
      "ADMIN_REQUIRED",
    );
    await expect(asUser(t, companyId).query(api.admin.index.getAdminSession, {})).rejects.toThrow(
      "ADMIN_REQUIRED",
    );
  });

  test("returns only the signed-in admin's safe identity", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "admin");

    await expect(asUser(t, adminId).query(api.admin.index.getAdminSession, {})).resolves.toEqual({
      userId: adminId,
      email: "admin@example.test",
      firstName: "Test",
      lastName: "Account",
    });
  });
});

describe("first-admin bootstrap", () => {
  const confirmation = "PROMOTE_FIRST_BATIPLUS_ADMIN";

  test("requires explicit confirmation and promotes exactly one existing account", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, "client", "operator@example.test");

    await expect(
      t.mutation(internal.admin.bootstrap.promoteFirstAdmin, {
        email: "operator@example.test",
        confirmation: "wrong",
      }),
    ).rejects.toThrow("ADMIN_BOOTSTRAP_CONFIRMATION_REQUIRED");

    await expect(
      t.mutation(internal.admin.bootstrap.promoteFirstAdmin, {
        email: " OPERATOR@example.test ",
        confirmation,
      }),
    ).resolves.toEqual({ userId, email: "operator@example.test", alreadyAdmin: false });

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user).toMatchObject({
      accountType: "admin",
      countryCode: "MA",
      onboardingStatus: "completed",
    });
  });

  test("is idempotent for the first admin and blocks a second bootstrap", async () => {
    const t = convexTest(schema, modules);
    const firstId = await seedUser(t, "client", "first@example.test");
    await seedUser(t, "company", "second@example.test");

    await t.mutation(internal.admin.bootstrap.promoteFirstAdmin, {
      email: "first@example.test",
      confirmation,
    });
    await expect(
      t.mutation(internal.admin.bootstrap.promoteFirstAdmin, {
        email: "first@example.test",
        confirmation,
      }),
    ).resolves.toEqual({ userId: firstId, email: "first@example.test", alreadyAdmin: true });
    await expect(
      t.mutation(internal.admin.bootstrap.promoteFirstAdmin, {
        email: "second@example.test",
        confirmation,
      }),
    ).rejects.toThrow("ADMIN_ALREADY_EXISTS");
  });
});
