/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
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
  process.env.VERIFICATION_WEB_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000";
});

type TestBackend = TestConvex<typeof schema>;

async function seedCompany(t: TestBackend, options?: { accountType?: "client" | "company" | "admin" | "seo_team"; role?: "owner" | "staff"; status?: "active" | "inactive"; verificationStatus?: "draft" | "pending" | "verified" | "rejected" }) {
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

async function uploadTax(t: TestBackend, userId: Id<"users">) {
  const owner = asUser(t, userId);
  const { uploadToken } = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "tax_compliance" });
  const response = await owner.fetch("/company-verification/upload", {
    method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": uploadToken },
    body: "%PDF-1.7 test",
  });
  expect(response.status).toBe(200);
  const { storageId } = await response.json() as { storageId: Id<"_storage"> };
  return { documentType: "tax_compliance" as const, fileName: "tax.pdf", uploadToken, storageId };
}

describe("company verification", () => {
  test("owner submits with required tax certificate and creates one current record plus history", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    const owner = asUser(t, userId);

    expect(await owner.query(api.companyVerification.index.getVerificationStatus, {})).toEqual({ status: "draft", canManageDocuments: true });

    await expect(owner.mutation(api.companyVerification.index.submitVerification, { ...validInput, documents: [await uploadTax(t, userId)] })).resolves.toEqual({ status: "pending" });
    const state = await t.run(async (ctx) => ({
      company: await ctx.db.get(companyId),
      verifications: await ctx.db.query("companyVerifications").collect(),
      history: await ctx.db.query("companyVerificationHistory").collect(),
      documents: await ctx.db.query("companyVerificationDocuments").collect(),
      notifications: await ctx.db.query("notifications").collect(),
    }));
    expect(state.company?.verificationStatus).toBe("pending");
    expect(state.verifications).toHaveLength(1);
    expect(state.verifications[0]).toMatchObject({ ice: validInput.ice, rcNumber: validInput.rcNumber });
    expect(state.history).toHaveLength(2);
    expect(state.history[1]).toMatchObject({ action: "verification_submitted", oldStatus: "draft", newStatus: "pending", changedBy: userId });
    expect(state.documents).toHaveLength(1);
    expect(state.notifications).toEqual([]);
  });

  test("rejects unauthenticated, client, Admin, SEO, staff, and inactive callers", async () => {
    const unauthenticated = convexTest(schema, modules);
    await expect(unauthenticated.mutation(api.companyVerification.index.submitVerification, validInput)).rejects.toThrow("NOT_AUTHENTICATED");

    for (const options of [
      { accountType: "client" as const },
      { accountType: "admin" as const },
      { accountType: "seo_team" as const },
      { role: "staff" as const },
      { status: "inactive" as const },
    ]) {
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

    await asUser(t, userId).mutation(api.companyVerification.index.submitVerification, { ...validInput, documents: [await uploadTax(t, userId)] });
    const state = await t.run(async (ctx) => ({
      verifications: await ctx.db.query("companyVerifications").collect(),
      history: await ctx.db.query("companyVerificationHistory").collect(),
    }));
    expect(state.verifications).toHaveLength(1);
    expect(state.verifications[0].legalName).toBe(validInput.legalName);
    expect(state.history[1]).toMatchObject({ action: "verification_resubmitted", oldStatus: "rejected", newStatus: "pending" });
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

describe("verification security model", () => {
  async function submitted() {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const upload = await uploadTax(t, company.userId);
    await asUser(t, company.userId).mutation(api.companyVerification.index.submitVerification, { ...validInput, documents: [upload] });
    const document = await t.run(ctx => ctx.db.query("companyVerificationDocuments").first());
    return { t, ...company, upload, document: document! };
  }

  test("required tax certificate cannot be replaced by optional documents", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    const owner = asUser(t, userId);
    await expect(owner.mutation(api.companyVerification.index.submitVerification, validInput)).rejects.toThrow("TAX_COMPLIANCE_CERTIFICATE_REQUIRED");
    const { uploadToken } = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "rc" });
    const uploaded = await owner.fetch("/company-verification/upload", { method: "POST",
      headers: { "Content-Type": "application/pdf", "X-Upload-Token": uploadToken }, body: "%PDF-1.7 RC" });
    const { storageId } = await uploaded.json() as { storageId: Id<"_storage"> };
    await expect(owner.mutation(api.companyVerification.index.submitVerification, {
      ...validInput, documents: [{ documentType: "rc", fileName: "rc.pdf", uploadToken, storageId }],
    })).rejects.toThrow("TAX_COMPLIANCE_CERTIFICATE_REQUIRED");
    expect((await t.run(ctx => ctx.db.get(companyId)))?.verificationStatus).toBe("draft");
    expect(await t.run(ctx => ctx.db.query("companyVerifications").collect())).toEqual([]);
  });

  test("only own owner and admin can download; every request rechecks authorization", async () => {
    const { t, userId, companyId, document } = await submitted();
    const path = `/company-verification/documents/${document._id}`;
    const admin = await seedCompany(t, { accountType: "admin" });
    for (const authorized of [userId, admin.userId]) {
      const response = await asUser(t, authorized).fetch(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("%PDF-1.7 test");
      expect(response.headers.get("cache-control")).toContain("no-store");
      const url = await asUser(t, authorized).query(api.companyVerification.index.getDocumentDownloadUrl, { documentId: document._id });
      expect(url).toBe(`https://example.convex.site/company-verification/documents/${document._id}`);
    }
    expect((await t.fetch(path)).status).toBe(404);
    await expect(t.query(api.companyVerification.index.getDocumentDownloadUrl, { documentId: document._id })).rejects.toThrow();
    for (const options of [{}, { accountType: "client" as const }, { accountType: "seo_team" as const }, { role: "staff" as const }, { status: "inactive" as const }]) {
      const outsider = await seedCompany(t, options);
      const caller = asUser(t, outsider.userId);
      expect((await caller.fetch(path)).status).toBe(404);
      await expect(caller.query(api.companyVerification.index.getDocumentDownloadUrl, { documentId: document._id })).rejects.toThrow();
    }
    const staffId = await t.run(async ctx => {
      const id = await ctx.db.insert("users", { accountType: "company", onboardingStatus: "completed", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("companyMembers", { companyId, userId: id, role: "staff", status: "active", createdAt: 1 });
      return id;
    });
    const staff = asUser(t, staffId);
    expect(await staff.query(api.companyVerification.index.getVerificationStatus, {})).toEqual({ status: "pending", canManageDocuments: false });
    expect((await staff.fetch(path)).status).toBe(404);
    await expect(staff.query(api.companyVerification.index.getVerificationForm, {})).rejects.toThrow("COMPANY_OWNER_REQUIRED");
    await t.run(async ctx => {
      const membership = await ctx.db.query("companyMembers").withIndex("by_companyId_and_userId", q => q.eq("companyId", companyId).eq("userId", userId)).unique();
      await ctx.db.patch(membership!._id, { status: "inactive" });
    });
    expect((await asUser(t, userId).fetch(path)).status).toBe(404);
    expect((await asUser(t, admin.userId).fetch("/company-verification/documents/guessed")).status).toBe(404);
  });

  test("pending and verified freeze documents including previously issued tokens", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    const owner = asUser(t, userId);
    const stale = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "rc" });
    await owner.mutation(api.companyVerification.index.submitVerification, { ...validInput, documents: [await uploadTax(t, userId)] });
    const admin = await seedCompany(t, { accountType: "admin" });
    for (const status of ["pending", "verified"] as const) {
      expect((await t.run(ctx => ctx.db.get(companyId)))?.verificationStatus).toBe(status);
      await expect(owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "tax_compliance" })).rejects.toThrow("INVALID_VERIFICATION_STATUS");
      await expect(owner.mutation(api.companyVerification.index.submitVerification, validInput)).rejects.toThrow("INVALID_VERIFICATION_STATUS");
      expect((await owner.fetch("/company-verification/upload", { method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": stale.uploadToken }, body: "%PDF-1.7 stale" })).status).toBe(400);
      if (status === "pending") await asUser(t, admin.userId).mutation(api.admin.verification.approveCompanyVerification, { companyId });
    }
  });

  test("owner cannot promote itself and only admin may review", async () => {
    const { t, userId, companyId } = await submitted();
    for (const caller of [t, asUser(t, userId), asUser(t, (await seedCompany(t, { accountType: "client" })).userId), asUser(t, (await seedCompany(t, { accountType: "seo_team" })).userId)]) {
      await expect(caller.mutation(api.admin.verification.approveCompanyVerification, { companyId })).rejects.toThrow();
      await expect(caller.mutation(api.admin.verification.rejectCompanyVerification, { companyId, reason: "Missing information" })).rejects.toThrow();
      await expect(caller.query(api.admin.verification.getCompanyVerificationReview, { companyId })).rejects.toThrow();
    }
    await expect(asUser(t, userId).mutation(api.companyVerification.index.submitVerification, { ...validInput, status: "verified" } as never)).rejects.toThrow();
  });

  test("reject, replace, resubmit and approve append privacy-safe history", async () => {
    const { t, userId, companyId, document } = await submitted();
    const admin = asUser(t, (await seedCompany(t, { accountType: "admin" })).userId);
    const owner = asUser(t, userId);
    await expect(admin.mutation(api.admin.verification.rejectCompanyVerification, { companyId, reason: " " })).rejects.toThrow("REJECTION_REASON_REQUIRED");
    await admin.mutation(api.admin.verification.rejectCompanyVerification, { companyId, reason: "Certificate expired" });
    expect((await owner.query(api.companyVerification.index.getVerificationForm, {})).rejectionReason).toBe("Certificate expired");
    const replacement = await uploadTax(t, userId);
    await owner.mutation(api.companyVerification.index.submitVerification, { ...validInput, documents: [replacement] });
    expect((await owner.fetch(`/company-verification/documents/${document._id}`)).status).toBe(404);
    await admin.mutation(api.admin.verification.approveCompanyVerification, { companyId });
    const history = await t.run(ctx => ctx.db.query("companyVerificationHistory").collect());
    expect(history.map(row => row.action)).toEqual([
      "document_uploaded", "verification_submitted", "verification_rejected", "document_uploaded", "document_replaced", "verification_resubmitted", "verification_approved",
    ]);
    for (const row of history) {
      expect(row.changedBy).toBeTruthy(); expect(row.changedAt).toBeGreaterThan(0);
      expect(Object.keys(row)).not.toContain("storageId");
      expect(JSON.stringify(row)).not.toContain("https://");
      expect(JSON.stringify(row)).not.toContain("tax.pdf");
    }
    const notifications = await t.run(ctx => ctx.db.query("notifications").collect());
    expect(JSON.stringify(notifications)).not.toMatch(/tax\.pdf|storageId|downloadUrl|Certificate expired/);
  });

  test("resubmission may keep the required certificate", async () => {
    const { t, userId, companyId } = await submitted();
    const admin = asUser(t, (await seedCompany(t, { accountType: "admin" })).userId);
    await admin.mutation(api.admin.verification.rejectCompanyVerification, { companyId, reason: "Correct address" });
    await asUser(t, userId).mutation(api.companyVerification.index.submitVerification, validInput);
    expect((await t.run(ctx => ctx.db.get(companyId)))?.verificationStatus).toBe("pending");
  });

  test("upload checks format, signature, empty file and maximum size on backend", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t);
    const owner = asUser(t, userId);
    for (const [contentType, body] of [
      ["text/plain", "%PDF-1.7"], ["application/pdf", "<html>forged</html>"],
      ["image/png", "forged PNG"], ["image/jpeg", "forged JPEG"], ["application/pdf", ""],
      ["application/pdf", "%PDF-" + "x".repeat(10 * 1024 * 1024)],
    ]) {
      const { uploadToken } = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "tax_compliance" });
      expect((await owner.fetch("/company-verification/upload", { method: "POST", headers: { "Content-Type": contentType, "X-Upload-Token": uploadToken }, body })).status).toBe(400);
    }
    expect(await t.run(ctx => ctx.db.query("companyVerificationHistory").collect())).toEqual([]);
    for (const [contentType, body] of [
      ["image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])],
      ["image/jpeg", new Uint8Array([255, 216, 255, 0])],
      ["application/pdf", new TextEncoder().encode("%PDF-" + "x".repeat(10 * 1024 * 1024 - 5))],
    ] as const) {
      const { uploadToken } = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "tax_compliance" });
      expect((await owner.fetch("/company-verification/upload", { method: "POST", headers: { "Content-Type": contentType, "X-Upload-Token": uploadToken }, body })).status).toBe(200);
    }
  });

  test("upload tokens cannot be stolen, reused, expired, or used to claim guessed files", async () => {
    const t = convexTest(schema, modules);
    const a = await seedCompany(t); const b = await seedCompany(t);
    const owner = asUser(t, a.userId);
    const { uploadToken } = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "tax_compliance" });
    const request = { method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": uploadToken }, body: "%PDF-1.7" };
    expect((await asUser(t, b.userId).fetch("/company-verification/upload", request)).status).toBe(400);
    expect((await t.fetch("/company-verification/upload", request)).status).toBe(400);
    const guessed = await t.run(ctx => ctx.storage.store(new Blob(["%PDF-1.7 secret"], { type: "application/pdf" })));
    await expect(owner.mutation(api.companyVerification.index.submitVerification, { ...validInput, documents: [{ documentType: "tax_compliance", uploadToken, storageId: guessed, fileName: "tax.pdf" }] })).rejects.toThrow("INVALID_VERIFICATION_DOCUMENT");
    const response = await owner.fetch("/company-verification/upload", request);
    expect(response.status).toBe(200);
    expect((await owner.fetch("/company-verification/upload", request)).status).toBe(400);
    const stored = await response.json() as { storageId: Id<"_storage"> };
    await expect(asUser(t, b.userId).mutation(api.companyVerification.index.submitVerification, { ...validInput, documents: [{ ...stored, uploadToken, documentType: "tax_compliance", fileName: "tax.pdf" }] })).rejects.toThrow("INVALID_VERIFICATION_DOCUMENT");
    await t.run(async ctx => {
      const intent = await ctx.db.query("companyVerificationUploadIntents").withIndex("by_token", q => q.eq("token", uploadToken)).unique();
      await ctx.db.patch(intent!._id, { expiresAt: 0 });
    });
    await expect(owner.mutation(api.companyVerification.index.submitVerification, { ...validInput, documents: [{ ...stored, uploadToken, documentType: "tax_compliance", fileName: "tax.pdf" }] })).rejects.toThrow("INVALID_VERIFICATION_DOCUMENT");
  });

  test("guessed private IDs cannot become public logos or project attachments", async () => {
    const { t, companyId, document } = await submitted();
    await t.run(ctx => ctx.db.patch(companyId, { slug: "atlas-private-test", verificationStatus: "verified", logoStorageId: document.storageId }));
    const { getNonVerificationStorageUrl } = await import("./storage/verificationPrivacy");
    expect(await t.run(ctx => getNonVerificationStorageUrl(ctx, document.storageId))).toBeNull();
    const publicRows = await t.query(api.companies.directory.listPublicCompanies, { verifiedOnly: false, sort: "newest", paginationOpts: { numItems: 20, cursor: null } });
    const client = await seedCompany(t, { accountType: "client" });
    const attachmentId = await t.run(async ctx => {
      const projectId = await ctx.db.insert("projects", {
        clientId: client.userId, primaryCategory: "renovation", city: "agadir", countryCode: "MA",
        title: "Renovation", propertyType: "house", surfaceUnknown: true, description: "Renovation project",
        timeline: "flexible", visibility: "marketplace", status: "draft", lastCompletedStep: 1, createdAt: 1, updatedAt: 1,
      });
      return ctx.db.insert("projectAttachments", { projectId, clientId: client.userId,
        storageId: document.storageId, fileName: "guessed.pdf", contentType: "application/pdf", size: document.size, createdAt: 1 });
    });
    expect(await asUser(t, client.userId).query(api.projects.index.getAttachmentDownloadUrl, { attachmentId })).toBeNull();
    expect(publicRows.page).toHaveLength(1);
    expect(publicRows.page[0]).toMatchObject({ isVerified: true, logoUrl: null });
    expect(JSON.stringify(publicRows)).not.toMatch(/tax\.pdf|storageId|downloadUrl|legalRepresentative|tax_compliance/);
  });
});


test("only pending accepts admin decisions; badge depends solely on verified status", async () => {
  const t = convexTest(schema, modules);
  const admin = asUser(t, (await seedCompany(t, { accountType: "admin" })).userId);
  for (const status of ["draft", "pending", "rejected", "verified"] as const) {
    const { companyId } = await seedCompany(t, { verificationStatus: status });
    await t.run(ctx => ctx.db.patch(companyId, { slug: `company-${status}` }));
    if (status !== "pending") {
      await expect(admin.mutation(api.admin.verification.approveCompanyVerification, { companyId })).rejects.toThrow("VERIFICATION_NOT_PENDING");
      await expect(admin.mutation(api.admin.verification.rejectCompanyVerification, { companyId, reason: "Review rejected" })).rejects.toThrow("VERIFICATION_NOT_PENDING");
    }
  }
  const rows = await t.query(api.companies.directory.listPublicCompanies, { verifiedOnly: false, sort: "newest", paginationOpts: { numItems: 20, cursor: null } });
  for (const row of rows.page) expect(row.isVerified).toBe(row.slug === "company-verified");
});

describe("direct Convex HTTP verification files and CORS", () => {
  const origin = "https://batiplusmaroc.com";
  const uploadPath = "/company-verification/upload";

  test("allowed origins receive narrow preflight headers; untrusted origins/methods/headers are denied", async () => {
    const t = convexTest(schema, modules);
    for (const allowed of [origin, "https://www.batiplusmaroc.com", "http://localhost:3000"]) {
      for (const [path, method, headers] of [[uploadPath, "POST", "authorization,content-type,x-upload-token"], ["/company-verification/documents/guessed", "GET", "authorization"]]) {
        const response = await t.fetch(path, { method: "OPTIONS", headers: {
          Origin: allowed, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers,
        } });
        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe(allowed);
        expect(response.headers.get("access-control-allow-methods")).toBe(method);
        expect(response.headers.get("access-control-allow-credentials")).toBeNull();
        expect(response.headers.get("vary")).toBe("Origin");
      }
    }
    for (const denied of ["https://evil.example", "https://batiplusmaroc.com.evil.example", "null", "https://unconfigured-preview.vercel.app"]) {
      const response = await t.fetch(uploadPath, { method: "OPTIONS", headers: { Origin: denied, "Access-Control-Request-Method": "POST" } });
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
    for (const headers of [
      { "Access-Control-Request-Method": "DELETE" },
      { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-arbitrary-header" },
    ] as Record<string, string>[]) expect((await t.fetch(uploadPath, { method: "OPTIONS", headers: { Origin: origin, ...headers } })).status).toBe(403);
  });

  test("10 MiB upload and download work directly with owner/admin authorization and safe headers", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    const owner = asUser(t, userId);
    const size = 10 * 1024 * 1024;
    const body = "%PDF-" + "x".repeat(size - 5);
    const { uploadToken, uploadUrl } = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "tax_compliance" });
    expect(uploadUrl).toBe(`https://example.convex.site${uploadPath}`);
    const upload = await owner.fetch(new URL(uploadUrl).pathname, { method: "POST", headers: {
      Origin: origin, "Content-Type": "application/pdf", "X-Upload-Token": uploadToken,
    }, body });
    expect(upload.status).toBe(200);
    expect(upload.headers.get("access-control-allow-origin")).toBe(origin);
    const { storageId } = await upload.json() as { storageId: Id<"_storage"> };
    await owner.mutation(api.companyVerification.index.submitVerification, {
      ...validInput, documents: [{ storageId, uploadToken, documentType: "tax_compliance", fileName: 'ملف "tax".pdf' }],
    });
    const form = await owner.query(api.companyVerification.index.getVerificationForm, {});
    const documentId = form.documents[0].documentId;
    const url = await owner.query(api.companyVerification.index.getDocumentDownloadUrl, { documentId });
    expect(url).toBe(`https://example.convex.site/company-verification/documents/${documentId}`);
    const admin = asUser(t, (await seedCompany(t, { accountType: "admin" })).userId);
    const review = await admin.query(api.admin.verification.getCompanyVerificationReview, { companyId });
    expect(review?.documents[0].downloadUrl).toBe(url);
    expect(JSON.stringify(review)).not.toContain("/api/storage/");
    expect(JSON.stringify(review)).not.toContain(storageId);
    for (const reader of [owner, admin]) {
      const response = await reader.fetch(new URL(url).pathname, { headers: { Origin: origin } });
      expect(response.status).toBe(200);
      expect((await response.blob()).size).toBe(size);
      expect(response.headers.get("content-length")).toBe(String(size));
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("cache-control")).toContain("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="/);
      expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''");
      expect(response.headers.get("access-control-expose-headers")).toBe("Content-Disposition");
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    }
    const path = new URL(url).pathname;
    expect((await owner.fetch(path, { headers: { Origin: "https://evil.example" } })).status).toBe(404);
    const anonymous = await t.fetch(path, { headers: { Origin: origin } });
    expect(anonymous.status).toBe(404); expect(await anonymous.text()).toBe("Not found");
    for (const options of [{}, { role: "staff" as const }, { accountType: "client" as const }, { accountType: "seo_team" as const }]) {
      const outsider = asUser(t, (await seedCompany(t, options)).userId);
      const denied = await outsider.fetch(path, { headers: { Origin: origin } });
      expect(denied.status).toBe(404); expect(await denied.text()).toBe("Not found");
    }
    expect((await admin.fetch("/company-verification/documents/guessed", { headers: { Origin: origin } })).status).toBe(404);
  });

  test("expired unbound tokens and wrong document types are rejected", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t);
    const owner = asUser(t, userId);
    const { uploadToken } = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "tax_compliance" });
    await t.run(async ctx => {
      const intent = await ctx.db.query("companyVerificationUploadIntents").withIndex("by_token", q => q.eq("token", uploadToken)).unique();
      await ctx.db.patch(intent!._id, { expiresAt: 0 });
    });
    const response = await owner.fetch(uploadPath, { method: "POST", headers: {
      Origin: origin, "Content-Type": "application/pdf", "X-Upload-Token": uploadToken,
    }, body: "%PDF-1.7" });
    expect(response.status).toBe(400);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
    const tax = await uploadTax(t, userId);
    await expect(owner.mutation(api.companyVerification.index.submitVerification, {
      ...validInput, documents: [{ ...tax, documentType: "rc" }],
    })).rejects.toThrow("INVALID_VERIFICATION_DOCUMENT");
  });

  test("failed binding after the file arrives removes the stored object", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t);
    const owner = asUser(t, userId);
    const { uploadToken } = await owner.mutation(api.companyVerification.index.generateDocumentUploadUrl, { documentType: "tax_compliance" });
    const stream = new ReadableStream({
      async pull(controller) {
        await t.run(ctx => ctx.db.patch(companyId, { verificationStatus: "pending" }));
        controller.enqueue(new TextEncoder().encode("%PDF-1.7 late file")); controller.close();
      },
    }, { highWaterMark: 0 });
    const response = await owner.fetch(uploadPath, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/pdf", "X-Upload-Token": uploadToken },
      body: stream, duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(response.status).toBe(400);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
    const intents = await t.run(ctx => ctx.db.query("companyVerificationUploadIntents").collect());
    expect(intents[0].storageId).toBeUndefined();
    expect(await t.run(ctx => ctx.db.query("companyVerificationHistory").collect())).toHaveLength(0);
  });
});
