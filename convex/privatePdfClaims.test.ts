/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const pdf = "%PDF-1.7 private client plan";
const origin = "https://www.batiplusmaroc.com";
const revision = { price: 100, duration: 5, plannedStartDate: "2099-02-01", validUntil: "2099-12-31",
  scope: "Complete structural work and finishing", inclusions: "Labour and materials", exclusions: "None", paymentTerms: "Pay after completion" };
type Domain = "project" | "finalQuote";
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
    const client = await user("client"), victim = await user("client"), owner = await user("company"), otherOwner = await user("company");
    const admin = await user("admin"), seo = await user("seo_team");
    const companyId = await ctx.db.insert("companies", { name: "Atlas", verificationStatus: "verified", onboardingStatus: "completed", createdAt: 1, updatedAt: 1 });
    const otherCompany = await ctx.db.insert("companies", { name: "Other", verificationStatus: "verified", onboardingStatus: "completed", createdAt: 1, updatedAt: 1 });
    const memberId = await ctx.db.insert("companyMembers", { userId: owner, companyId, role: "owner", status: "active", createdAt: 1 });
    await ctx.db.insert("companyMembers", { userId: otherOwner, companyId: otherCompany, role: "owner", status: "active", createdAt: 1 });
    const project = (clientId: Id<"users">, status: "draft" | "published") => ctx.db.insert("projects", { clientId, status,
      title: "Private project", countryCode: "MA", surfaceUnknown: true, visibility: "marketplace", lastCompletedStep: 0, createdAt: 1, updatedAt: 1 });
    const projectId = await project(client, "draft"), otherProjectId = await project(client, "draft"), victimProject = await project(victim, "draft");
    const publicProject = await project(client, "published");
    const quoteId = await ctx.db.insert("projectQuotes", { projectId: publicProject, companyId, submittedByUserId: owner,
      message: "An initial quote message", estimatedPrice: 100, currency: "MAD", estimatedDuration: 5, availableStartDate: "2099-01-01",
      scope: "Complete structural work", quoteType: "initial", status: "discussion_open", createdAt: 1, updatedAt: 1, submittedAt: 1 });
    const conversationId = await ctx.db.insert("conversations", { projectId: publicProject, quoteId, clientId: client,
      companyId, status: "active", createdBy: client, createdAt: 1, updatedAt: 1 });
    const finalQuoteId = await ctx.db.insert("finalQuotes", { projectId: publicProject, companyId, clientId: client, initialQuoteId: quoteId,
      conversationId, status: "draft", requestTrigger: "client_request", requestedAt: 1, requestedByUserId: client, createdAt: 1, updatedAt: 1 });
    const victimStorage = await ctx.storage.store(new Blob([pdf], { type: "application/pdf" }));
    const victimAttachment = await ctx.db.insert("projectAttachments", { projectId: victimProject, clientId: victim, storageId: victimStorage,
      fileName: "victim.pdf", contentType: "application/pdf", size: pdf.length, createdAt: 1 });
    return { client, victim, owner, otherOwner, admin, seo, companyId, memberId, projectId, otherProjectId, publicProject, quoteId,
      conversationId, finalQuoteId, victimStorage, victimAttachment };
  });
  return { t, ...data };
}
type State = Awaited<ReturnType<typeof setup>>;
const asUser = (s: State, id: Id<"users">) => s.t.withIdentity({ subject: `${id}|session` });
const actor = (s: State, domain: Domain) => asUser(s, domain === "project" ? s.client : s.owner);
const path = (domain: Domain) => domain === "project" ? "/projects/attachments/upload" : "/final-quotes/pdf/upload";
async function grant(s: State, domain: Domain) {
  const metadata = { fileName: "private.pdf", contentType: "application/pdf", size: pdf.length };
  return domain === "project"
    ? actor(s, domain).mutation(api.projects.index.generateAttachmentUploadUrl, { projectId: s.projectId, ...metadata })
    : actor(s, domain).mutation(api.finalQuotes.index.generatePdfUploadUrl, { finalQuoteId: s.finalQuoteId, ...metadata });
}
async function row(s: State, domain: Domain, token: string) {
  return s.t.run(async ctx => {
    if (domain === "project") return await ctx.db.query("projectAttachmentUploadIntents").withIndex("by_token", q => q.eq("token", token)).unique();
    return await ctx.db.query("finalQuoteUploadIntents").withIndex("by_token", q => q.eq("token", token)).unique();
  });
}
const post = (s: State, domain: Domain, token: string, body = pdf) => actor(s, domain).fetch(path(domain), {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/pdf", "X-Upload-Token": token }, body,
});
async function uploaded(s: State, domain: Domain) {
  const intent = await grant(s, domain);
  const response = await post(s, domain, intent.uploadToken);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ uploaded: true });
  const bound = await row(s, domain, intent.uploadToken);
  expect(bound?.storageId).toBeDefined();
  const metadata = await s.t.run(ctx => ctx.db.system.get("_storage", bound!.storageId!));
  expect(bound?.sha256).toBe(metadata?.sha256);
  return { ...intent, bound: bound!, storageId: bound!.storageId! };
}
const commit = (s: State, domain: Domain, token: string) => domain === "project"
  ? actor(s, domain).mutation(api.projects.index.saveFiles, { projectId: s.projectId, imageUploadTokens: [], documents: [{ uploadToken: token }] })
  : actor(s, domain).mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision, pdf: { uploadToken: token } });
const discard = (s: State, domain: Domain, token: string) => domain === "project"
  ? actor(s, domain).mutation(api.projects.attachments.discardUpload, { projectId: s.projectId, uploadToken: token })
  : actor(s, domain).mutation(api.finalQuotes.pdfUploads.discardUpload, { finalQuoteId: s.finalQuoteId, uploadToken: token });
const bind = (s: State, domain: Domain, token: string, storageId: Id<"_storage">) => domain === "project"
  ? actor(s, domain).mutation(internal.projects.attachments.bindUpload, { uploadToken: token, storageId })
  : actor(s, domain).mutation(internal.finalQuotes.pdfUploads.bindUpload, { uploadToken: token, storageId });
async function bytesExist(s: State, id: Id<"_storage">) { return s.t.run(async ctx => Boolean(await ctx.storage.get(id))); }

describe.each(["project", "finalQuote"] as const)("%s PDF claim boundary", domain => {
  test("authorized upload creates a new private file; token-only commit works without exposing storage IDs", async () => {
    const s = await setup(), file = await uploaded(s, domain);
    expect(file.storageId).not.toBe(s.victimStorage);
    expect(file.uploadUrl).toBe(`https://example.convex.site${path(domain)}`);
    const result = await commit(s, domain, file.uploadToken);
    if (domain === "project") {
      const dto = await actor(s, domain).query(api.projects.index.getMyProject, { projectId: s.projectId });
      expect(JSON.stringify(dto)).not.toContain(file.storageId);
      expect(await (await actor(s, domain).fetch(`/projects/attachments/${dto!.attachments[0].id}`)).text()).toBe(pdf);
    } else {
      expect(result).toHaveProperty("revisionId");
      const dto = await actor(s, domain).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
      expect(JSON.stringify(dto)).not.toContain(file.storageId);
    }
    await expect(commit(s, domain, file.uploadToken)).rejects.toThrow();
    await expect(discard(s, domain, file.uploadToken)).rejects.toThrow();
    await s.t.mutation(internal.storage.privatePdf.cleanupFailedUpload, { storageId: file.storageId });
    expect(await bytesExist(s, file.storageId)).toBe(true);
  });

  test("exact exploit: a supplied victim storage ID is rejected, and victim bytes/record survive", async () => {
    const s = await setup(), intent = await grant(s, domain);
    if (domain === "project") {
      const malicious = { projectId: s.projectId, imageUploadTokens: [], documents: [{ uploadToken: intent.uploadToken, storageId: s.victimStorage, fileName: "stolen.pdf" }] };
      await expect(actor(s, domain).mutation(api.projects.index.saveFiles, malicious)).rejects.toThrow();
    } else {
      const malicious = { conversationId: s.conversationId, ...revision, pdf: { uploadToken: intent.uploadToken, storageId: s.victimStorage, fileName: "stolen.pdf" } };
      await expect(actor(s, domain).mutation(api.finalQuotes.index.submitRevision, malicious)).rejects.toThrow();
    }
    await expect(commit(s, domain, intent.uploadToken)).rejects.toThrow(); // Merely owning an unbound intent is insufficient.
    await expect(bind(s, domain, intent.uploadToken, s.victimStorage)).rejects.toThrow("PRIVATE_FILE_REFERENCED");
    expect(await s.t.run(ctx => ctx.db.get(s.victimAttachment))).not.toBeNull();
    expect((await actor(s, domain).fetch(`/projects/attachments/${s.victimAttachment}`)).status).toBe(404);
    const authorized = await asUser(s, s.victim).fetch(`/projects/attachments/${s.victimAttachment}`);
    expect(authorized.status).toBe(200); expect(await authorized.text()).toBe(pdf);
  });

  test("cross-account roles cannot upload, claim or discard the owner's intent", async () => {
    const s = await setup(), file = await uploaded(s, domain);
    const users = domain === "project" ? [s.victim, s.owner, s.otherOwner, s.admin, s.seo] : [s.client, s.victim, s.otherOwner, s.admin, s.seo];
    for (const user of users) {
      const outsider = asUser(s, user);
      expect((await outsider.fetch(path(domain), { method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": file.uploadToken }, body: pdf })).status).toBe(400);
      if (domain === "project") {
        await expect(outsider.mutation(api.projects.index.saveFiles, { projectId: s.projectId, imageUploadTokens: [], documents: [{ uploadToken: file.uploadToken }] })).rejects.toThrow();
        await expect(outsider.mutation(api.projects.attachments.discardUpload, { projectId: s.projectId, uploadToken: file.uploadToken })).rejects.toThrow();
      } else {
        await expect(outsider.mutation(api.finalQuotes.index.submitRevision, { conversationId: s.conversationId, ...revision, pdf: { uploadToken: file.uploadToken } })).rejects.toThrow();
        await expect(outsider.mutation(api.finalQuotes.pdfUploads.discardUpload, { finalQuoteId: s.finalQuoteId, uploadToken: file.uploadToken })).rejects.toThrow();
      }
    }
    expect((await s.t.fetch(path(domain), { method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": file.uploadToken }, body: pdf })).status).toBe(400);
    expect(await bytesExist(s, file.storageId)).toBe(true);
  });

  test("expiry before upload or after authorization fences upload, bind and commit", async () => {
    const s = await setup(), intent = await grant(s, domain), entry = await row(s, domain, intent.uploadToken);
    const storageId = await s.t.run(ctx => ctx.storage.store(new Blob([pdf], { type: "application/pdf" })));
    if (domain === "project") await actor(s, domain).query(internal.projects.attachments.authorizeUpload, { uploadToken: intent.uploadToken, now: Date.now() });
    else await actor(s, domain).query(internal.finalQuotes.pdfUploads.authorizeUpload, { uploadToken: intent.uploadToken, now: Date.now() });
    await s.t.run(ctx => ctx.db.patch(entry!._id, { expiresAt: Date.now() - 1 }));
    expect((await post(s, domain, intent.uploadToken)).status).toBe(400);
    await expect(bind(s, domain, intent.uploadToken, storageId)).rejects.toThrow();
    await s.t.mutation(internal.storage.privatePdf.cleanupFailedUpload, { storageId });
    expect(await bytesExist(s, storageId)).toBe(false);
    const file = await uploaded(s, domain);
    await s.t.run(ctx => ctx.db.patch(file.bound._id, { expiresAt: Date.now() - 1 }));
    await expect(commit(s, domain, file.uploadToken)).rejects.toThrow();
    expect(await bytesExist(s, file.storageId)).toBe(true);
  });

  test("binding is immutable, duplicate uploads lose safely, and hash tampering fails closed", async () => {
    const s = await setup(), intent = await grant(s, domain);
    const responses = await Promise.all([post(s, domain, intent.uploadToken), post(s, domain, intent.uploadToken)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
    const entry = await row(s, domain, intent.uploadToken);
    const another = await s.t.run(ctx => ctx.storage.store(new Blob([pdf], { type: "application/pdf" })));
    await expect(bind(s, domain, intent.uploadToken, another)).rejects.toThrow();
    expect((await row(s, domain, intent.uploadToken))?.storageId).toBe(entry!.storageId);
    const anotherIntent = await grant(s, domain);
    await expect(bind(s, domain, anotherIntent.uploadToken, entry!.storageId!)).rejects.toThrow("PRIVATE_FILE_REFERENCED");
    await s.t.run(ctx => ctx.db.patch(entry!._id, { sha256: "0".repeat(64) }));
    await expect(commit(s, domain, intent.uploadToken)).rejects.toThrow();
    expect(await bytesExist(s, entry!.storageId!)).toBe(true);
  });

  test("discard tombstone blocks late binding and commit; replay is safe", async () => {
    const s = await setup(), intent = await grant(s, domain);
    await discard(s, domain, intent.uploadToken);
    const storageId = await s.t.run(ctx => ctx.storage.store(new Blob([pdf], { type: "application/pdf" })));
    await expect(bind(s, domain, intent.uploadToken, storageId)).rejects.toThrow();
    const file = await uploaded(s, domain);
    await discard(s, domain, file.uploadToken); await discard(s, domain, file.uploadToken);
    await expect(commit(s, domain, file.uploadToken)).rejects.toThrow();
    expect(await bytesExist(s, file.storageId)).toBe(false);
  });

  test("concurrent commit/discard and duplicate commit never leave a referenced file deleted", async () => {
    const s = await setup(), file = await uploaded(s, domain);
    await Promise.allSettled([commit(s, domain, file.uploadToken), discard(s, domain, file.uploadToken)]);
    const refCount = await s.t.run(async ctx => {
      if (domain === "project") return (await ctx.db.query("projectAttachments").withIndex("by_storageId", q => q.eq("storageId", file.storageId)).take(2)).length;
      return (await ctx.db.query("finalQuoteRevisions").withIndex("by_pdfStorageId", q => q.eq("pdfStorageId", file.storageId)).take(2)).length;
    });
    expect(refCount).toBeLessThanOrEqual(1);
    expect(await bytesExist(s, file.storageId)).toBe(refCount === 1);
    const fresh = await setup(), otherFile = await uploaded(fresh, domain);
    const results = await Promise.allSettled([commit(fresh, domain, otherFile.uploadToken), commit(fresh, domain, otherFile.uploadToken)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await bytesExist(fresh, otherFile.storageId)).toBe(true);
  });

  test("validates actual PDF bytes, size, MIME and strict CORS", async () => {
    const s = await setup(), intent = await grant(s, domain);
    for (const body of [pdf.slice(0, -1), `${pdf}x`, "x".repeat(pdf.length), `${pdf}${"x".repeat(15 * 1024 * 1024)}`]) {
      expect((await post(s, domain, intent.uploadToken, body)).status).toBe(400);
    }
    const headerOverrides: Record<string, string>[] = [{ "Content-Type": "text/plain" }, { Origin: "https://evil.example" }, { "Content-Length": "999" }];
    for (const headers of headerOverrides) {
      expect((await actor(s, domain).fetch(path(domain), { method: "POST", headers: { Origin: origin, "Content-Type": "application/pdf", "X-Upload-Token": intent.uploadToken, ...headers }, body: pdf })).status).toBe(400);
    }
    expect((await row(s, domain, intent.uploadToken))?.storageId).toBeUndefined();
    expect((await s.t.fetch(path(domain), { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type,x-upload-token" } })).status).toBe(204);
    expect((await s.t.fetch(path(domain), { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } })).status).toBe(403);
    expect((await post(s, domain, intent.uploadToken)).status).toBe(200);
  });

  test.each(["project", "message", "finalQuote", "verification", "logo", "cover", "portfolio"] as const)("a persistently referenced %s file cannot be claimed or discarded", async kind => {
    const s = await setup(), file = await uploaded(s, domain);
    await s.t.run(async ctx => {
      if (kind === "project") await ctx.db.insert("projectAttachments", { projectId: s.projectId, clientId: s.client, storageId: file.storageId, fileName: "plan.pdf", contentType: "application/pdf", size: pdf.length, createdAt: 1 });
      if (kind === "message") {
        const messageId = await ctx.db.insert("messages", { conversationId: s.conversationId, senderUserId: s.owner, senderType: "company", body: "PDF", createdAt: 1 });
        await ctx.db.insert("messageAttachments", { conversationId: s.conversationId, messageId, storageId: file.storageId, uploadedByUserId: s.owner, kind: "pdf", originalFileName: "message.pdf", mimeType: "application/pdf", sizeBytes: pdf.length, createdAt: 1 });
      }
      if (kind === "finalQuote") await ctx.db.insert("finalQuoteRevisions", { finalQuoteId: s.finalQuoteId, revisionNumber: 1, ...revision, currency: "MAD", pdfStorageId: file.storageId, submittedByUserId: s.owner, submittedAt: 1, createdAt: 1 });
      if (kind === "verification") {
        const verificationId = await ctx.db.insert("companyVerifications", { companyId: s.companyId, legalName: "Atlas", ice: "123456789012345", rcNumber: "12345", legalRepresentative: "Owner", phone: "0612345678", address: "Private address", submittedAt: 1, createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("companyVerificationDocuments", { companyId: s.companyId, verificationId, storageId: file.storageId, documentType: "ice", fileName: "ice.pdf", contentType: "application/pdf", size: pdf.length, createdAt: 1, updatedAt: 1 });
      }
      const image = { companyId: s.companyId, storageId: file.storageId, contentType: "image/png" as const, size: pdf.length, sha256: "a".repeat(64), uploadedBy: s.owner, uploadedAt: 1, moderationStatus: "pending" as const };
      if (kind === "logo") await ctx.db.insert("companyLogoImages", image);
      if (kind === "cover") await ctx.db.insert("companyCoverImages", image);
      if (kind === "portfolio") {
        const portfolioProjectId = await ctx.db.insert("portfolioProjects", { companyId: s.companyId, title: "Portfolio", description: "Work description", projectType: "renovation", city: "Rabat", status: "draft", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("portfolioImages", { ...image, portfolioProjectId, purpose: "cover" });
      }
    });
    await expect(commit(s, domain, file.uploadToken)).rejects.toThrow();
    await expect(discard(s, domain, file.uploadToken)).rejects.toThrow();
    expect(await bytesExist(s, file.storageId)).toBe(true);
    expect((await row(s, domain, file.uploadToken))?.claimedAt).toBeUndefined();
  });
});

test("wrong Project and wrong Final Quote cannot consume bound intents", async () => {
  const s = await setup(), file = await uploaded(s, "project");
  await expect(asUser(s, s.client).mutation(api.projects.index.saveFiles, { projectId: s.otherProjectId, imageUploadTokens: [], documents: [{ uploadToken: file.uploadToken }] })).rejects.toThrow();
  const quoteFile = await uploaded(s, "finalQuote");
  const other = await s.t.run(async ctx => {
    await ctx.db.patch(s.otherProjectId, { status: "published" });
    const otherQuote = await ctx.db.insert("projectQuotes", { projectId: s.otherProjectId, companyId: s.companyId, submittedByUserId: s.owner, message: "An initial quote message", estimatedPrice: 100, currency: "MAD", estimatedDuration: 5, availableStartDate: "2099-01-01", scope: "Complete structural work", quoteType: "initial", status: "discussion_open", createdAt: 1, updatedAt: 1, submittedAt: 1 });
    const conversation = await ctx.db.insert("conversations", { projectId: s.otherProjectId, quoteId: otherQuote, clientId: s.client, companyId: s.companyId, status: "active", createdBy: s.client, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("finalQuotes", { projectId: s.otherProjectId, companyId: s.companyId, clientId: s.client, initialQuoteId: otherQuote,
      conversationId: conversation, status: "draft", requestTrigger: "client_request", requestedAt: 1, requestedByUserId: s.client, createdAt: 1, updatedAt: 1 });
    return conversation;
  });
  await expect(asUser(s, s.owner).mutation(api.finalQuotes.index.submitRevision, { conversationId: other, ...revision, pdf: { uploadToken: quoteFile.uploadToken } })).rejects.toThrow();
  await expect(asUser(s, s.owner).mutation(api.finalQuotes.pdfUploads.discardUpload, { finalQuoteId: "missing" as Id<"finalQuotes">, uploadToken: quoteFile.uploadToken })).rejects.toThrow();
});

test("Project owner role and ownership are rechecked after bytes arrive", async () => {
  for (const mode of ["role", "ownership", "state"] as const) {
    const s = await setup(), file = await uploaded(s, "project"), intent = await grant(s, "project");
    await s.t.run(async ctx => {
      if (mode === "role") await ctx.db.patch(s.client, { accountType: "company" });
      if (mode === "ownership") await ctx.db.patch(s.projectId, { clientId: s.victim });
      if (mode === "state") await ctx.db.patch(s.projectId, { status: "published" });
    });
    expect((await post(s, "project", intent.uploadToken)).status).toBe(400);
    await expect(commit(s, "project", file.uploadToken)).rejects.toThrow();
    expect(await bytesExist(s, file.storageId)).toBe(true);
  }
});

test("Company authorization and suspension are rechecked after upload, before claim and bind", async () => {
  for (const mode of ["inactive", "suspended", "unverified", "relationship"] as const) {
    const s = await setup(), file = await uploaded(s, "finalQuote"), unbound = await grant(s, "finalQuote");
    await s.t.run(async ctx => {
      if (mode === "inactive") await ctx.db.patch(s.memberId, { status: "inactive" });
      if (mode === "suspended") await ctx.db.patch(s.companyId, { operationalStatus: "suspended" });
      if (mode === "unverified") await ctx.db.patch(s.companyId, { verificationStatus: "rejected" });
      if (mode === "relationship") await ctx.db.patch(s.conversationId, { clientId: s.victim });
    });
    expect((await post(s, "finalQuote", unbound.uploadToken)).status).toBe(400);
    await expect(commit(s, "finalQuote", file.uploadToken)).rejects.toThrow();
    expect(await bytesExist(s, file.storageId)).toBe(true);
  }
});

test("intent metadata limits and historical unbound grants fail closed", async () => {
  const s = await setup();
  for (const metadata of [{ size: 0 }, { size: 15 * 1024 * 1024 + 1 }, { size: 1.5 }, { contentType: "image/png" }]) {
    const args = { fileName: "private.pdf", contentType: "application/pdf", size: pdf.length, ...metadata };
    await expect(asUser(s, s.client).mutation(api.projects.index.generateAttachmentUploadUrl, { projectId: s.projectId, ...args })).rejects.toThrow();
    await expect(asUser(s, s.owner).mutation(api.finalQuotes.index.generatePdfUploadUrl, { finalQuoteId: s.finalQuoteId, ...args })).rejects.toThrow();
  }
  await s.t.run(async ctx => {
    await ctx.db.insert("projectAttachmentUploadIntents", { projectId: s.projectId, userId: s.client, token: "old-project", expiresAt: Date.now() + 10000, createdAt: 1 });
    await ctx.db.insert("finalQuoteUploadIntents", { finalQuoteId: s.finalQuoteId, userId: s.owner, token: "old-quote", expiresAt: Date.now() + 10000, createdAt: 1 });
  });
  await expect(commit(s, "project", "old-project")).rejects.toThrow();
  await expect(commit(s, "finalQuote", "old-quote")).rejects.toThrow();
  expect((await post(s, "project", "old-project")).status).toBe(400);
  expect((await post(s, "finalQuote", "old-quote")).status).toBe(400);
});
