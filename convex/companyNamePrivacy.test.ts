/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { marketplacePushPresentation } from "./notifications/pushPresentation";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notifications/deliveryPolicy";
import { sanitizeMessagePdfFileName } from "./messages/attachmentRules";
import { companyFileNamesForConversation, companyFileNamesForRelationship, resolveCompanyIdentityAudience } from "./lib/companyName";
import type { MutationCtx } from "./_generated/server";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
const NAME = "S2MBOU SARL";
const LEGAL_NAME = "S2MBOU Construction SARL";
const MASKED = "S2**** SA**";
const pageOpts = { numItems: 20, cursor: null };

beforeAll(() => { process.env.R2_PUBLIC_BASE_URL = "https://media.example.test"; process.env.CONVEX_SITE_URL = "https://example.convex.site"; });

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` });
}

function expectPrivateNameAbsent(dto: unknown) {
  const serialized = JSON.stringify(dto);
  expect(serialized).not.toContain(NAME);
  expect(serialized).not.toContain(LEGAL_NAME);
  expect(serialized).not.toMatch(/"(?:realName|legalName|directorySearchText)":/);
  expect(serialized).not.toMatch(/"(?:uploadFileName|pdfUploadFileName)":/);
}

async function setup() {
  const t = convexTest(schema, modules);
  const state = await t.run(async (ctx) => {
    const user = (accountType: "client" | "company" | "admin", firstName: string) => ctx.db.insert("users", {
      accountType, firstName, lastName: "Test", onboardingStatus: "completed", createdAt: 1, updatedAt: 1,
    });
    const clientId = await user("client", "Sara");
    const otherClientId = await user("client", "Lina");
    const ownerId = await user("company", "Owner");
    const staffId = await user("company", "Staff");
    const adminId = await user("admin", "Admin");
    const companyId = await ctx.db.insert("companies", {
      name: NAME, legalName: LEGAL_NAME, slug: "company-under-test", city: "Rabat",
      description: `${NAME} delivers projects. Legal entity: ${LEGAL_NAME}.`,
      directorySearchText: `${NAME} rabat renovation`, directoryListed: true,
      operationalStatus: "normal", onboardingStatus: "completed", verificationStatus: "verified",
      createdAt: 1, updatedAt: 1,
    });
    for (const [userId, role] of [[ownerId, "owner"], [staffId, "staff"]] as const) {
      await ctx.db.insert("companyMembers", { companyId, userId, role, status: "active", createdAt: 1 });
    }
    await ctx.db.insert("companyServices", { companyId, service: "renovation", createdAt: 1, updatedAt: 1 });
    const coverImageStorageId = await ctx.storage.store(new Blob(["image"], { type: "image/jpeg" }));
    const portfolioProjectId = await ctx.db.insert("portfolioProjects", {
      companyId, title: `Work by ${NAME}`, description: `Built by ${LEGAL_NAME}.`,
      city: "Rabat", projectType: "renovation", coverImageStorageId, status: "published", createdAt: 1, updatedAt: 1,
    });
    const gallerySlotId = await ctx.db.insert("portfolioMedia", {
      portfolioProjectId, storageId: coverImageStorageId, caption: `Construction by ${NAME}.`, sortOrder: 0, createdAt: 1,
    });
    // Approved private fixtures keep text-redaction coverage independent of legacy delivery.
    for (const purpose of ["cover", "gallery"] as const) {
      const storageId = await ctx.storage.store(new Blob(["image"], { type: "image/jpeg" }));
      const metadata = (await ctx.db.system.get("_storage", storageId))!;
      const imageId = await ctx.db.insert("portfolioImages", {
        companyId, portfolioProjectId, purpose, ...(purpose === "gallery" ? { gallerySlotId } : {}),
        storageId, contentType: "image/jpeg", size: metadata.size, sha256: metadata.sha256,
        uploadedBy: ownerId, uploadedAt: 1, moderationStatus: "approved",
      });
      await ctx.db.patch(purpose === "gallery" ? gallerySlotId : portfolioProjectId, { submittedImageId: imageId, approvedImageId: imageId });
    }
    const projectId = await ctx.db.insert("projects", {
      clientId, title: "Villa renovation", description: "A complete renovation project.",
      primaryCategory: "renovation", city: "rabat", countryCode: "MA", propertyType: "house",
      surfaceUnknown: true, timeline: "flexible", visibility: "marketplace", status: "in_discussion",
      lastCompletedStep: 6, createdAt: 1, updatedAt: 1,
    });
    const quoteId = await ctx.db.insert("projectQuotes", {
      projectId, companyId, submittedByUserId: ownerId, message: `${NAME} can complete this construction project.`,
      scope: `${LEGAL_NAME} provides all materials and labour.`, estimatedPrice: 100_000, currency: "MAD",
      estimatedDuration: 30, availableStartDate: "2099-01-01", quoteType: "initial", status: "discussion_open",
      createdAt: 2, updatedAt: 2, submittedAt: 2,
    });
    await ctx.db.insert("quoteStatusHistory", {
      quoteId, oldStatus: "submitted", newStatus: "discussion_open", changedBy: clientId,
      changedAt: 3, reason: `Discuss work with ${LEGAL_NAME}.`,
    });
    const invitationId = await ctx.db.insert("invitations", {
      projectId, clientUserId: clientId, companyId, message: `Invite ${NAME} to this project.`,
      status: "accepted", createdAt: 1, updatedAt: 2, acceptedAt: 2,
    });
    const conversationId = await ctx.db.insert("conversations", {
      projectId, companyId, clientId, quoteId, invitationId, status: "active", createdBy: clientId,
      createdAt: 3, updatedAt: 4, lastMessagePreview: `${NAME} will send a quote.`, lastMessageAt: 4,
    });
    const messageId = await ctx.db.insert("messages", {
      conversationId, senderUserId: ownerId, senderType: "company", body: `${NAME} is ready; ${LEGAL_NAME} will handle the work.`, createdAt: 4,
    });
    const assessmentId = await ctx.db.insert("siteAssessments", {
      projectId, clientId, companyId, initialQuoteId: quoteId, conversationId,
      status: "accepted", active: true, invitedByUserId: clientId, invitedAt: 5, acceptedAt: 6,
      companyNote: `${NAME} will visit.`, createdAt: 5, updatedAt: 6,
    });
    const finalQuoteId = await ctx.db.insert("finalQuotes", {
      projectId, clientId, companyId, initialQuoteId: quoteId, conversationId, status: "submitted",
      requestedAt: 7, requestedByUserId: clientId, requestTrigger: "client_request", createdAt: 7, updatedAt: 8,
    });
    const revisionId = await ctx.db.insert("finalQuoteRevisions", {
      finalQuoteId, revisionNumber: 1, price: 100_000, currency: "MAD", duration: 30,
      plannedStartDate: "2099-01-01", validUntil: "2099-12-31", scope: `Work by ${NAME}.`,
      inclusions: `All materials from ${LEGAL_NAME}.`, exclusions: "Municipal fees.",
      paymentTerms: "Milestone payments.", companyNote: `Prepared by ${NAME}.`,
      submittedByUserId: ownerId, submittedAt: 8, createdAt: 8,
    });
    await ctx.db.patch(finalQuoteId, { currentRevisionId: revisionId });
    await ctx.db.insert("marketplaceSettings", {
      key: "global", commissionTiers: [{ minAmountMad: 0, maxAmountMad: null, commissionRateBps: 300 }],
      commissionConfigVersion: 1, updatedAt: 1, updatedByUserId: adminId,
    });
    for (const recipientUserId of [clientId, ownerId, staffId, adminId]) {
      await ctx.db.insert("notifications", {
        recipientUserId, type: "message_received", entity: { type: "conversation", id: conversationId }, actorUserId: ownerId,
        payload: { companyName: NAME, actorDisplayName: NAME, messagePreview: `${NAME} and ${LEGAL_NAME} will send a quote.`, projectTitle: "Villa renovation" }, createdAt: 9,
      });
    }
    return { clientId, otherClientId, ownerId, staffId, adminId, companyId, portfolioProjectId, projectId, quoteId, invitationId, conversationId, messageId, assessmentId, finalQuoteId, revisionId };
  });
  return { t, ...state };
}

async function uploadMessageFile(s: Awaited<ReturnType<typeof setup>>, fileName: string, body: string, key: string) {
  const company = asUser(s.t, s.ownerId);
  const blob = new Blob(["%PDF-1.7 regression"], { type: "application/pdf" });
  const upload = await company.mutation(api.messages.attachments.generateAttachmentUploadUrl, {
    conversationId: s.conversationId, fileName, contentType: "application/pdf", size: blob.size,
  });
  const response = await company.fetch("/messages/attachments/upload", {
    method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": upload.uploadToken }, body: blob,
  });
  expect(response.status).toBe(200);
  return company.action(api.messages.attachments.sendMessageWithAttachment, {
    conversationId: s.conversationId, body, clientMessageId: key, uploadToken: upload.uploadToken,
  });
}

async function expectSafeReferenceOutputs(
  s: Awaited<ReturnType<typeof setup>>, messageId: Id<"messages">, body: string, expected: string,
) {
  const sourceSnapshot = async (ctx: MutationCtx) => ({
    company: await ctx.db.get(s.companyId),
    revisions: await ctx.db.query("finalQuoteRevisions").withIndex("by_finalQuoteId_and_revisionNumber", q => q.eq("finalQuoteId", s.finalQuoteId)).take(101),
    quoteHistory: await ctx.db.query("quoteStatusHistory").withIndex("by_quoteId", q => q.eq("quoteId", s.quoteId)).take(100),
    activity: await ctx.db.query("marketplaceActivity").withIndex("by_conversationId_and_createdAt", q => q.eq("conversationId", s.conversationId)).take(100),
  });
  const before = await s.t.run(sourceSnapshot);
  const notificationIds = await s.t.run(async ctx => {
    await ctx.db.insert("notificationPreferences", {
      userId: s.clientId, ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: true, updatedAt: 1,
    });
    await ctx.db.insert("pushSubscriptions", {
      userId: s.clientId, endpoint: "https://push.example.test/reference-regression", p256dh: "test", auth: "test", locale: "en", createdAt: 1, updatedAt: 1,
    });
    return Promise.all([s.clientId, s.ownerId, s.adminId].map(recipientUserId => ctx.db.insert("notifications", {
      recipientUserId, type: "message_received", entity: { type: "conversation", id: s.conversationId }, actorUserId: s.ownerId,
      dedupeKey: `message:${messageId}:received`, payload: { companyName: NAME, projectTitle: body, messagePreview: body }, createdAt: Date.now() + 1,
    })));
  });
  const client = asUser(s.t, s.clientId);
  const messages = await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: { numItems: 1, cursor: null } });
  expect(messages.page[0].body).toBe(expected);
  expect((await client.query(api.messages.index.getConversation, { conversationId: s.conversationId })).preview).toBe(expected);
  expect((await client.query(api.messages.index.listMyThreads, {}))[0].preview).toBe(expected);
  const notifications = await client.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
  const notification = notifications.page.find(n => n.id === notificationIds[0])!;
  expect(notification.payload.messagePreview).toBe(expected);
  expect(notification.payload.projectTitle).toBe(expected);
  for (const dto of [messages, notification]) expectPrivateNameAbsent(dto);
  const claim = await s.t.mutation(internal.notifications.pushDeliveryModel.claimMarketplacePush, { notificationId: notificationIds[0], leaseId: "alias-regression" });
  expect(claim?.notification.payload.messagePreview).toBe(expected);
  expectPrivateNameAbsent(claim);
  for (const locale of ["fr", "en"] as const) {
    const push = marketplacePushPresentation(claim!.notification, "client", locale);
    expect(push.body).toContain(expected);
    expectPrivateNameAbsent(push);
  }
  await s.t.mutation(internal.notifications.pushDeliveryModel.completeMarketplacePush, {
    notificationId: notificationIds[0], recipientUserId: s.clientId, leaseId: "alias-regression",
    deliveredEndpoints: ["https://push.example.test/reference-regression"], permanentFailureEndpoints: [], temporaryFailureEndpoints: [],
  });
  for (const [userId, notificationId] of [[s.ownerId, notificationIds[1]], [s.adminId, notificationIds[2]]] as const) {
    const privileged = await asUser(s.t, userId).query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
    expect(privileged.page.find(n => n.id === notificationId)?.payload.messagePreview).toBe(body);
  }
  expect((await asUser(s.t, s.ownerId).query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: { numItems: 1, cursor: null } })).page[0].body).toBe(body);
  const stored = await s.t.run(async ctx => ({ message: await ctx.db.get(messageId), notification: await ctx.db.get(notificationIds[0]), deal: await ctx.db.query("deals").withIndex("by_projectId", q => q.eq("projectId", s.projectId)).unique() }));
  expect(stored.message?.body).toBe(body);
  expect(stored.notification?.payload.messagePreview).toBe(body);
  expect(stored.deal).toBeNull();
  expect(await s.t.run(sourceSnapshot)).toEqual(before);
}

describe("filename-reference regressions", () => {
  // Exercise push claims explicitly; never run external delivery actions.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test.each([
    "\\plans.pdf", "/plans.pdf", "\\---", "/---", "\\___", "/___",
    "\\   plans.pdf", "/   plans.pdf", "\\\tplans.pdf", "/\tplans.pdf",
  ])("legacy basename loss fails closed at every Client boundary (%s)", async path => {
    const s = await setup();
    const fileName = `S2MBOU SARL2026${path}`;
    const body = `Please see ${fileName}.`;
    const sent = await uploadMessageFile(s, fileName, body, "legacy-path-reference");
    const notificationId = await s.t.run(async ctx => {
      // Model a pre-alias upload: the old sanitizer stored only the basename.
      await ctx.db.patch(sent.attachmentId, { uploadFileName: undefined });
      await ctx.db.patch(s.revisionId, { scope: body });
      await ctx.db.patch(s.quoteId, { message: body });
      await ctx.db.patch(s.invitationId, { message: body });
      await ctx.db.patch(s.assessmentId, { companyNote: body });
      await ctx.db.insert("notificationPreferences", { userId: s.clientId, ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: true, updatedAt: 1 });
      await ctx.db.insert("pushSubscriptions", { userId: s.clientId, endpoint: "https://push.example.test/legacy-path", p256dh: "test", auth: "test", locale: "en", createdAt: 1, updatedAt: 1 });
      const rows = await ctx.db.query("notifications").withIndex("by_recipientUserId_and_createdAt", q => q.eq("recipientUserId", s.clientId)).take(20);
      return rows.find(row => row.dedupeKey === `message:${sent.messageId}:received`)!._id;
    });
    const client = asUser(s.t, s.clientId);
    for (const read of [
      () => client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts }),
      () => client.query(api.messages.index.getConversation, { conversationId: s.conversationId }),
      () => client.query(api.messages.index.listMyThreads, {}),
      () => client.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts }),
      () => client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId }),
      () => client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId }),
      () => client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId }),
      () => client.query(api.siteVisits.index.getForProject, { projectId: s.projectId }),
    ]) await expect(read()).rejects.toThrow("COMPANY_FILE_PRIVACY_LIMIT");
    await expect(s.t.mutation(internal.notifications.pushDeliveryModel.claimMarketplacePush, { notificationId, leaseId: "legacy-path" }))
      .rejects.toThrow("COMPANY_FILE_PRIVACY_LIMIT");
    expect((await s.t.run(ctx => ctx.db.get(notificationId)))?.pushDeliveryStatus).toBeUndefined();
    const own = asUser(s.t, s.ownerId);
    expect((await own.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body).toBe(body);
    expect((await asUser(s.t, s.adminId).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).finalQuote?.revisions[0].scope).toBe(body);
    expect((await client.query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: sent.attachmentId })).fileName).toBe("attachment.pdf");
    const stored = await s.t.run(ctx => ctx.db.get(sent.messageId));
    expect(stored?.body).toBe(body);
    expect(await s.t.run(ctx => ctx.db.get(sent.attachmentId))).toMatchObject({ originalFileName: sanitizeMessagePdfFileName(fileName) });
  });

  test.each([
    "\\plans?.PdF", "/plans?.PdF", "\\---", "/---",
    "\\   plans?.PdF", "/   plans?.PdF", "\\\tplans?.PdF", "/\tplans?.PdF",
  ])("retained full upload paths are safe in every preview (%s)", async path => {
    const s = await setup();
    const fileName = `S2MBOU SARL2026${path}`, body = `Please see ${fileName}.`;
    const sent = await uploadMessageFile(s, fileName, body, "retained-path-reference");
    const originalFileName = sanitizeMessagePdfFileName(fileName);
    const extension = /\.pdf$/iu.exec(originalFileName)![0];
    await expectSafeReferenceOutputs(s, sent.messageId, body, `Please see attachment${extension}.`);
    const stored = await s.t.run(ctx => ctx.db.get(sent.attachmentId));
    expect(stored).toMatchObject({ originalFileName, uploadFileName: fileName });
  });

  test("PDF-only long uploads return safe filenames without reconstructing an empty body", async () => {
    const s = await setup();
    const fileName = `${NAME}2026-${"supporting-document-".repeat(12)}.pdf`;
    const sent = await uploadMessageFile(s, fileName, "", "long-pdf-only");
    const client = asUser(s.t, s.clientId);
    const result = await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: { numItems: 1, cursor: null } });
    expect(result.page[0]).toMatchObject({ body: "", attachment: { fileName: "attachment.pdf" } });
    expect((await client.query(api.messages.index.getConversation, { conversationId: s.conversationId })).preview).toBe("attachment.pdf");
    expect((await client.query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: sent.attachmentId })).fileName).toBe("attachment.pdf");
    expectPrivateNameAbsent(result);
    expect((await s.t.run(ctx => ctx.db.get(sent.attachmentId)))?.uploadFileName).toBe(fileName);
  });

  test("missing legacy PDF filename metadata cannot silently omit an authorized file", async () => {
    const s = await setup();
    await s.t.run(async ctx => ctx.db.patch(s.revisionId, {
      pdfStorageId: await ctx.storage.store(new Blob(["%PDF-1.7 legacy"])), pdfFileName: undefined, pdfUploadFileName: undefined,
    }));
    const client = asUser(s.t, s.clientId);
    await expect(client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId }))
      .rejects.toThrow("COMPANY_FILE_PRIVACY_LIMIT");
    expect((await client.query(internal.finalQuotes.download.authorizePdfDownload, { revisionId: s.revisionId })).fileName).toBe("final-quote.pdf");
    for (const userId of [s.ownerId, s.adminId]) {
      const result = await asUser(s.t, userId).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
      expect(result.finalQuote).toMatchObject({ companyName: NAME, revisions: [{ hasPdf: true, scope: `Work by ${NAME}.` }] });
    }
  });

  test("long separator aliases cannot consume a full filename in any output", async () => {
    const s = await setup();
    const fileName = "report S2MBOU SARL2026.pdf", body = `Please see ${fileName}.`;
    const sent = await uploadMessageFile(s, fileName, body, "long-separator-reference");
    await s.t.run(async ctx => {
      await ctx.db.patch(s.revisionId, { pdfFileName: `report${"-".repeat(30)}`, scope: body,
        inclusions: body, exclusions: body, paymentTerms: body, companyNote: body });
      await ctx.db.patch(s.quoteId, { message: body, scope: body });
      await ctx.db.patch(s.invitationId, { message: body });
      await ctx.db.patch(s.assessmentId, { companyNote: body });
    });
    await expectSafeReferenceOutputs(s, sent.messageId, body, "Please see attachment.pdf.");
    const client = asUser(s.t, s.clientId);
    const fq = await client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
    for (const field of ["scope", "inclusions", "exclusions", "paymentTerms", "companyNote"] as const) expect(fq.finalQuote?.revisions[0][field]).toBe("Please see attachment.pdf.");
    expect((await client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId })).message).toBe("Please see attachment.pdf.");
    expect((await client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId }))[0].message).toBe("Please see attachment.pdf.");
    expect((await client.query(api.siteVisits.index.getForProject, { projectId: s.projectId })).assessment?.companyNote).toBe("Please see attachment.pdf.");
  });

  test("longest actual matches ignore upload ordering and original alias lengths in previews", async () => {
    const s = await setup();
    await uploadMessageFile(s, "S2MBOU SARL2026.pdf", "Older document.", "shorter-alias-first");
    vi.setSystemTime(Date.now() + 1_000);
    const fileName = "report S2MBOU SARL2026.pdf", body = `Please see ${fileName}.`;
    const sent = await uploadMessageFile(s, fileName, body, "longest-actual-span");
    await s.t.run(async ctx => {
      await ctx.db.patch(s.revisionId, { pdfFileName: `report${"-".repeat(30)}`, scope: body });
    });
    await expectSafeReferenceOutputs(s, sent.messageId, body, "Please see attachment.pdf.");
    expect((await asUser(s.t, s.clientId).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).finalQuote?.revisions[0].scope)
      .toBe("Please see attachment.pdf.");
  });

  test("filename lookups stay within the authorized conversation and Client relationship", async () => {
    const s = await setup();
    await uploadMessageFile(s, "our-file.pdf", "Ordinary text.", "isolated-reference");
    await s.t.run(async ctx => {
      const otherProjectId = await ctx.db.insert("projects", { clientId: s.otherClientId, countryCode: "MA", surfaceUnknown: true, visibility: "marketplace", status: "in_discussion", lastCompletedStep: 6, createdAt: 1, updatedAt: 1 });
      const otherConversationId = await ctx.db.insert("conversations", { projectId: otherProjectId, clientId: s.otherClientId, companyId: s.companyId, status: "active", createdBy: s.otherClientId, createdAt: 1, updatedAt: 1 });
      const messageId = await ctx.db.insert("messages", { conversationId: otherConversationId, senderUserId: s.ownerId, senderType: "company", body: "", createdAt: 1 });
      await ctx.db.insert("messageAttachments", { conversationId: otherConversationId, messageId, uploadedByUserId: s.ownerId, storageId: await ctx.storage.store(new Blob(["%PDF-1.7"])), kind: "pdf", originalFileName: "other-client-private.pdf", uploadFileName: "other-client-private?.pdf", mimeType: "application/pdf", sizeBytes: 8, createdAt: 1 });
      const conversation = (await ctx.db.get(s.conversationId))!;
      const files = await companyFileNamesForConversation(ctx, conversation, ["Ordinary text."]);
      expect(files.map(file => file.originalFileName)).toEqual(["our-file.pdf"]);
    });
    await expect(s.t.run(ctx => companyFileNamesForRelationship(ctx, s.projectId, s.companyId, s.otherClientId, ["Ordinary text."])))
      .rejects.toThrow("CONVERSATION_INTEGRITY_ERROR");
    expect((await asUser(s.t, s.clientId).query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body)
      .toBe("Ordinary text.");
  });
  test("complete lookup prefers an older full filename over a newer suffix outside the message page", async () => {
    const s = await setup();
    await uploadMessageFile(s, "S2MBOU SARL2026.pdf", "Older document.", "older-reference");
    vi.setSystemTime(Date.now() + 1_000);
    await s.t.run(ctx => ctx.db.patch(s.conversationId, { companyLastSentAt: 1 }));
    const body = "Please see S2MBOU SARL2026.pdf.";
    const sent = await uploadMessageFile(s, "2026.pdf", body, "newer-suffix");
    await expectSafeReferenceOutputs(s, sent.messageId, body, "Please see attachment.pdf.");
  });

  test.each([
    "S2MBOU SARL2026?.pdf", "S2MBOU-SARL2026?.pdf", "S2MBOU_SARL2026?.pdf",
    "S2MBOU SARL2026-E\u0301le\u0301vation.PdF", "S2MBOU  SARL2026.pdf", "S2MBOU SARL2026",
  ])("real uploads protect original and sanitized aliases in every preview: %s", async fileName => {
    const s = await setup();
    const storedFileName = sanitizeMessagePdfFileName(fileName);
    const extension = /\.pdf$/i.exec(storedFileName)![0];
    const body = `See ${fileName}. Then ${storedFileName.normalize("NFC")}.`;
    const expected = `See attachment${extension}. Then attachment${extension}.`;
    const sent = await uploadMessageFile(s, fileName, body, "original-alias");
    await expectSafeReferenceOutputs(s, sent.messageId, body, expected);
    const stored = await s.t.run(ctx => ctx.db.get(sent.attachmentId));
    expect(stored?.originalFileName).toBe(storedFileName);
    expect(stored?.uploadFileName).toBe(fileName);
    const own = await asUser(s.t, s.ownerId).query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: sent.attachmentId });
    expect(own.fileName).toBe(storedFileName);
  });

  test.each(["S2MBOU SARL2026", "S2MBOU  SARL2026?.pDf"])("accepted Final Quote upload aliases protect follow-up messages and related context: %s", async fileName => {
    const s = await setup();
    const company = asUser(s.t, s.ownerId), client = asUser(s.t, s.clientId);
    const body = `Please see ${fileName}.`;
    await s.t.run(async ctx => {
      await ctx.db.patch(s.assessmentId, { status: "cancelled", active: false });
      await ctx.db.patch(s.finalQuoteId, { status: "changes_requested" });
      await ctx.db.patch(s.quoteId, { message: body, scope: body });
      await ctx.db.patch(s.invitationId, { message: body });
      await ctx.db.patch(s.assessmentId, { companyNote: body });
    });
    const pdfBody = "%PDF-1.7 quote";
    const upload = await company.mutation(api.finalQuotes.index.generatePdfUploadUrl, { finalQuoteId: s.finalQuoteId, fileName, contentType: "application/pdf", size: pdfBody.length });
    const response = await company.fetch("/final-quotes/pdf/upload", { method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": upload.uploadToken }, body: pdfBody });
    expect(response.status).toBe(200);
    const submitted = await company.mutation(api.finalQuotes.index.submitRevision, {
      conversationId: s.conversationId, price: 100_000, duration: 30, plannedStartDate: "2099-01-01", validUntil: "2099-12-31",
      scope: body, inclusions: body, exclusions: body, paymentTerms: body, companyNote: body,
      pdf: { uploadToken: upload.uploadToken },
    });
    const sent = await company.mutation(api.messages.index.sendMessage, { conversationId: s.conversationId, body, clientMessageId: "extensionless-reference" });
    const expected = `Please see final-quote${/\.pdf$/i.exec(fileName)?.[0] ?? ".pdf"}.`;
    await expectSafeReferenceOutputs(s, sent.messageId, body, expected);
    const fq = await client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
    expect(fq.finalQuote?.revisions.find(r => r.id === submitted.revisionId)).toMatchObject({ scope: expected, inclusions: expected, exclusions: expected, paymentTerms: expected, companyNote: expected, pdfFileName: `final-quote${/\.pdf$/i.exec(fileName)?.[0] ?? ".pdf"}` });
    expect((await client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId }))?.message).toBe(expected);
    expect((await client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId }))[0].message).toBe(expected);
    expect((await client.query(api.siteVisits.index.getForProject, { projectId: s.projectId })).assessment?.companyNote).toBe(expected);
    for (const userId of [s.ownerId, s.adminId]) {
      expect((await asUser(s.t, userId).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).finalQuote?.revisions.find(r => r.id === submitted.revisionId)).toMatchObject({ scope: body.replace(/\s+/g, " "), pdfFileName: fileName.replace(/\s+/g, " ") });
    }
    const stored = await s.t.run(ctx => ctx.db.get(submitted.revisionId));
    expect(stored?.pdfFileName).toBe(fileName.replace(/\s+/g, " "));
    expect(stored?.pdfUploadFileName).toBe(fileName);
  });
});

describe("final release filename privacy regressions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test.each([false, true])("received proposals use the public description boundary without other Client aliases (discussion open: %s)", async openDiscussion => {
    const s = await setup();
    const fileName = "S2MBOU SARL2026.pdf", description = `Our completed work is described in ${fileName}.`;
    const sent = await uploadMessageFile(s, fileName, `See ${fileName}.`, "private-description-reference");
    const owner = asUser(s.t, s.ownerId), client = asUser(s.t, s.otherClientId);
    await owner.mutation(api.companies.index.updatePublicProfile, { description });
    const projectId = await s.t.run(async ctx => {
      // The public description cannot borrow aliases from this other Client,
      // even when that private conversation is above the fail-closed limit.
      const { _id, _creationTime, ...attachment } = (await ctx.db.get(sent.attachmentId))!;
      void _id; void _creationTime;
      for (let index = 0; index < 1_000; index++) {
        await ctx.db.insert("messageAttachments", { ...attachment, originalFileName: `private-${index}.pdf`, uploadFileName: `private-upload-${index}.pdf` });
      }
      return ctx.db.insert("projects", {
        clientId: s.otherClientId, title: "Another construction project", description: "A complete renovation project.",
        primaryCategory: "renovation", city: "rabat", countryCode: "MA", propertyType: "house",
        surfaceUnknown: true, timeline: "flexible", visibility: "marketplace", status: "published",
        publishedAt: Date.now(), lastCompletedStep: 6, createdAt: 1, updatedAt: 1,
      });
    });
    const submission = await owner.mutation(api.quotes.index.submitInitialQuote, {
      projectId, message: "We can complete this construction project.", scope: "All materials and labour included for this project.",
      estimatedPrice: 100_000, estimatedDuration: 30, availableStartDate: "2099-01-01",
    });
    expect(submission.conversationId).toBeNull();
    if (openDiscussion) await client.mutation(api.quotes.index.reviewInitialQuote, { quoteId: submission.quoteId, action: "open_discussion" });
    const read = async () => {
      const list = await client.query(api.quotes.index.listReceivedInitialQuotes, { projectId });
      const detail = await client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: submission.quoteId });
      return [list[0], detail] as const;
    };
    for (const dto of await read()) {
      expect(dto?.company).toMatchObject({ name: MASKED, description: "" });
      expectPrivateNameAbsent(dto);
      expect(JSON.stringify(dto)).not.toContain("private-upload-");
    }
    const safeDescription = `Work by ${NAME}; ordinary text remains.`;
    await owner.mutation(api.companies.index.updatePublicProfile, { description: safeDescription });
    for (const dto of await read()) expect(dto?.company.description).toBe(`Work by ${MASKED}; ordinary text remains.`);
    expect((await owner.query(api.companies.index.getProfileManager, {})).description).toBe(safeDescription);
    expect((await s.t.run(ctx => ctx.db.get(s.companyId)))?.description).toBe(safeDescription);
    expect((await s.t.run(ctx => ctx.db.get(sent.messageId)))?.body).toBe(`See ${fileName}.`);
    await expect(asUser(s.t, s.clientId).query(api.quotes.index.getReceivedInitialQuote, { quoteId: submission.quoteId }))
      .rejects.toThrow("PROJECT_NOT_FOUND");
  });

  test("public directory and profile withhold unresolved filename identity without private lookups", async () => {
    const s = await setup();
    const fileName = "S2MBOU SARL2026.pdf";
    const description = `Our completed work is described in ${fileName}.`;
    await uploadMessageFile(s, fileName, `Please see ${fileName}.`, "public-reference");
    await asUser(s.t, s.ownerId).mutation(api.companies.index.updatePublicProfile, { description });
    // An incomplete private alias set must not affect a public read. Public
    // visitors cannot borrow this Client's conversation or upload metadata.
    await s.t.run(async ctx => {
      const attachment = await ctx.db.query("messageAttachments").withIndex("by_conversationId_and_createdAt", q => q.eq("conversationId", s.conversationId)).first();
      for (let index = 0; index < 1_000; index++) {
        const { _id, _creationTime, ...fields } = attachment!;
        void _id; void _creationTime;
        await ctx.db.insert("messageAttachments", { ...fields, originalFileName: `private-alias-${index}.pdf`, uploadFileName: `private-upload-${index}.pdf` });
      }
    });
    for (const userId of [undefined, s.clientId, s.otherClientId]) {
      const directoryArgs = { paginationOpts: pageOpts, verifiedOnly: false, sort: "newest" as const };
      const directory = userId
        ? await asUser(s.t, userId).query(api.companies.directory.listPublicCompanies, directoryArgs)
        : await s.t.query(api.companies.directory.listPublicCompanies, directoryArgs);
      const profile = userId
        ? await asUser(s.t, userId).query(api.portfolio.index.getPublicCompanyProfile, { slug: "company-under-test" })
        : await s.t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "company-under-test" });
      expect(directory.page[0].description).toBe("");
      expect(profile?.description).toBe("");
      expect(directory.page[0].name).toBe(MASKED);
      expect(profile?.name).toBe(MASKED);
      expect(profile?.slug).toBe("company-under-test");
      for (const dto of [directory, profile]) {
        expectPrivateNameAbsent(dto);
        expect(JSON.stringify(dto)).not.toContain("private-alias-");
        expect(JSON.stringify(dto)).not.toContain("private-upload-");
      }
    }
    expect((await asUser(s.t, s.ownerId).query(api.companies.index.getProfileManager, {})).description).toBe(description);
    expect((await s.t.run(ctx => ctx.db.get(s.companyId)))?.description).toBe(description);
  });

  test("public portfolio and review text fail closed while privileged originals and sources remain intact", async () => {
    const s = await setup();
    const text = "See S2MBOU SARL2026.pdf.";
    const client = asUser(s.t, s.clientId);
    await s.t.run(ctx => ctx.db.patch(s.assessmentId, { status: "cancelled", active: false }));
    await client.mutation(api.finalQuotes.index.review, { finalQuoteId: s.finalQuoteId, revisionId: s.revisionId, action: "accept" });
    const deal = await client.query(api.deals.index.getByProject, { projectId: s.projectId });
    await client.mutation(api.deals.index.completeDeal, { dealId: deal!.id });
    const { reviewId } = await client.mutation(api.reviews.index.createReview, { dealId: deal!.id, rating: 5, comment: text });
    await s.t.run(async ctx => {
      await ctx.db.patch(s.portfolioProjectId, { title: text, description: text });
      const media = await ctx.db.query("portfolioMedia").withIndex("by_portfolioProjectId", q => q.eq("portfolioProjectId", s.portfolioProjectId)).first();
      await ctx.db.patch(media!._id, { caption: text });
      await ctx.db.patch(s.projectId, { title: text, selectedCompanyId: s.companyId });
    });
    const profile = await s.t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "company-under-test" });
    expect(profile?.portfolio[0]).toMatchObject({ title: "", description: "", media: [{ caption: "" }] });
    expect(profile?.reviews[0]).toMatchObject({ comment: "", projectTitle: "" });
    expectPrivateNameAbsent(profile);
    const directory = await s.t.query(api.companies.directory.listPublicCompanies, { paginationOpts: pageOpts, verifiedOnly: false, sort: "newest" });
    expect(directory.page[0].portfolio[0].title).toBe("");
    const own = await asUser(s.t, s.ownerId).query(api.portfolio.index.getPortfolioManager, {});
    expect(own.projects[0]).toMatchObject({ title: text, description: text, media: [{ caption: text }] });
    expect((await s.t.run(ctx => ctx.db.get(s.portfolioProjectId)))?.description).toBe(text);
    expect((await s.t.run(ctx => ctx.db.get(reviewId)))?.comment).toBe(text);
  });

  test.each(["---", "___", "-_ _-", "devis-final"])("actual Final Quote upload %j preserves ordinary text and masking", async fileName => {
    const s = await setup();
    const company = asUser(s.t, s.ownerId);
    await s.t.run(async ctx => {
      await ctx.db.patch(s.assessmentId, { status: "cancelled", active: false });
      await ctx.db.patch(s.finalQuoteId, { status: "changes_requested" });
    });
    const pdfBody = "%PDF-1.7 separator regression";
    const upload = await company.mutation(api.finalQuotes.index.generatePdfUploadUrl, { finalQuoteId: s.finalQuoteId, fileName, contentType: "application/pdf", size: pdfBody.length });
    const response = await company.fetch("/final-quotes/pdf/upload", { method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": upload.uploadToken }, body: pdfBody });
    expect(response.status).toBe(200);
    const scope = `Work completed by ${NAME}. See ${fileName}.`;
    const submitted = await company.mutation(api.finalQuotes.index.submitRevision, {
      conversationId: s.conversationId, price: 100_000, duration: 30, plannedStartDate: "2099-01-01", validUntil: "2099-12-31",
      scope, inclusions: "All materials and labour.", exclusions: "Municipal fees.", paymentTerms: "Payments after completion.",
      pdf: { uploadToken: upload.uploadToken },
    });
    const sent = await company.mutation(api.messages.index.sendMessage, { conversationId: s.conversationId, body: scope, clientMessageId: "separator-reference" });
    await expectSafeReferenceOutputs(s, sent.messageId, scope, `Work completed by ${MASKED}. See final-quote.pdf.`);
    const clientQuote = await asUser(s.t, s.clientId).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
    expect(clientQuote.finalQuote?.revisions.find(r => r.id === submitted.revisionId)).toMatchObject({
      scope: `Work completed by ${MASKED}. See final-quote.pdf.`, inclusions: "All materials and labour.", paymentTerms: "Payments after completion.", pdfFileName: "final-quote.pdf",
    });
    for (const userId of [s.ownerId, s.adminId]) {
      const privileged = await asUser(s.t, userId).query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
      expect(privileged.finalQuote?.revisions.find(r => r.id === submitted.revisionId)).toMatchObject({ scope, pdfFileName: fileName });
    }
    expect((await s.t.run(ctx => ctx.db.get(submitted.revisionId)))?.scope).toBe(scope);
  });
});

describe("Company name DTO privacy", () => {
  test("public directory and search expose one masked display value, including names repeated in descriptions", async () => {
    const s = await setup();
    for (const search of [undefined, "S2MBOU"]) {
      const result = await s.t.query(api.companies.directory.listPublicCompanies, {
        paginationOpts: pageOpts, verifiedOnly: false, sort: "newest", ...(search ? { search } : {}),
      });
      expect(result.page).toHaveLength(1);
      expect(result.page[0].name).toBe(MASKED);
      expectPrivateNameAbsent(result);
    }
  });

  test("public profile is masked for anonymous and both Clients", async () => {
    const s = await setup();
    for (const userId of [undefined, s.clientId, s.otherClientId]) {
      const args = { slug: "company-under-test" };
      const result = userId
        ? await asUser(s.t, userId).query(api.portfolio.index.getPublicCompanyProfile, args)
        : await s.t.query(api.portfolio.index.getPublicCompanyProfile, args);
      expect(result?.name).toBe(MASKED);
      expect(result?.portfolio[0].title).toBe(`Work by ${MASKED}`);
      expectPrivateNameAbsent(result);
    }
  });

  test("Client proposal and invitation list/detail responses contain no real name", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId);
    const quotes = await client.query(api.quotes.index.listReceivedInitialQuotes, { projectId: s.projectId });
    const quote = await client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId });
    const invitations = await client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId });
    expect(quotes[0].company.name).toBe(MASKED);
    expect(quote?.company.name).toBe(MASKED);
    expect(invitations[0].companyName).toBe(MASKED);
    for (const dto of [quotes, quote, invitations]) expectPrivateNameAbsent(dto);
  });

  test("Client inbox, conversation and message text do not leak the name", async () => {
    const s = await setup(); const client = asUser(s.t, s.clientId);
    const threads = await client.query(api.messages.index.listMyThreads, {});
    const context = await client.query(api.messages.index.getConversation, { conversationId: s.conversationId });
    const messages = await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts });
    expect(context.otherPartyName).toBe(MASKED);
    for (const dto of [threads, context, messages]) expectPrivateNameAbsent(dto);
    const companyMessages = await asUser(s.t, s.ownerId).query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts });
    expect(companyMessages.page[0].body).toContain(NAME);
  });

  test("site-assessment and Final Quote responses preserve privileged names and mask Client names", async () => {
    const s = await setup();
    for (const [userId, expected] of [[s.clientId, MASKED], [s.ownerId, NAME], [s.adminId, NAME]] as const) {
      const viewer = asUser(s.t, userId);
      const site = await viewer.query(api.siteVisits.index.getForProject, { projectId: s.projectId });
      const finalQuote = await viewer.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
      expect(site.assessment?.companyName).toBe(expected);
      expect(finalQuote.finalQuote?.companyName).toBe(expected);
      if (userId === s.clientId) {
        expectPrivateNameAbsent(site);
        expectPrivateNameAbsent(finalQuote);
        expectPrivateNameAbsent(await viewer.query(api.siteVisits.index.getForConversation, { conversationId: s.conversationId }));
      }
    }
  });

  test.each([
    "S2MBOU SARL2026.pdf",
    "S2MBOU-SARL.pdf",
    "S2MBOU_SARL.pdf",
    "project-proposal-DevisS2MBOU SARL2026-final.pdf",
    "S2MBOU Construction SARL2026.pdf",
    "Élévation & Béton (S.A.R.L.)-2026.PDF",
    `${NAME}${"-supporting-document".repeat(7)}.pdf`,
    "ordinary.pDf",
  ].flatMap(fileName => [false, true].map(withBody => ({ fileName, withBody }))))("Client filenames and derived previews are safe for $fileName (body: $withBody)", async ({ fileName, withBody }) => {
    const s = await setup();
    const body = withBody ? `Please see ${fileName}.` : "";
    const preview = (body || fileName).slice(0, 120);
    const { attachmentId, notificationId } = await s.t.run(async (ctx) => {
      const blob = new Blob(["%PDF-1.7 example"], { type: "application/pdf" });
      const storageId = await ctx.storage.store(blob);
      await ctx.db.patch(s.revisionId, { pdfStorageId: storageId, pdfFileName: fileName, pdfSize: blob.size,
        ...(withBody ? { scope: body, inclusions: body, exclusions: body, paymentTerms: body, companyNote: body } : {}) });
      if (withBody) await ctx.db.patch(s.finalQuoteId, { changesRequestReason: body });
      await ctx.db.patch(s.messageId, { body });
      await ctx.db.patch(s.conversationId, { lastMessagePreview: preview });
      const attachmentId = await ctx.db.insert("messageAttachments", {
        conversationId: s.conversationId, messageId: s.messageId, storageId, uploadedByUserId: s.ownerId,
        kind: "pdf", originalFileName: fileName, mimeType: "application/pdf", sizeBytes: blob.size, createdAt: 4,
      });
      const notificationId = await ctx.db.insert("notifications", {
        recipientUserId: s.clientId, type: "message_received", entity: { type: "conversation", id: s.conversationId },
        actorUserId: s.ownerId, dedupeKey: `message:${s.messageId}:received`,
        payload: { companyName: NAME, actorDisplayName: NAME, messagePreview: preview }, createdAt: 10,
      });
      return { attachmentId, notificationId };
    });
    const client = asUser(s.t, s.clientId);
    const extension = /\.pdf$/i.exec(fileName)![0];
    const safePreview = withBody ? `Please see attachment${extension}.` : `attachment${extension}`;
    expect(await client.query(api.deals.index.getByProject, { projectId: s.projectId })).toBeNull();
    const messages = await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts });
    expect(messages.page[0].attachment?.fileName).toBe(`attachment${extension}`);
    expect(messages.page[0].body).toBe(withBody ? safePreview : "");
    const download = await client.query(internal.messages.download.authorizeAttachmentDownload, { attachmentId });
    expect(download.fileName).toBe(`attachment${extension}`);
    const finalQuote = await client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
    const pdf = await client.query(internal.finalQuotes.download.authorizePdfDownload, { revisionId: s.revisionId });
    expect(finalQuote.finalQuote?.revisions[0].pdfFileName).toBe(`final-quote${extension}`);
    expect(pdf.fileName).toBe(`final-quote${extension}`);
    if (withBody) {
      const safeQuoteText = `Please see final-quote${extension}.`;
      const revision = finalQuote.finalQuote!.revisions[0];
      for (const field of ["scope", "inclusions", "exclusions", "paymentTerms", "companyNote"] as const) {
        expect(revision[field]).toBe(safeQuoteText);
      }
      expect(finalQuote.finalQuote?.changesRequestReason).toBe(safeQuoteText);
    }
    for (const dto of [messages, download, finalQuote, pdf]) expectPrivateNameAbsent(dto);
    const threads = await client.query(api.messages.index.listMyThreads, {});
    const thread = await client.query(api.messages.index.getConversation, { conversationId: s.conversationId });
    expect(threads[0].preview).toBe(safePreview);
    expect(thread.preview).toBe(safePreview);
    const notifications = await client.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
    const notification = notifications.page.find((item) => item.id === notificationId)!;
    expect(notification.payload.messagePreview).toBe(safePreview);
    for (const dto of [threads, thread, notifications]) expectPrivateNameAbsent(dto);
    for (const dto of [messages, download, finalQuote, pdf, threads, thread, notifications]) {
      expect(JSON.stringify(dto)).not.toContain(fileName);
    }
    for (const userId of [s.ownerId, s.staffId]) {
      const company = asUser(s.t, userId);
      expect((await company.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].attachment?.fileName).toBe(fileName);
      expect((await company.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body).toBe(body);
      expect((await company.query(api.messages.index.getConversation, { conversationId: s.conversationId })).preview).toBe(preview);
      expect((await company.query(internal.messages.download.authorizeAttachmentDownload, { attachmentId })).fileName).toBe(fileName);
    }
    for (const userId of [s.ownerId, s.staffId, s.adminId]) {
      const privileged = asUser(s.t, userId);
      expect((await privileged.query(internal.finalQuotes.download.authorizePdfDownload, { revisionId: s.revisionId })).fileName).toBe(fileName);
      expect((await privileged.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).finalQuote?.revisions[0].pdfFileName).toBe(fileName);
      if (withBody) expect((await privileged.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).finalQuote?.revisions[0].scope).toBe(body);
    }
    const attachmentResponse = await client.fetch(`/messages/attachments/${attachmentId}`);
    const pdfResponse = await client.fetch(`/final-quotes/pdf/${s.revisionId}`);
    for (const [response, base] of [[attachmentResponse, "attachment"], [pdfResponse, "final-quote"]] as const) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="${base}${extension}"; filename*=UTF-8''${base}${extension}`);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
    }
    const stored = await s.t.run(async (ctx) => ({ attachment: await ctx.db.get(attachmentId), revision: await ctx.db.get(s.revisionId), company: await ctx.db.get(s.companyId), notification: await ctx.db.get(notificationId), message: await ctx.db.get(s.messageId) }));
    expect(stored.attachment?.originalFileName).toBe(fileName);
    expect(stored.revision?.pdfFileName).toBe(fileName);
    expect(stored.company?.name).toBe(NAME);
    expect(stored.company?.legalName).toBe(LEGAL_NAME);
    expect(stored.notification?.payload.messagePreview).toBe(preview);
    expect(stored.message?.body).toBe(body);
    if (withBody) expect(stored.revision?.scope).toBe(body);
    const other = asUser(s.t, s.otherClientId);
    await expect(other.query(internal.messages.download.authorizeAttachmentDownload, { attachmentId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(other.query(internal.finalQuotes.download.authorizePdfDownload, { revisionId: s.revisionId })).rejects.toThrow("FINAL_QUOTE_NOT_FOUND");
    expect((await other.fetch(`/messages/attachments/${attachmentId}`)).status).toBe(404);
    expect((await other.fetch(`/final-quotes/pdf/${s.revisionId}`)).status).toBe(404);
  });

  test.each(["", "Please see S2MBOU SARL2026.pdf."])("push previews use the generated filename without changing stored history (body: %s)", async (body) => {
    const s = await setup();
    const fileName = "S2MBOU SARL2026.pdf";
    const notificationId = await s.t.run(async (ctx) => {
      await ctx.db.patch(s.messageId, { body });
      const blob = new Blob(["%PDF-1.7 test"], { type: "application/pdf" });
      await ctx.db.insert("messageAttachments", {
        conversationId: s.conversationId, messageId: s.messageId, storageId: await ctx.storage.store(blob), uploadedByUserId: s.ownerId,
        kind: "pdf", originalFileName: fileName, mimeType: "application/pdf", sizeBytes: blob.size, createdAt: 4,
      });
      await ctx.db.insert("notificationPreferences", {
        userId: s.clientId, ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: true, updatedAt: 1,
      });
      await ctx.db.insert("pushSubscriptions", {
        userId: s.clientId, endpoint: "https://push.example.test/device", p256dh: "test", auth: "test", locale: "en", createdAt: 1, updatedAt: 1,
      });
      return ctx.db.insert("notifications", {
        recipientUserId: s.clientId, type: "message_received", entity: { type: "conversation", id: s.conversationId },
        actorUserId: s.ownerId, dedupeKey: `message:${s.messageId}:received`,
        payload: { companyName: NAME, actorDisplayName: NAME, messagePreview: body || fileName, projectTitle: `Documents ${fileName}` }, createdAt: 10,
      });
    });
    const claim = await s.t.mutation(internal.notifications.pushDeliveryModel.claimMarketplacePush, { notificationId, leaseId: "filename-test" });
    expect(claim?.notification.payload.messagePreview).toBe(body ? "Please see attachment.pdf." : "attachment.pdf");
    expectPrivateNameAbsent(claim);
    for (const locale of ["fr", "en"] as const) {
      const push = marketplacePushPresentation(claim!.notification, "client", locale);
      expect(push.body).not.toContain(fileName);
      expect(push.body).toContain("Documents attachment.pdf");
      expect(push.locale).toBe(locale);
      expectPrivateNameAbsent(push);
    }
    expect((await s.t.run((ctx) => ctx.db.get(notificationId)))?.payload.messagePreview).toBe(body || fileName);
    await s.t.mutation(internal.notifications.pushDeliveryModel.completeMarketplacePush, {
      notificationId, recipientUserId: s.clientId, leaseId: "filename-test", deliveredEndpoints: ["https://push.example.test/device"], permanentFailureEndpoints: [], temporaryFailureEndpoints: [],
    });
  });

  test("follow-up messages resolve older attachments outside the current page and Final Quote filenames", async () => {
    const s = await setup();
    const attachmentName = "S2MBOU-SARL.pdf";
    const quoteName = "S2MBOU_SARL-final.pDf";
    const body = `Compare ${attachmentName} with ${quoteName}.`;
    const notificationId = await s.t.run(async ctx => {
      const blob = new Blob(["%PDF-1.7 test"], { type: "application/pdf" });
      const storageId = await ctx.storage.store(blob);
      await ctx.db.insert("messageAttachments", {
        conversationId: s.conversationId, messageId: s.messageId, storageId, uploadedByUserId: s.ownerId,
        kind: "pdf", originalFileName: attachmentName, mimeType: "application/pdf", sizeBytes: blob.size, createdAt: 4,
      });
      await ctx.db.patch(s.revisionId, { pdfStorageId: storageId, pdfFileName: quoteName, pdfSize: blob.size });
      const messageId = await ctx.db.insert("messages", {
        conversationId: s.conversationId, senderUserId: s.ownerId, senderType: "company", body, createdAt: 10,
      });
      await ctx.db.patch(s.conversationId, { lastMessagePreview: body, lastMessageAt: 10 });
      return ctx.db.insert("notifications", {
        recipientUserId: s.clientId, type: "message_received", entity: { type: "conversation", id: s.conversationId },
        actorUserId: s.ownerId, dedupeKey: `message:${messageId}:received`, payload: { messagePreview: body }, createdAt: 11,
      });
    });
    const client = asUser(s.t, s.clientId);
    const expected = "Compare attachment.pdf with final-quote.pDf.";
    const messages = await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: { numItems: 1, cursor: null } });
    expect(messages.page).toHaveLength(1);
    expect(messages.page[0].attachment).toBeNull();
    expect(messages.page[0].body).toBe(expected);
    expect(messages.isDone).toBe(false);
    expect((await client.query(api.messages.index.getConversation, { conversationId: s.conversationId })).preview).toBe(expected);
    const notifications = await client.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
    expect(notifications.page.find(row => row.id === notificationId)?.payload.messagePreview).toBe(expected);
    for (const userId of [s.ownerId, s.staffId]) {
      expect((await asUser(s.t, userId).query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body).toBe(body);
    }
  });

  test("related Client context replaces known filenames while privileged reads retain originals", async () => {
    const s = await setup();
    const fileName = "S2MBOU SARL2026.pdf";
    const text = `Please see ${fileName}.`;
    const notificationIds = await s.t.run(async ctx => {
      const blob = new Blob(["%PDF-1.7 test"], { type: "application/pdf" });
      await ctx.db.insert("messageAttachments", {
        conversationId: s.conversationId, messageId: s.messageId, storageId: await ctx.storage.store(blob), uploadedByUserId: s.ownerId,
        kind: "pdf", originalFileName: fileName, mimeType: "application/pdf", sizeBytes: blob.size, createdAt: 4,
      });
      await ctx.db.patch(s.projectId, { title: text, description: text });
      await ctx.db.patch(s.quoteId, { message: text, scope: text });
      const history = await ctx.db.query("quoteStatusHistory").withIndex("by_quoteId", q => q.eq("quoteId", s.quoteId)).first();
      await ctx.db.patch(history!._id, { reason: text });
      await ctx.db.patch(s.invitationId, { message: text });
      await ctx.db.patch(s.assessmentId, { companyNote: text, clientNote: text });
      await ctx.db.patch(s.revisionId, { scope: text });
      const notificationIds = [];
      for (const recipientUserId of [s.clientId, s.ownerId, s.staffId, s.adminId]) {
        notificationIds.push(await ctx.db.insert("notifications", {
          recipientUserId, type: "final_quote_submitted", entity: { type: "final_quote", id: s.finalQuoteId },
          actorUserId: s.ownerId, payload: { projectTitle: text, messagePreview: text, companyName: NAME }, createdAt: 10,
        }));
      }
      return notificationIds;
    });
    const client = asUser(s.t, s.clientId);
    const expected = "Please see attachment.pdf.";
    const quote = await client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId });
    expect(quote?.message).toBe(expected);
    expect(quote?.scope).toBe(expected);
    expect(quote?.history[0].reason).toBe(expected);
    const invitations = await client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId });
    expect(invitations[0].message).toBe(expected);
    expect(invitations[0].projectTitle).toBe(expected);
    expect(invitations[0].projectDescription).toBe(expected);
    expect((await client.query(api.siteVisits.index.getForConversation, { conversationId: s.conversationId })).assessment?.companyNote).toBe(expected);
    expect((await client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).finalQuote?.revisions[0].scope).toBe(expected);
    expect((await client.query(api.messages.index.getConversation, { conversationId: s.conversationId })).projectTitle).toBe(expected);
    for (const [index, userId] of [s.clientId, s.ownerId, s.staffId, s.adminId].entries()) {
      const rows = await asUser(s.t, userId).query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
      const notification = rows.page.find(row => row.id === notificationIds[index])!;
      expect(notification.payload.messagePreview).toBe(userId === s.clientId ? expected : text);
      expect(notification.payload.projectTitle).toBe(userId === s.clientId ? expected : text);
    }
    for (const userId of [s.ownerId, s.staffId, s.adminId]) {
      expect((await asUser(s.t, userId).query(api.siteVisits.index.getForProject, { projectId: s.projectId })).assessment?.companyNote).toBe(text);
    }
    for (const userId of [s.ownerId, s.staffId]) {
      expect((await asUser(s.t, userId).query(api.invitations.index.listMyCompanyInvitations, {}))[0].message).toBe(text);
    }
  });

  test("ordinary message text without a filename is not rewritten", async () => {
    const s = await setup();
    const body = "Please bring the measurements tomorrow.";
    await s.t.run(async ctx => {
      await ctx.db.patch(s.messageId, { body });
      await ctx.db.patch(s.conversationId, { lastMessagePreview: body });
      const notification = await ctx.db.query("notifications").withIndex("by_recipientUserId_and_createdAt", q => q.eq("recipientUserId", s.clientId)).first();
      await ctx.db.patch(notification!._id, { dedupeKey: `message:${s.messageId}:received`, payload: { messagePreview: body } });
    });
    const client = asUser(s.t, s.clientId);
    expect((await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body).toBe(body);
    expect((await client.query(api.messages.index.getConversation, { conversationId: s.conversationId })).preview).toBe(body);
    expect((await client.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts })).page[0].payload.messagePreview).toBe(body);
  });

  test("the real attachment send flow replaces text references only on Client reads", async () => {
    const s = await setup();
    const owner = asUser(s.t, s.ownerId);
    const fileName = "S2MBOU SARL2026.pdf";
    const body = `Please see ${fileName}.`;
    const blob = new Blob(["%PDF-1.7 test"], { type: "application/pdf" });
    const upload = await owner.mutation(api.messages.attachments.generateAttachmentUploadUrl, {
      conversationId: s.conversationId, fileName, contentType: "application/pdf", size: blob.size,
    });
    const response = await owner.fetch("/messages/attachments/upload", {
      method: "POST", headers: { "Content-Type": "application/pdf", "X-Upload-Token": upload.uploadToken }, body: blob,
    });
    expect(response.status).toBe(200);
    const sent = await owner.action(api.messages.attachments.sendMessageWithAttachment, {
      conversationId: s.conversationId, body, clientMessageId: "filename-reference", uploadToken: upload.uploadToken,
    });
    const client = asUser(s.t, s.clientId);
    expect((await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body).toBe("Please see attachment.pdf.");
    expect((await client.query(api.messages.index.listMyThreads, {}))[0].preview).toBe("Please see attachment.pdf.");
    expect((await client.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts })).page[0].payload.messagePreview).toBe("Please see attachment.pdf.");
    expect((await owner.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body).toBe(body);
    expect((await s.t.run(ctx => ctx.db.get(sent.messageId)))?.body).toBe(body);
    expect((await s.t.run(ctx => ctx.db.get(sent.attachmentId!)))?.originalFileName).toBe(fileName);
  });

  test("an incomplete bounded alias lookup cannot return private text", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      const blob = new Blob(["%PDF-1.7 test"], { type: "application/pdf" });
      const storageId = await ctx.storage.store(blob);
      for (let index = 0; index < 1_001; index++) {
        const messageId = await ctx.db.insert("messages", { conversationId: s.conversationId, senderUserId: s.ownerId, senderType: "company", body: "", createdAt: index + 20 });
        await ctx.db.insert("messageAttachments", {
          conversationId: s.conversationId, messageId, storageId, uploadedByUserId: s.ownerId,
          kind: "pdf", originalFileName: `${NAME}${index}.pdf`, mimeType: "application/pdf", sizeBytes: blob.size, createdAt: index + 20,
        });
      }
      await ctx.db.insert("messages", { conversationId: s.conversationId, senderUserId: s.ownerId, senderType: "company", body: `See ${NAME}1000.pdf.`, createdAt: 2000 });
    });
    const args = { conversationId: s.conversationId, paginationOpts: { numItems: 1, cursor: null } };
    await expect(asUser(s.t, s.clientId).query(api.messages.index.listMessages, args)).rejects.toThrow("COMPANY_FILE_PRIVACY_LIMIT");
    expect((await asUser(s.t, s.ownerId).query(api.messages.index.listMessages, args)).page[0].body).toBe(`See ${NAME}1000.pdf.`);
  });

  test("safe filenames do not grant other Companies or anonymous visitors access", async () => {
    const s = await setup();
    const { otherOwnerId, attachmentId } = await s.t.run(async (ctx) => {
      const otherOwnerId = await ctx.db.insert("users", { accountType: "company", onboardingStatus: "completed", createdAt: 1 });
      const companyId = await ctx.db.insert("companies", { name: "Other Company", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("companyMembers", { companyId, userId: otherOwnerId, role: "owner", status: "active", createdAt: 1 });
      const blob = new Blob(["%PDF-1.7 test"], { type: "application/pdf" });
      const storageId = await ctx.storage.store(blob);
      await ctx.db.patch(s.revisionId, { pdfStorageId: storageId, pdfFileName: `${LEGAL_NAME}2026.pdf`, pdfSize: blob.size });
      const attachmentId = await ctx.db.insert("messageAttachments", {
        conversationId: s.conversationId, messageId: s.messageId, storageId, uploadedByUserId: s.ownerId,
        kind: "pdf", originalFileName: `${NAME}2026.pdf`, mimeType: "application/pdf", sizeBytes: blob.size, createdAt: 4,
      });
      return { otherOwnerId, attachmentId };
    });
    const other = asUser(s.t, otherOwnerId);
    await expect(other.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(other.query(internal.messages.download.authorizeAttachmentDownload, { attachmentId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(other.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(other.query(internal.finalQuotes.download.authorizePdfDownload, { revisionId: s.revisionId })).rejects.toThrow("FINAL_QUOTE_NOT_FOUND");
    for (const viewer of [other, s.t]) {
      expect((await viewer.fetch(`/messages/attachments/${attachmentId}`)).status).toBe(404);
      expect((await viewer.fetch(`/final-quotes/pdf/${s.revisionId}`)).status).toBe(404);
    }
    // Existing Admin access to Final Quotes is retained, not expanded to chat.
    await expect(asUser(s.t, s.adminId).query(internal.messages.download.authorizeAttachmentDownload, { attachmentId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    expect((await asUser(s.t, s.adminId).query(internal.finalQuotes.download.authorizePdfDownload, { revisionId: s.revisionId })).fileName).toBe(`${LEGAL_NAME}2026.pdf`);
  });

  test("site-visit schedule and proposal history redact repeated names only for Clients", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.delete(s.revisionId);
      await ctx.db.delete(s.finalQuoteId);
    });
    await asUser(s.t, s.ownerId).mutation(api.siteVisits.index.proposeVisit, {
      assessmentId: s.assessmentId, proposedDate: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString().slice(0, 10),
      proposedTime: "10:00", timezone: "Africa/Casablanca",
      siteAddress: `Building managed by ${NAME}, Rabat`, note: `Representative of ${LEGAL_NAME}.`,
    });
    for (const [userId, expectedName] of [[s.clientId, MASKED], [s.ownerId, NAME], [s.adminId, NAME]] as const) {
      const result = await asUser(s.t, userId).query(api.siteVisits.index.getForProject, { projectId: s.projectId });
      expect(result.assessment?.visit?.siteAddress).toContain(expectedName);
      expect(result.assessment?.visit?.proposals).toHaveLength(1);
      if (userId === s.clientId) expectPrivateNameAbsent(result);
    }
  });

  test("legacy notification payloads are masked for Clients; Admin and own-Company members retain full names", async () => {
    const s = await setup();
    for (const [userId, expected] of [[s.clientId, MASKED], [s.ownerId, NAME], [s.staffId, NAME], [s.adminId, NAME]] as const) {
      const result = await asUser(s.t, userId).query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
      expect(result.page[0].payload.companyName).toBe(expected);
      expect(result.page[0].payload.actorDisplayName).toBe(expected);
      if (userId === s.clientId) expectPrivateNameAbsent(result);
    }
    // Read-time masking must not destroy stored notification history.
    const stored = await s.t.run((ctx) => ctx.db.query("notifications").withIndex("by_recipientUserId_and_createdAt", q => q.eq("recipientUserId", s.clientId)).first());
    expect(stored?.payload.companyName).toBe(NAME);
  });

  test("a Company account cannot reveal identity via legacy notifications without active ownership", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      const membership = await ctx.db.query("companyMembers").withIndex("by_companyId_and_userId", q =>
        q.eq("companyId", s.companyId).eq("userId", s.staffId)).unique();
      await ctx.db.patch(membership!._id, { status: "inactive" });
    });
    const result = await asUser(s.t, s.staffId).query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
    expect(result.page[0].payload.companyName).toBe(MASKED);
    expectPrivateNameAbsent(result);
  });

  test("the push claim redacts stored aliases before sending data to the delivery action", async () => {
    const s = await setup();
    const notificationId = await s.t.run(async (ctx) => {
      await ctx.db.insert("notificationPreferences", {
        userId: s.clientId, ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: true, updatedAt: 1,
      });
      await ctx.db.insert("pushSubscriptions", {
        userId: s.clientId, endpoint: "https://push.example.test/device", p256dh: "test", auth: "test",
        locale: "en", createdAt: 1, updatedAt: 1,
      });
      const notification = await ctx.db.query("notifications").withIndex("by_recipientUserId_and_createdAt", q => q.eq("recipientUserId", s.clientId)).first();
      return notification!._id;
    });
    const claim = await s.t.mutation(internal.notifications.pushDeliveryModel.claimMarketplacePush, { notificationId, leaseId: "privacy-test" });
    expect(claim?.notification.payload.companyName).toBe(MASKED);
    expect(claim?.notification.actorType).toBe("company");
    expect(claim?.subscriptions[0].locale).toBe("en");
    expectPrivateNameAbsent(claim);
    await s.t.mutation(internal.notifications.pushDeliveryModel.completeMarketplacePush, {
      notificationId, recipientUserId: s.clientId, leaseId: "privacy-test",
      deliveredEndpoints: ["https://push.example.test/device"], permanentFailureEndpoints: [], temporaryFailureEndpoints: [],
    });
  });

  test("pushes mask Company aliases in FR and EN before rendering", async () => {
    const s = await setup();
    const notification = await s.t.run((ctx) => ctx.db.query("notifications").withIndex("by_recipientUserId_and_createdAt", q => q.eq("recipientUserId", s.clientId)).first());
    expect(notification).not.toBeNull();
    for (const locale of ["fr", "en"] as const) {
      const push = marketplacePushPresentation(notification!, "client", locale);
      expect(push.body).toContain(MASKED);
      expectPrivateNameAbsent(push);
      expect(marketplacePushPresentation(notification!, "company", locale).body).toContain(NAME);
      expect(marketplacePushPresentation(notification!, "admin", locale).body).toContain(NAME);
    }
  });

  test("Admin and Company owner/staff retain their authorized identity reads", async () => {
    const s = await setup();
    const admin = await asUser(s.t, s.adminId).query(api.admin.companies.getCompanySummary, { companyId: s.companyId });
    expect(admin?.name).toBe(NAME);
    expect(admin?.legalName).toBe(LEGAL_NAME);
    expect((await asUser(s.t, s.ownerId).query(api.companies.index.getProfileManager, {})).name).toBe(NAME);
    expect((await asUser(s.t, s.ownerId).query(api.portfolio.index.getPortfolioManager, {})).projects[0].title).toBe(`Work by ${NAME}`);
    for (const userId of [s.ownerId, s.staffId]) {
      expect((await asUser(s.t, userId).query(api.invitations.index.listMyCompanyInvitations, {}))[0].companyName).toBe(NAME);
    }
  });

  test("other Clients cannot read private relationships or inherit a future reveal", async () => {
    const s = await setup(); const other = asUser(s.t, s.otherClientId);
    await expect(other.query(api.quotes.index.listReceivedInitialQuotes, { projectId: s.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    await expect(other.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    await expect(other.query(api.messages.index.getConversation, { conversationId: s.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(other.query(api.siteVisits.index.getForProject, { projectId: s.projectId })).rejects.toThrow("PROJECT_NOT_FOUND");
    await expect(other.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    expect((await other.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts })).page).toEqual([]);
    await s.t.run((ctx) => ctx.db.patch(s.assessmentId, { active: false, status: "cancelled" }));
    await asUser(s.t, s.clientId).mutation(api.finalQuotes.index.review, { finalQuoteId: s.finalQuoteId, revisionId: s.revisionId, action: "accept" });
    const deal = await asUser(s.t, s.clientId).query(api.deals.index.getByProject, { projectId: s.projectId });
    await asUser(s.t, s.clientId).mutation(api.deals.index.completeDeal, { dealId: deal!.id });
    await asUser(s.t, s.clientId).mutation(api.reviews.index.createReview, { dealId: deal!.id, rating: 5, comment: `Excellent work by ${NAME} (${LEGAL_NAME}).` });
    // A Client's own Deal never toggles the public identity policy.
    for (const userId of [s.clientId, s.otherClientId]) {
      const profile = await asUser(s.t, userId).query(api.portfolio.index.getPublicCompanyProfile, { slug: "company-under-test" });
      expect(profile?.name).toBe(MASKED);
      expect(profile?.reviews[0].comment).toContain(MASKED);
      expectPrivateNameAbsent(profile);
    }
  });
});

describe("Step 4: Company identity belongs to the authenticated Client/Deal relationship", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  type State = Awaited<ReturnType<typeof setup>>;

  function fields<T extends { _id: unknown; _creationTime: number }>(doc: T) {
    const { _id, _creationTime, ...value } = doc;
    void _id; void _creationTime;
    return value;
  }

  /** Another fully authorized discussion, without copying any Deal/reveal state. */
  async function relationship(s: State, clientId: Id<"users">, companyId = s.companyId, ownerId = s.ownerId): Promise<State> {
    const ids = await s.t.run(async ctx => {
      const projectId = await ctx.db.insert("projects", { ...fields((await ctx.db.get(s.projectId))!), clientId });
      const quoteId = await ctx.db.insert("projectQuotes", { ...fields((await ctx.db.get(s.quoteId))!), projectId, companyId, submittedByUserId: ownerId });
      const invitationId = await ctx.db.insert("invitations", { ...fields((await ctx.db.get(s.invitationId))!), projectId, companyId, clientUserId: clientId });
      const conversationId = await ctx.db.insert("conversations", { ...fields((await ctx.db.get(s.conversationId))!), projectId, companyId, clientId, quoteId, invitationId, createdBy: clientId });
      const messageId = await ctx.db.insert("messages", { ...fields((await ctx.db.get(s.messageId))!), conversationId, senderUserId: ownerId });
      const assessmentId = await ctx.db.insert("siteAssessments", { ...fields((await ctx.db.get(s.assessmentId))!), projectId, companyId, clientId, conversationId, initialQuoteId: quoteId, invitedByUserId: clientId });
      const finalQuoteId = await ctx.db.insert("finalQuotes", { ...fields((await ctx.db.get(s.finalQuoteId))!), projectId, companyId, clientId, conversationId, initialQuoteId: quoteId, requestedByUserId: clientId, currentRevisionId: undefined });
      const revisionId = await ctx.db.insert("finalQuoteRevisions", { ...fields((await ctx.db.get(s.revisionId))!), finalQuoteId, submittedByUserId: ownerId });
      await ctx.db.patch(finalQuoteId, { currentRevisionId: revisionId });
      const company = await ctx.db.get(companyId);
      await ctx.db.insert("notifications", { recipientUserId: clientId, type: "message_received", entity: { type: "conversation", id: conversationId },
        actorUserId: ownerId, payload: { companyName: company?.name, actorDisplayName: company?.name }, createdAt: 9 });
      return { projectId, quoteId, invitationId, conversationId, messageId, assessmentId, finalQuoteId, revisionId };
    });
    return { ...s, ...ids, clientId, companyId, ownerId };
  }

  async function accept(s: State) {
    await s.t.run(ctx => ctx.db.patch(s.assessmentId, { status: "cancelled", active: false }));
    const client = asUser(s.t, s.clientId);
    await client.mutation(api.finalQuotes.index.review, { finalQuoteId: s.finalQuoteId, revisionId: s.revisionId, action: "accept" });
    const deal = await client.query(api.deals.index.getByProject, { projectId: s.projectId });
    expect(deal).not.toBeNull();
    return deal!;
  }

  async function identities(s: State) {
    const client = asUser(s.t, s.clientId);
    const [quotes, detail, invitations, threads, conversation, site, siteForConversation, finalQuote] = await Promise.all([
      client.query(api.quotes.index.listReceivedInitialQuotes, { projectId: s.projectId }),
      client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId }),
      client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId }),
      client.query(api.messages.index.listMyThreads, {}),
      client.query(api.messages.index.getConversation, { conversationId: s.conversationId }),
      client.query(api.siteVisits.index.getForProject, { projectId: s.projectId }),
      client.query(api.siteVisits.index.getForConversation, { conversationId: s.conversationId }),
      client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId }),
    ]);
    return [quotes[0].company.name, detail.company.name, invitations[0].companyName,
      threads.find(row => row.id === s.conversationId)?.otherPartyName, conversation.otherPartyName,
      site.assessment?.companyName, siteForConversation.assessment?.companyName, finalQuote.finalQuote?.companyName];
  }

  async function pushNotification(s: State) {
    return s.t.run(async ctx => {
      await ctx.db.insert("notificationPreferences", { userId: s.clientId, ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: true, updatedAt: 1 });
      await ctx.db.insert("pushSubscriptions", { userId: s.clientId, endpoint: `https://push.example.test/${s.clientId}`, p256dh: "test", auth: "test", locale: "en", createdAt: 1, updatedAt: 1 });
      return (await ctx.db.query("notifications").withIndex("by_recipientUserId_and_createdAt", q => q.eq("recipientUserId", s.clientId)).first())!._id;
    });
  }

  test("real Deal creation changes all authenticated Client identity DTOs from masked to full", async () => {
    const s = await setup();
    expect(await identities(s)).toEqual(Array(8).fill(MASKED));
    const deal = await accept(s);
    expect(deal).toMatchObject({ companyId: s.companyId, clientUserId: s.clientId, companyName: NAME });
    expect(await identities(s)).toEqual(Array(8).fill(NAME));
    const client = asUser(s.t, s.clientId);
    expect((await client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId })).history[0].reason).toContain(LEGAL_NAME);
    expect((await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body).toContain(NAME);
    expect((await client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).finalQuote?.revisions[0].scope).toContain(NAME);
  });

  test.each(["submitted", "shortlisted", "discussion_open"] as const)("%s proposal, accepted invitation, messages, assessment and Final Quote without a Deal stay masked", async status => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.quoteId, { status }));
    const client = asUser(s.t, s.clientId);
    expect((await client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId })).company.name).toBe(MASKED);
    expect((await client.query(api.messages.index.getConversation, { conversationId: s.conversationId })).otherPartyName).toBe(MASKED);
    expect((await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).page[0].body).toContain(MASKED);
    expect((await client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId }))[0].companyName).toBe(MASKED);
    expect(await client.query(api.deals.index.getByProject, { projectId: s.projectId })).toBeNull();
  });

  test("a Client's Deal with another Company cannot reveal Company X", async () => {
    const s = await setup();
    const { companyId, ownerId } = await s.t.run(async ctx => {
      const companyId = await ctx.db.insert("companies", { name: "Atlas Construction", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1 });
      const ownerId = await ctx.db.insert("users", { accountType: "company", onboardingStatus: "completed", createdAt: 1 });
      await ctx.db.insert("companyMembers", { companyId, userId: ownerId, role: "owner", status: "active", createdAt: 1 });
      return { companyId, ownerId };
    });
    const otherCompany = await relationship(s, s.otherClientId, companyId, ownerId);
    const otherClientX = await relationship(s, s.otherClientId);
    await accept(otherCompany);
    expect(await identities(otherClientX)).toEqual(Array(8).fill(MASKED));
    expect(await identities(s)).toEqual(Array(8).fill(MASKED));
  });

  test("cross-Client reads and repeated recipient resolution stay isolated after Client A's Deal", async () => {
    const s = await setup();
    const b = await relationship(s, s.otherClientId);
    const client = asUser(s.t, s.clientId), other = asUser(s.t, s.otherClientId);
    await accept(s);
    for (let index = 0; index < 2; index++) {
      expect(await identities(s)).toEqual(Array(8).fill(NAME));
      expect(await identities(b)).toEqual(Array(8).fill(MASKED));
      expect((await client.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts })).page[0].payload.companyName).toBe(NAME);
      expect((await other.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts })).page[0].payload.companyName).toBe(MASKED);
    }
    await expect(other.query(api.deals.index.getByProject, { projectId: s.projectId })).rejects.toThrow("DEAL_NOT_FOUND");
    await expect(other.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId })).rejects.toThrow("PROJECT_NOT_FOUND");
    await expect(other.query(api.messages.index.getConversation, { conversationId: s.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
    await expect(other.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).rejects.toThrow("CONVERSATION_NOT_FOUND");
  });

  test("Deal visibility applies to the same Client/Company on another authorized project", async () => {
    const s = await setup();
    const samePair = await relationship(s, s.clientId);
    await accept(s);
    expect(await identities(samePair)).toEqual(Array(8).fill(NAME));
    expect(await asUser(s.t, s.clientId).query(api.deals.index.getByProject, { projectId: samePair.projectId })).toBeNull();
  });

  test.each(["completed", "cancelled"] as const)("%s Deal retains full identity for the same Client only", async status => {
    const s = await setup(), b = await relationship(s, s.otherClientId);
    const deal = await accept(s);
    if (status === "completed") await asUser(s.t, s.clientId).mutation(api.deals.index.completeDeal, { dealId: deal.id });
    else await s.t.run(ctx => ctx.db.patch(deal.id, { status })); // Model an existing cancelled record; no new lifecycle command.
    expect(await identities(s)).toEqual(Array(8).fill(NAME));
    expect(await identities(b)).toEqual(Array(8).fill(MASKED));
    expect((await asUser(s.t, s.clientId).query(api.deals.index.getByProject, { projectId: s.projectId }))?.companyName).toBe(NAME);
  });

  test("anonymous and all public directory/profile/portfolio audiences remain masked after a Deal", async () => {
    const s = await setup();
    await accept(s);
    expect(await s.t.run(ctx => resolveCompanyIdentityAudience(ctx, s.companyId))).toBe("public");
    const viewers: Array<ReturnType<typeof asUser>> = [s.t, ...[s.clientId, s.otherClientId, s.ownerId, s.adminId].map(id => asUser(s.t, id))];
    for (const viewer of viewers) {
      const profile = await viewer.query(api.portfolio.index.getPublicCompanyProfile, { slug: "company-under-test" });
      const directory = await viewer.query(api.companies.directory.listPublicCompanies, { paginationOpts: pageOpts, sort: "newest", verifiedOnly: true });
      expect(profile?.name).toBe(MASKED);
      expect(directory.page[0].name).toBe(MASKED);
      expectPrivateNameAbsent(profile); expectPrivateNameAbsent(directory);
    }
    await expect(s.t.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(s.t.query(api.messages.index.getConversation, { conversationId: s.conversationId })).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test.each(["adminId", "ownerId", "staffId"] as const)("%s keeps existing full-name behavior after Deal creation", async role => {
    const s = await setup();
    await accept(s);
    const viewer = asUser(s.t, s[role]);
    expect((await viewer.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId })).finalQuote?.companyName).toBe(NAME);
    expect((await viewer.query(api.siteVisits.index.getForProject, { projectId: s.projectId })).assessment?.companyName).toBe(NAME);
    expect((await viewer.query(api.deals.index.getByProject, { projectId: s.projectId }))?.companyName).toBe(NAME);
    expect((await viewer.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts })).page[0].payload.companyName).toBe(NAME);
  });

  test("public API arguments cannot impersonate a Client or control identity visibility", async () => {
    const s = await setup(), b = await relationship(s, s.otherClientId);
    await accept(s);
    const other = asUser(s.t, s.otherClientId);
    for (const override of [{ isRevealed: true }, { hasDeal: true }, { showFullName: true }, { clientId: s.clientId }, { clientUserId: s.clientId }]) {
      await expect(other.query(api.quotes.index.getReceivedInitialQuote, { quoteId: b.quoteId, ...override })).rejects.toThrow();
    }
    expect((await other.query(api.quotes.index.getReceivedInitialQuote, { quoteId: b.quoteId })).company.name).toBe(MASKED);
  });

  test("push identity is resolved for each stored recipient, regardless of the caller's Deal", async () => {
    const s = await setup(), b = await relationship(s, s.otherClientId);
    const aNotification = await pushNotification(s), bNotification = await pushNotification(b);
    await accept(s);
    for (const [notificationId, expected] of [[aNotification, NAME], [bNotification, MASKED]] as const) {
      const claim = await asUser(s.t, s.clientId).mutation(internal.notifications.pushDeliveryModel.claimMarketplacePush, { notificationId, leaseId: `recipient-${notificationId}` });
      expect(claim?.notification.payload.companyName).toBe(expected);
      for (const locale of ["fr", "en"] as const) expect(marketplacePushPresentation(claim!.notification, "client", locale).body).toContain(expected);
    }
  });

  test("notification payload company IDs/aliases cannot create a Deal relationship", async () => {
    const s = await setup();
    await accept(s);
    const companyId = await s.t.run(ctx => ctx.db.insert("companies", { name: "Another Company", onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1 }));
    const otherCompany = await relationship(s, s.clientId, companyId);
    await s.t.run(async ctx => {
      const notification = (await ctx.db.query("notifications").withIndex("by_recipientUserId_and_createdAt", q => q.eq("recipientUserId", s.clientId)).take(20)).find(n => n.entity.id === otherCompany.conversationId)!;
      await ctx.db.patch(notification._id, { payload: { companyId: s.companyId, companyName: NAME, actorDisplayName: NAME } });
    });
    const inbox = await asUser(s.t, s.clientId).query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
    expect(inbox.page.find(n => n.entity.id === otherCompany.conversationId)?.payload.companyName).toBe(MASKED);
  });

  test("Deal Clients retain filename/download/alias privacy and no extra contact or metadata fields", async () => {
    const s = await setup();
    const fileName = `${NAME}2026-private-contact?.PdF`;
    const body = `Work by ${NAME}. Please see ${fileName}.`;
    const sent = await uploadMessageFile(s, fileName, body, "deal-client-file");
    const finalName = `${LEGAL_NAME}2026-private-document.pdf`;
    await s.t.run(async ctx => {
      await ctx.db.patch(s.companyId, { phone: "+212612345678", website: "https://private.example.test" });
      await ctx.db.patch(s.revisionId, { pdfStorageId: await ctx.storage.store(new Blob(["%PDF-1.7 quote"])), pdfFileName: finalName, pdfUploadFileName: finalName, pdfSize: 14, scope: body });
      await ctx.db.patch(s.quoteId, { message: body });
      await ctx.db.patch(s.invitationId, { message: body });
      await ctx.db.patch(s.assessmentId, { companyNote: body });
    });
    await pushNotification(s);
    const notificationId = await s.t.run(async ctx => (await ctx.db.query("notifications")
      .withIndex("by_recipientUserId_and_dedupeKey", q => q.eq("recipientUserId", s.clientId).eq("dedupeKey", `message:${sent.messageId}:received`)).unique())!._id);
    await accept(s);
    const client = asUser(s.t, s.clientId);
    const before = await s.t.run(async ctx => ({ company: await ctx.db.get(s.companyId), deal: await ctx.db.query("deals").withIndex("by_projectId", q => q.eq("projectId", s.projectId)).unique(), revision: await ctx.db.get(s.revisionId), attachment: await ctx.db.get(sent.attachmentId), message: await ctx.db.get(sent.messageId) }));
    const expected = `Work by ${NAME}. Please see attachment.PdF.`;
    const messages = await client.query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts });
    expect(messages.page[0]).toMatchObject({ body: expected, attachment: { fileName: "attachment.PdF" } });
    expect((await client.query(api.messages.index.getConversation, { conversationId: s.conversationId })).preview).toBe(expected);
    const quote = await client.query(api.quotes.index.getReceivedInitialQuote, { quoteId: s.quoteId });
    const invitation = await client.query(api.invitations.index.listProjectInvitations, { projectId: s.projectId });
    const assessment = await client.query(api.siteVisits.index.getForProject, { projectId: s.projectId });
    const finalQuote = await client.query(api.finalQuotes.index.getForConversation, { conversationId: s.conversationId });
    expect(quote.message).toBe(expected); expect(invitation[0].message).toBe(expected); expect(assessment.assessment?.companyNote).toBe(expected);
    expect(finalQuote.finalQuote?.revisions[0]).toMatchObject({ scope: expected, pdfFileName: "final-quote.pdf" });
    expect((await client.query(internal.messages.download.authorizeAttachmentDownload, { attachmentId: sent.attachmentId })).fileName).toBe("attachment.PdF");
    expect((await client.fetch(`/messages/attachments/${sent.attachmentId}`)).headers.get("content-disposition")).toContain("attachment.PdF");
    expect((await client.query(internal.finalQuotes.download.authorizePdfDownload, { revisionId: s.revisionId })).fileName).toBe("final-quote.pdf");
    expect((await client.fetch(`/final-quotes/pdf/${s.revisionId}`)).headers.get("content-disposition")).toContain("final-quote.pdf");
    const claim = await s.t.mutation(internal.notifications.pushDeliveryModel.claimMarketplacePush, { notificationId, leaseId: "deal-file-privacy" });
    const inbox = await client.query(api.notifications.index.listMyNotifications, { paginationOpts: pageOpts });
    expect(claim?.notification.payload.companyName).toBe(NAME);
    expect(claim?.notification.payload.messagePreview).toBe(expected);
    expect(inbox.page.find(n => n.id === notificationId)?.payload.messagePreview).toBe(expected);
    const serialized = JSON.stringify([quote, invitation, assessment, finalQuote, messages, inbox, claim]);
    for (const privateValue of [fileName, finalName, "+212612345678", "https://private.example.test", '"uploadFileName"', '"pdfUploadFileName"', '"legalName"']) expect(serialized).not.toContain(privateValue);
    expect(await s.t.run(ctx => ctx.db.get(sent.attachmentId))).toEqual(before.attachment);
    expect(await s.t.run(ctx => ctx.db.get(s.revisionId))).toEqual(before.revision);
    expect(await s.t.run(ctx => ctx.db.get(s.companyId))).toEqual(before.company);
    expect(await s.t.run(ctx => ctx.db.get(sent.messageId))).toEqual(before.message);
    expect(await s.t.run(ctx => ctx.db.get(before.deal!._id))).toEqual(before.deal);
  });

  test("Deal Clients still fail closed for unreconstructable legacy filename paths", async () => {
    const s = await setup();
    const sent = await uploadMessageFile(s, `${NAME}2026/plans.pdf`, `See ${NAME}2026/plans.pdf.`, "deal-legacy-file");
    await s.t.run(ctx => ctx.db.patch(sent.attachmentId, { uploadFileName: undefined }));
    await accept(s);
    await expect(asUser(s.t, s.clientId).query(api.messages.index.listMessages, { conversationId: s.conversationId, paginationOpts: pageOpts })).rejects.toThrow("COMPANY_FILE_PRIVACY_LIMIT");
  });

  test("historical site-visit notes and proposal history follow Deal identity while keeping filenames private", async () => {
    const s = await setup();
    const body = `Representative of ${NAME}. See ${LEGAL_NAME}2026.pdf.`;
    await s.t.run(async ctx => {
      const visitId = await ctx.db.insert("siteVisits", {
        assessmentId: s.assessmentId, projectId: s.projectId, companyId: s.companyId, clientId: s.clientId,
        conversationId: s.conversationId, initialQuoteId: s.quoteId, proposedByUserId: s.ownerId,
        proposedDate: "2026-10-01", proposedTime: "10:00", timezone: "Africa/Casablanca", siteAddress: "Client project site, Rabat",
        note: body, status: "completed", active: false, proposedAt: 5, completedAt: 6, createdAt: 5, updatedAt: 6,
      });
      const proposalId = await ctx.db.insert("siteVisitProposals", { visitId, assessmentId: s.assessmentId, sequence: 1, proposedByUserId: s.ownerId,
        proposedDate: "2026-10-01", proposedTime: "10:00", timezone: "Africa/Casablanca", siteAddress: "Client project site, Rabat", note: body, proposedAt: 5 });
      await ctx.db.patch(visitId, { currentProposalId: proposalId });
      await ctx.db.patch(s.revisionId, { pdfFileName: `${LEGAL_NAME}2026.pdf` });
    });
    const client = asUser(s.t, s.clientId);
    const before = await client.query(api.siteVisits.index.getForProject, { projectId: s.projectId });
    expect(before.assessment?.visit?.note).toBe(`Representative of ${MASKED}. See final-quote.pdf.`);
    await accept(s);
    const after = await client.query(api.siteVisits.index.getForProject, { projectId: s.projectId });
    expect(after.assessment?.companyName).toBe(NAME);
    expect(after.assessment?.visit?.note).toBe(`Representative of ${NAME}. See final-quote.pdf.`);
    expect(after.assessment?.visit?.proposals[0].note).toBe(after.assessment?.visit?.note);
  });
});
