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

type TestBackend = ReturnType<typeof convexTest>;

async function seedAdmin(t: TestBackend) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "admin@example.test",
      firstName: "Ada",
      lastName: "Admin",
      accountType: "admin",
      onboardingStatus: "completed",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function seedPendingCompany(
  t: TestBackend,
  options?: { name?: string; city?: string; status?: "pending" | "verified" | "rejected" },
) {
  return await t.run(async (ctx) => {
    const now = 1_000;
    const ownerId = await ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@example.test`,
      accountType: "company",
      onboardingStatus: "completed",
      createdAt: now,
      updatedAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: options?.name ?? "Atlas Build",
      legalName: "Atlas Build SARL",
      phone: "0612345678",
      city: options?.city ?? "Agadir",
      description: "Company profile",
      onboardingStatus: "completed",
      verificationStatus: options?.status ?? "pending",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("companyMembers", {
      companyId,
      userId: ownerId,
      role: "owner",
      status: "active",
      createdAt: now,
    });
    const verificationId = await ctx.db.insert("companyVerifications", {
      companyId,
      legalName: "Atlas Build SARL",
      ice: "001234567890123",
      rcNumber: "RC-88",
      legalRepresentative: "Sara El Amrani",
      phone: "+212612345678",
      address: "12 avenue Hassan II, Agadir",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { ownerId, companyId, verificationId };
  });
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

describe("admin company verification", () => {
  test("blocks unauthenticated, client, and company callers from list and review", async () => {
    const t = convexTest(schema, modules);
    const { companyId } = await seedPendingCompany(t);
    const clientId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "client@example.test",
        accountType: "client",
        onboardingStatus: "completed",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const companyUserId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "company-user@example.test",
        accountType: "company",
        onboardingStatus: "completed",
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await expect(t.query(api.admin.verification.listCompanyVerifications, { status: "pending" })).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
    await expect(
      asUser(t, clientId).query(api.admin.verification.listCompanyVerifications, { status: "pending" }),
    ).rejects.toThrow("ADMIN_REQUIRED");
    await expect(
      asUser(t, companyUserId).query(api.admin.verification.getCompanyVerificationReview, { companyId }),
    ).rejects.toThrow("ADMIN_REQUIRED");
  });

  test("lists pending, verified, and rejected tabs and supports search", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    await seedPendingCompany(t, { name: "Atlas Build", city: "Agadir", status: "pending" });
    await seedPendingCompany(t, { name: "Casa Works", city: "Casablanca", status: "verified" });
    await seedPendingCompany(t, { name: "Rabat Fix", city: "Rabat", status: "rejected" });
    const admin = asUser(t, adminId);

    await expect(admin.query(api.admin.verification.listCompanyVerifications, { status: "pending" })).resolves.toEqual([
      expect.objectContaining({ companyName: "Atlas Build", city: "Agadir", status: "pending", ice: "001234567890123" }),
    ]);
    await expect(admin.query(api.admin.verification.listCompanyVerifications, { status: "verified" })).resolves.toEqual([
      expect.objectContaining({ companyName: "Casa Works", status: "verified" }),
    ]);
    await expect(admin.query(api.admin.verification.listCompanyVerifications, { status: "rejected" })).resolves.toEqual([
      expect.objectContaining({ companyName: "Rabat Fix", status: "rejected" }),
    ]);
    await expect(
      admin.query(api.admin.verification.listCompanyVerifications, { status: "pending", search: "atlas" }),
    ).resolves.toHaveLength(1);
    await expect(
      admin.query(api.admin.verification.listCompanyVerifications, { status: "pending", search: "missing" }),
    ).resolves.toHaveLength(0);
    await expect(
      admin.query(api.admin.verification.listCompanyVerifications, { status: "pending", city: "Agadir" }),
    ).resolves.toHaveLength(1);
  });

  test("admin can open review with history and empty documents message path", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const { companyId } = await seedPendingCompany(t);
    const review = await asUser(t, adminId).query(api.admin.verification.getCompanyVerificationReview, { companyId });
    expect(review).toMatchObject({
      companyId,
      companyName: "Atlas Build",
      ice: "001234567890123",
      status: "pending",
      documents: [],
    });
  });

  test("admin can approve pending verification and writes immutable history", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const { companyId } = await seedPendingCompany(t);

    await expect(
      asUser(t, adminId).mutation(api.admin.verification.approveCompanyVerification, { companyId }),
    ).resolves.toEqual({ status: "verified" });

    const state = await t.run(async (ctx) => ({
      company: await ctx.db.get(companyId),
      history: await ctx.db.query("companyVerificationHistory").collect(),
    }));
    expect(state.company?.verificationStatus).toBe("verified");
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({
      oldStatus: "pending",
      newStatus: "verified",
      changedBy: adminId,
    });
  });

  test("non-admin and company cannot approve or self-verify", async () => {
    const t = convexTest(schema, modules);
    const { ownerId, companyId } = await seedPendingCompany(t);
    const clientId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "client2@example.test",
        accountType: "client",
        onboardingStatus: "completed",
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await expect(
      asUser(t, clientId).mutation(api.admin.verification.approveCompanyVerification, { companyId }),
    ).rejects.toThrow("ADMIN_REQUIRED");
    await expect(
      asUser(t, ownerId).mutation(api.admin.verification.approveCompanyVerification, { companyId }),
    ).rejects.toThrow("ADMIN_REQUIRED");
    expect((await t.run((ctx) => ctx.db.get(companyId)))?.verificationStatus).toBe("pending");
  });

  test("admin can reject with reason and empty reason fails", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const { companyId } = await seedPendingCompany(t);
    const admin = asUser(t, adminId);

    await expect(
      admin.mutation(api.admin.verification.rejectCompanyVerification, { companyId, reason: "  " }),
    ).rejects.toThrow("REJECTION_REASON_REQUIRED");

    await expect(
      admin.mutation(api.admin.verification.rejectCompanyVerification, {
        companyId,
        reason: "Incomplete ICE documents",
      }),
    ).resolves.toEqual({ status: "rejected" });

    const history = await t.run((ctx) => ctx.db.query("companyVerificationHistory").collect());
    expect(history[0]).toMatchObject({
      oldStatus: "pending",
      newStatus: "rejected",
      rejectionReason: "Incomplete ICE documents",
      changedBy: adminId,
    });
  });

  test("resubmitted rejected company returns to pending for admin list", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const { ownerId, companyId } = await seedPendingCompany(t, { status: "rejected" });

    await asUser(t, ownerId).mutation(api.companyVerification.index.submitVerification, {
      legalName: "Atlas Build SARL",
      ice: "001234567890123",
      rcNumber: "RC-88",
      legalRepresentative: "Sara El Amrani",
      phone: "+212 6 12 34 56 78",
      address: "12 avenue Hassan II, Agadir",
      documents: [],
    });

    const pending = await asUser(t, adminId).query(api.admin.verification.listCompanyVerifications, {
      status: "pending",
    });
    expect(pending).toEqual([expect.objectContaining({ companyId, status: "pending" })]);
  });

  test("private document url requires admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const { ownerId, companyId, verificationId } = await seedPendingCompany(t);
    const documentId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["secret"], { type: "application/pdf" }));
      return await ctx.db.insert("companyVerificationDocuments", {
        verificationId,
        companyId,
        documentType: "rc",
        storageId,
        fileName: "rc.pdf",
        contentType: "application/pdf",
        size: 6,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      asUser(t, ownerId).query(api.admin.verification.getVerificationDocumentUrl, { documentId }),
    ).rejects.toThrow("ADMIN_REQUIRED");

    const url = await asUser(t, adminId).query(api.admin.verification.getVerificationDocumentUrl, { documentId });
    expect(typeof url === "string" || url === null).toBe(true);

    const review = await asUser(t, adminId).query(api.admin.verification.getCompanyVerificationReview, { companyId });
    expect(review?.documents).toHaveLength(1);
    expect(review?.documents[0]).toMatchObject({ fileName: "rc.pdf", documentType: "rc" });
  });

  test("approve and reject only work from pending", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const { companyId } = await seedPendingCompany(t, { status: "verified" });
    await expect(
      asUser(t, adminId).mutation(api.admin.verification.approveCompanyVerification, { companyId }),
    ).rejects.toThrow("VERIFICATION_NOT_PENDING");
    await expect(
      asUser(t, adminId).mutation(api.admin.verification.rejectCompanyVerification, {
        companyId,
        reason: "Too late",
      }),
    ).rejects.toThrow("VERIFICATION_NOT_PENDING");
  });
});
