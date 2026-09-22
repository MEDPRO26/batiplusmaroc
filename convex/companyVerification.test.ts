/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
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

type TestBackend = ReturnType<typeof convexTest>;

async function seedCompany(t: TestBackend, options?: { accountType?: "client" | "company"; role?: "owner" | "staff"; status?: "active" | "inactive"; verificationStatus?: "draft" | "pending" | "verified" | "rejected" }) {
  return await t.run(async (ctx) => {
    const now = 100;
    const userId = await ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@example.test`,
      accountType: options?.accountType ?? "company",
      onboardingStatus: "completed",
      createdAt: now,
      updatedAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Atlas",
      legalName: "Atlas SARL",
      phone: "0612345678",
      city: "Agadir",
      description: "A construction company with a completed profile.",
      onboardingStatus: "completed",
      verificationStatus: options?.verificationStatus ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("companyMembers", {
      companyId,
      userId,
      role: options?.role ?? "owner",
      status: options?.status ?? "active",
      createdAt: now,
    });
    return { userId, companyId };
  });
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

const validInput: FunctionArgs<typeof api.companyVerification.index.submitVerification> = {
  legalName: "Atlas Construction SARL",
  ice: "001234567890123",
  rcNumber: "12345",
  legalRepresentative: "Sara El Amrani",
  phone: "+212 6 12 34 56 78",
  address: "12 avenue Hassan II, Agadir",
  documents: [],
};

describe("company verification", () => {
  test("owner submits without documents and creates one current record plus history", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    const owner = asUser(t, userId);

    await expect(owner.mutation(api.companyVerification.index.submitVerification, validInput)).resolves.toEqual({ status: "pending" });
    const state = await t.run(async (ctx) => ({
      company: await ctx.db.get(companyId),
      verifications: await ctx.db.query("companyVerifications").collect(),
      history: await ctx.db.query("companyVerificationHistory").collect(),
      documents: await ctx.db.query("companyVerificationDocuments").collect(),
    }));
    expect(state.company?.verificationStatus).toBe("pending");
    expect(state.verifications).toHaveLength(1);
    expect(state.verifications[0]).toMatchObject({ ice: validInput.ice, rcNumber: validInput.rcNumber });
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ oldStatus: "draft", newStatus: "pending", changedBy: userId });
    expect(state.documents).toHaveLength(0);
  });

  test("rejects unauthenticated, client, staff, and inactive callers", async () => {
    const unauthenticated = convexTest(schema, modules);
    await expect(unauthenticated.mutation(api.companyVerification.index.submitVerification, validInput)).rejects.toThrow("NOT_AUTHENTICATED");

    for (const options of [{ accountType: "client" as const }, { role: "staff" as const }, { status: "inactive" as const }]) {
      const t = convexTest(schema, modules);
      const { userId } = await seedCompany(t, options);
      await expect(asUser(t, userId).mutation(api.companyVerification.index.submitVerification, validInput)).rejects.toThrow(/COMPANY_ACCOUNT_REQUIRED|COMPANY_OWNER_REQUIRED/);
    }
  });

  test("pending and verified companies cannot self-submit or self-verify", async () => {
    for (const verificationStatus of ["pending", "verified"] as const) {
      const t = convexTest(schema, modules);
      const { userId, companyId } = await seedCompany(t, { verificationStatus });
      await expect(asUser(t, userId).mutation(api.companyVerification.index.submitVerification, validInput)).rejects.toThrow("INVALID_VERIFICATION_STATUS");
      expect((await t.run((ctx) => ctx.db.get(companyId)))?.verificationStatus).toBe(verificationStatus);
    }
  });

  test("a rejected verification updates the same record and appends history", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, { verificationStatus: "rejected" });
    await t.run((ctx) => ctx.db.insert("companyVerifications", {
      companyId,
      legalName: "Old SARL",
      ice: "009999999999999",
      rcNumber: "OLD",
      legalRepresentative: "Old Representative",
      phone: "0611111111",
      address: "Old address, Agadir",
      submittedAt: 50,
      createdAt: 50,
      updatedAt: 50,
    }));

    await asUser(t, userId).mutation(api.companyVerification.index.submitVerification, validInput);
    const state = await t.run(async (ctx) => ({
      verifications: await ctx.db.query("companyVerifications").collect(),
      history: await ctx.db.query("companyVerificationHistory").collect(),
    }));
    expect(state.verifications).toHaveLength(1);
    expect(state.verifications[0].legalName).toBe(validInput.legalName);
    expect(state.history[0]).toMatchObject({ oldStatus: "rejected", newStatus: "pending" });
  });

  test("validates every required field on the backend", async () => {
    const cases = [
      [{ ...validInput, legalName: "" }, "INVALID_LEGAL_NAME"],
      [{ ...validInput, ice: "123" }, "INVALID_ICE"],
      [{ ...validInput, rcNumber: "" }, "INVALID_RC_NUMBER"],
      [{ ...validInput, legalRepresentative: "" }, "INVALID_LEGAL_REPRESENTATIVE"],
      [{ ...validInput, phone: "123" }, "INVALID_PHONE"],
      [{ ...validInput, address: "x" }, "INVALID_ADDRESS"],
    ] as const;
    for (const [input, code] of cases) {
      const t = convexTest(schema, modules);
      const { userId } = await seedCompany(t);
      await expect(asUser(t, userId).mutation(api.companyVerification.index.submitVerification, input)).rejects.toThrow(code);
    }
  });
});
