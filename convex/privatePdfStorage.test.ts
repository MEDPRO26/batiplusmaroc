/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
const pdf = "%PDF-1.7 private client plan";
const origin = "https://www.batiplusmaroc.com";
const asUser = (t: Backend, id: Id<"users">) => t.withIdentity({ subject: `${id}|session` });

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

async function setup() {
  const t = convexTest(schema, modules);
  const data = await t.run(async ctx => {
    const user = (accountType: "client" | "company" | "admin" | "seo_team") => ctx.db.insert("users", {
      accountType, onboardingStatus: "completed", countryCode: "MA", createdAt: 1, updatedAt: 1,
    });
    const client = await user("client"), otherClient = await user("client"), owner = await user("company"), otherOwner = await user("company");
    const admin = await user("admin"), seo = await user("seo_team");
    const companyId = await ctx.db.insert("companies", { name: "Atlas", verificationStatus: "verified", onboardingStatus: "completed", createdAt: 1, updatedAt: 1 });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other", verificationStatus: "verified", onboardingStatus: "completed", createdAt: 1, updatedAt: 1 });
    const membershipId = await ctx.db.insert("companyMembers", { userId: owner, companyId, role: "owner", status: "active", createdAt: 1 });
    await ctx.db.insert("companyMembers", { userId: otherOwner, companyId: otherCompanyId, role: "owner", status: "active", createdAt: 1 });
    const projectId = await ctx.db.insert("projects", { clientId: client, countryCode: "MA", surfaceUnknown: true, visibility: "marketplace", status: "draft", lastCompletedStep: 0, createdAt: 1, updatedAt: 1 });
    const victimProjectId = await ctx.db.insert("projects", { clientId: otherClient, countryCode: "MA", surfaceUnknown: true, visibility: "marketplace", status: "draft", lastCompletedStep: 0, createdAt: 1, updatedAt: 1 });
    const quoteId = await ctx.db.insert("projectQuotes", { projectId, companyId, submittedByUserId: owner, message: "An initial quote message", estimatedPrice: 100, currency: "MAD", estimatedDuration: 5, availableStartDate: "2099-01-01", scope: "A quote scope", quoteType: "initial", status: "discussion_open", createdAt: 1, updatedAt: 1, submittedAt: 1 });
    const conversationId = await ctx.db.insert("conversations", { projectId, quoteId, clientId: client, companyId, status: "active", createdBy: client, createdAt: 1, updatedAt: 1 });
    const storageId = await ctx.storage.store(new Blob([pdf], { type: "application/pdf" }));
    const attachmentId = await ctx.db.insert("projectAttachments", { projectId: victimProjectId, clientId: otherClient, storageId, fileName: 'plan "\r\n/chantier.pdf', contentType: "application/pdf", size: pdf.length, createdAt: 1 });
    return { client, otherClient, owner, otherOwner, admin, seo, companyId, membershipId, projectId, victimProjectId, quoteId, conversationId, storageId, attachmentId };
  });
  return { t, ...data };
}
type State = Awaited<ReturnType<typeof setup>>;

async function intent(s: State) {
  return asUser(s.t, s.owner).mutation(api.messages.attachments.generateAttachmentUploadUrl, {
    conversationId: s.conversationId, fileName: "message.pdf", contentType: "application/pdf", size: pdf.length,
  });
}
async function upload(s: State) {
  const grant = await intent(s);
  const response = await asUser(s.t, s.owner).fetch("/messages/attachments/upload", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/pdf", "X-Upload-Token": grant.uploadToken }, body: pdf,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ uploaded: true });
  const row = await s.t.run(ctx => ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", q => q.eq("token", grant.uploadToken)).unique());
  return { ...grant, row: row!, storageId: row!.storageId! };
}
const discard = (s: State, token: string, storageId?: Id<"_storage">) => asUser(s.t, s.owner).mutation(api.messages.attachments.discardAttachmentUpload, {
  conversationId: s.conversationId, uploadToken: token, ...(storageId ? { storageId } : {}),
});
const send = (s: State, token: string, clientMessageId = "pdf-message") => asUser(s.t, s.owner).action(api.messages.attachments.sendMessageWithAttachment, {
  conversationId: s.conversationId, uploadToken: token, body: "Private PDF", clientMessageId,
});

describe("Project PDF authenticated delivery", () => {
  test("owner receives bytes and safe headers; query/DTO never issues a native URL or storage ID", async () => {
    const s = await setup(), owner = asUser(s.t, s.otherClient);
    const url = await owner.query(api.projects.index.getAttachmentDownloadUrl, { attachmentId: s.attachmentId });
    expect(url).toBe(`https://example.convex.site/projects/attachments/${s.attachmentId}`);
    expect(url).not.toContain(s.storageId);
    expect(url).not.toContain("/api/storage/");
    const dto = await owner.query(api.projects.index.getMyProject, { projectId: s.victimProjectId });
    expect(JSON.stringify(dto)).not.toContain(s.storageId);
    expect(JSON.stringify(dto)).not.toContain("/api/storage/");
    const response = await owner.fetch(new URL(url!).pathname, { headers: { Origin: origin } });
    expect(response.status).toBe(200); expect(await response.text()).toBe(pdf);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="document.pdf"; filename\*=UTF-8''/);
    expect(response.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
  });

  test("copied endpoint, outsiders, Admin, SEO and guessed IDs fail safely on every request", async () => {
    const s = await setup();
    const url = await asUser(s.t, s.otherClient).query(api.projects.index.getAttachmentDownloadUrl, { attachmentId: s.attachmentId });
    const path = new URL(url!).pathname;
    for (const reader of [s.t, ...[s.client, s.owner, s.otherOwner, s.admin, s.seo].map(id => asUser(s.t, id))]) {
      const denied = await reader.fetch(path);
      expect(denied.status).toBe(404); expect(await denied.text()).toBe("Not found");
      expect(denied.headers.get("cache-control")).toContain("private, no-store");
    }
    await expect(s.t.query(api.projects.index.getAttachmentDownloadUrl, { attachmentId: s.attachmentId })).rejects.toThrow();
    for (const id of [s.client, s.owner, s.otherOwner, s.admin, s.seo]) {
      await expect(asUser(s.t, id).query(api.projects.index.getAttachmentDownloadUrl, { attachmentId: s.attachmentId })).rejects.toThrow();
    }
    const owner = asUser(s.t, s.otherClient);
    for (const suffix of ["guessed", "%ZZ", `${s.attachmentId}/extra`]) expect((await owner.fetch(`/projects/attachments/${suffix}`)).status).toBe(404);
    expect((await owner.fetch(path, { headers: { Origin: "https://evil.example" } })).status).toBe(404);
    await s.t.run(ctx => ctx.db.patch(s.otherClient, { accountType: "admin" }));
    expect((await owner.fetch(path)).status).toBe(404);
  });

  test("invalid stored PDF size/type and cross-owner attachment relationships fail closed", async () => {
    const s = await setup(), owner = asUser(s.t, s.otherClient), path = `/projects/attachments/${s.attachmentId}`;
    for (const patch of [{ size: pdf.length + 1 }, { size: 10 * 1024 * 1024 + 1 }, { contentType: "image/png" }, { projectId: s.projectId }]) {
      await s.t.run(ctx => ctx.db.patch(s.attachmentId, { size: pdf.length, contentType: "application/pdf", projectId: s.victimProjectId, ...patch }));
      expect((await owner.fetch(path)).status).toBe(404);
    }
  });
});

describe("Message temporary file binding and deletion", () => {
  test("the reproduced discard IDOR preserves another Client's attachment record and bytes", async () => {
    const s = await setup(), grant = await intent(s);
    await expect(discard(s, grant.uploadToken, s.storageId)).rejects.toThrow("INVALID_MESSAGE_PDF");
    await expect(s.t.mutation(internal.messages.attachments.cleanupFailedUpload, { storageId: s.storageId })).rejects.toThrow("PRIVATE_FILE_REFERENCED");
    expect(await s.t.run(ctx => ctx.db.get(s.attachmentId))).not.toBeNull();
    const response = await asUser(s.t, s.otherClient).fetch(`/projects/attachments/${s.attachmentId}`);
    expect(response.status).toBe(200); expect(await response.text()).toBe(pdf);
  });

  test("own bound temporary file discards once, retry is safe and cannot target another file", async () => {
    const s = await setup(), file = await upload(s);
    expect(file.storageId).not.toBe(s.storageId);
    await discard(s, file.uploadToken, file.storageId);
    await discard(s, file.uploadToken);
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(file.storageId)))).toBe(false);
    expect((await s.t.run(ctx => ctx.db.get(file.row._id)))?.discardedAt).toEqual(expect.any(Number));
    await expect(discard(s, file.uploadToken, s.storageId)).rejects.toThrow("INVALID_MESSAGE_PDF");
    await expect(send(s, file.uploadToken)).rejects.toThrow("INVALID_MESSAGE_PDF");
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(s.storageId)))).toBe(true);
  });

  test("cross-Company, anonymous and revoked membership cannot discard or upload", async () => {
    const s = await setup(), file = await upload(s);
    await expect(s.t.mutation(api.messages.attachments.discardAttachmentUpload, { conversationId: s.conversationId, uploadToken: file.uploadToken, storageId: file.storageId })).rejects.toThrow();
    for (const reader of [s.otherOwner, s.client, s.admin, s.seo].map(id => asUser(s.t, id))) {
      await expect(reader.mutation(api.messages.attachments.discardAttachmentUpload, { conversationId: s.conversationId, uploadToken: file.uploadToken, storageId: file.storageId })).rejects.toThrow();
    }
    await s.t.run(ctx => ctx.db.patch(s.membershipId, { status: "inactive" }));
    await expect(discard(s, file.uploadToken)).rejects.toThrow();
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(file.storageId)))).toBe(true);
  });

  test("commit consumes the exact bound file, replay is idempotent and discard cannot remove it", async () => {
    const s = await setup(), file = await upload(s);
    await expect(asUser(s.t, s.owner).action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: s.conversationId, uploadToken: file.uploadToken, storageId: s.storageId, body: "Wrong file", clientMessageId: "wrong-file",
    })).rejects.toThrow("INVALID_MESSAGE_PDF");
    const first = await send(s, file.uploadToken), again = await send(s, file.uploadToken);
    expect(again).toMatchObject({ messageId: first.messageId, duplicate: true });
    await expect(discard(s, file.uploadToken, file.storageId)).rejects.toThrow("INVALID_MESSAGE_PDF");
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(file.storageId)))).toBe(true);
  });

  test("discard between inspect and commit prevents a stale commit; commit first prevents deletion", async () => {
    const s = await setup(), file = await upload(s);
    const descriptor = await asUser(s.t, s.owner).query(internal.messages.attachments.inspectUpload, {
      userId: s.owner, conversationId: s.conversationId, uploadToken: file.uploadToken, clientMessageId: "race", now: Date.now(),
    });
    await discard(s, file.uploadToken);
    await expect(asUser(s.t, s.owner).mutation(internal.messages.attachments.commitAttachmentMessage, {
      userId: s.owner, conversationId: s.conversationId, uploadToken: file.uploadToken, storageId: descriptor.storageId, body: "Race", clientMessageId: "race",
    })).rejects.toThrow("INVALID_MESSAGE_PDF");
    expect(await s.t.run(ctx => ctx.db.query("messageAttachments").take(1))).toEqual([]);
  });

  test("discard before HTTP bind fences a late upload and guarded cleanup preserves committed bytes", async () => {
    const s = await setup(), grant = await intent(s), owner = asUser(s.t, s.owner);
    await owner.query(internal.messages.attachments.authorizeUpload, { uploadToken: grant.uploadToken, now: Date.now() });
    const storageId = await s.t.run(ctx => ctx.storage.store(new Blob([pdf], { type: "application/pdf" })));
    await discard(s, grant.uploadToken);
    await expect(owner.mutation(internal.messages.attachments.bindUpload, { uploadToken: grant.uploadToken, storageId })).rejects.toThrow();
    await s.t.mutation(internal.messages.attachments.cleanupFailedUpload, { storageId });
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(storageId)))).toBe(false);
    const file = await upload(s);
    await send(s, file.uploadToken);
    await s.t.mutation(internal.messages.attachments.cleanupFailedUpload, { storageId: file.storageId });
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(file.storageId)))).toBe(true);
  });

  test("simultaneous discard and commit cannot create a message whose PDF was deleted", async () => {
    const s = await setup(), file = await upload(s);
    const outcomes = await Promise.allSettled([send(s, file.uploadToken), discard(s, file.uploadToken)]);
    const attachments = await s.t.run(ctx => ctx.db.query("messageAttachments").take(2));
    const bytesExist = await s.t.run(async ctx => Boolean(await ctx.storage.get(file.storageId)));
    expect(outcomes.some(result => result.status === "fulfilled")).toBe(true);
    if (attachments.length) {
      expect(attachments).toHaveLength(1); expect(bytesExist).toBe(true);
      expect(outcomes[1].status).toBe("rejected");
    } else {
      expect(bytesExist).toBe(false); expect(outcomes[0].status).toBe("rejected");
    }
  });

  test("expired grants, reused uploads, legacy unbound grants and mismatched Company context fail closed", async () => {
    const s = await setup(), file = await upload(s), owner = asUser(s.t, s.owner);
    const post = (token: string) => owner.fetch("/messages/attachments/upload", { method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": token }, body: pdf });
    expect((await post(file.uploadToken)).status).toBe(400);
    await s.t.run(ctx => ctx.db.patch(file.row._id, { expiresAt: Date.now() - 1 }));
    await expect(discard(s, file.uploadToken)).rejects.toThrow();
    await expect(send(s, file.uploadToken)).rejects.toThrow();
    expect((await post(file.uploadToken)).status).toBe(400);
    const grant = await intent(s);
    const row = await s.t.run(ctx => ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", q => q.eq("token", grant.uploadToken)).unique());
    await s.t.run(ctx => ctx.db.patch(row!._id, { companyId: undefined }));
    expect((await post(grant.uploadToken)).status).toBe(400);
    await expect(discard(s, grant.uploadToken)).rejects.toThrow();
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(file.storageId)))).toBe(true);
  });

  test("HTTP upload requires current identity/CORS and exact bounded PDF bytes", async () => {
    const s = await setup(), grant = await intent(s);
    const headers = { "Content-Type": "application/pdf", "X-Upload-Token": grant.uploadToken };
    for (const reader of [s.t, asUser(s.t, s.otherOwner), asUser(s.t, s.client)]) expect((await reader.fetch("/messages/attachments/upload", { method: "POST", headers, body: pdf })).status).toBe(400);
    for (const options of [
      { headers: { ...headers, Origin: "https://evil.example" }, body: pdf },
      { headers: { ...headers, "Content-Type": "text/plain" }, body: pdf },
      { headers, body: "x".repeat(pdf.length) }, { headers, body: pdf.slice(0, -1) }, { headers, body: `${pdf}x` },
      { headers, body: `${pdf}${"x".repeat(10 * 1024 * 1024)}` },
    ]) expect((await asUser(s.t, s.owner).fetch("/messages/attachments/upload", { method: "POST", ...options })).status).toBe(400);
    const preflight = await s.t.fetch("/messages/attachments/upload", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type,x-upload-token" } });
    expect(preflight.status).toBe(204);
    const invalid = await s.t.fetch("/messages/attachments/upload", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
    expect(invalid.status).toBe(403);
  });

  test.each(["project", "message", "finalQuote", "verification", "logo", "cover", "portfolio"] as const)("even a bound file with a persistent %s reference cannot be discarded", async kind => {
    const s = await setup(), file = await upload(s);
    await s.t.run(async ctx => {
      if (kind === "project") await ctx.db.insert("projectAttachments", { projectId: s.victimProjectId, clientId: s.otherClient, storageId: file.storageId, fileName: "plan.pdf", contentType: "application/pdf", size: pdf.length, createdAt: 1 });
      if (kind === "message") {
        const messageId = await ctx.db.insert("messages", { conversationId: s.conversationId, senderUserId: s.owner, senderType: "company", body: "PDF", createdAt: 1 });
        await ctx.db.insert("messageAttachments", { conversationId: s.conversationId, messageId, storageId: file.storageId, uploadedByUserId: s.owner, kind: "pdf", originalFileName: "message.pdf", mimeType: "application/pdf", sizeBytes: pdf.length, createdAt: 1 });
      }
      if (kind === "finalQuote") {
        const finalQuoteId = await ctx.db.insert("finalQuotes", { projectId: s.projectId, clientId: s.client, companyId: s.companyId, initialQuoteId: s.quoteId, conversationId: s.conversationId, status: "draft", requestedAt: 1, requestedByUserId: s.client, requestTrigger: "client_request", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("finalQuoteRevisions", { finalQuoteId, revisionNumber: 1, price: 100, currency: "MAD", duration: 5, plannedStartDate: "2099-01-01", validUntil: "2099-02-01", scope: "Quote scope", inclusions: "Work", exclusions: "None", paymentTerms: "Milestones", pdfStorageId: file.storageId, submittedByUserId: s.owner, submittedAt: 1, createdAt: 1 });
      }
      if (kind === "verification") {
        const verificationId = await ctx.db.insert("companyVerifications", { companyId: s.companyId, legalName: "Atlas", ice: "123456789012345", rcNumber: "12345", legalRepresentative: "Owner", phone: "0612345678", address: "Private address", submittedAt: 1, createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("companyVerificationDocuments", { verificationId, companyId: s.companyId, documentType: "tax_compliance", storageId: file.storageId, fileName: "tax.pdf", contentType: "application/pdf", size: pdf.length, createdAt: 1, updatedAt: 1 });
      }
      const image = { companyId: s.companyId, storageId: file.storageId, contentType: "image/png" as const, size: pdf.length, sha256: "a".repeat(64), uploadedBy: s.owner, uploadedAt: 1, moderationStatus: "pending" as const };
      if (kind === "logo") await ctx.db.insert("companyLogoImages", image);
      if (kind === "cover") await ctx.db.insert("companyCoverImages", image);
      if (kind === "portfolio") {
        const portfolioProjectId = await ctx.db.insert("portfolioProjects", { companyId: s.companyId, title: "Portfolio", description: "Work description", projectType: "renovation", city: "Rabat", status: "draft", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("portfolioImages", { ...image, portfolioProjectId, purpose: "cover" });
      }
    });
    await expect(discard(s, file.uploadToken)).rejects.toThrow();
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(file.storageId)))).toBe(true);
    expect((await s.t.run(ctx => ctx.db.get(file.row._id)))?.discardedAt).toBeUndefined();
  });

  test("concurrent bind attempts cannot change the first received file", async () => {
    const s = await setup(), grant = await intent(s), owner = asUser(s.t, s.owner);
    const results = await Promise.all([1, 2].map(() => owner.fetch("/messages/attachments/upload", { method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": grant.uploadToken }, body: pdf })));
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    const row = await s.t.run(ctx => ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", q => q.eq("token", grant.uploadToken)).unique());
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(row!.storageId!)))).toBe(true);
  });
});
