/// <reference types="vite/client" />

import { convexTest, type TestConvexForDataModel } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { v } from "convex/values";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";
import { COMPANY_LOGO_MAX_BYTES } from "./storage/constants";
import { assertNotVerificationStorage, getNonVerificationStorageUrl } from "./storage/verificationPrivacy";
import { maskCompanyName } from "./lib/companyName";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvexForDataModel<DataModel>;
const page = { numItems: 20, cursor: null };
const now = 1_800_000_000_000;
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII="), c => c.charCodeAt(0));
const logoApi = api.companyLogos.index;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
  process.env.VERIFICATION_WEB_ORIGINS = "http://localhost:3000";
});
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); });

async function seed(t: Backend, options: {
  accountType?: "company" | "client" | "admin" | "seo_team";
  role?: "owner" | "staff"; status?: "active" | "inactive"; companyId?: Id<"companies">;
} = {}) {
  return await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { accountType: options.accountType ?? "company", onboardingStatus: "completed", createdAt: 1, updatedAt: 1 });
    const companyId = options.companyId ?? await ctx.db.insert("companies", {
      name: "Atlas Construction", legalName: "Atlas SARL", slug: crypto.randomUUID(), phone: "0612345678",
      city: "Rabat", description: "A completed construction company profile.", onboardingStatus: "completed",
      verificationStatus: "draft", directoryListed: true, createdAt: 1, updatedAt: 1,
    });
    const membershipId = await ctx.db.insert("companyMembers", {
      companyId, userId, role: options.role ?? "owner", status: options.status ?? "active", createdAt: 1,
    });
    return { userId, companyId, membershipId };
  });
}
const asUser = (t: Backend, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|session` });
const publicPath = (imageId: Id<"companyLogoImages">) => `/company-logos/public/${imageId}`;
const privatePath = (imageId: Id<"companyLogoImages">) => `/company-logos/private/${imageId}`;

async function upload(t: Backend, userId: Id<"users">, bytes = png, contentType: "image/png" | "image/jpeg" | "image/webp" = "image/png") {
  const owner = asUser(t, userId);
  const intent = await owner.mutation(logoApi.generateUploadIntent, { contentType, size: bytes.length });
  expect(intent.uploadUrl).toBe("https://example.convex.site/company-logos/upload");
  const response = await owner.fetch("/company-logos/upload", {
    method: "POST", headers: { "Content-Type": contentType, "X-Upload-Token": intent.uploadToken },
    body: new Blob([new Uint8Array(bytes)]),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const result = await response.json() as { imageId: Id<"companyLogoImages"> };
  expect(Object.keys(result)).toEqual(["imageId"]);
  const image = await t.run(ctx => ctx.db.get(result.imageId));
  return { ...intent, image: image! };
}
async function approve(t: Backend, adminId: Id<"users">, image: Awaited<ReturnType<typeof upload>>["image"]) {
  await asUser(t, adminId).mutation(logoApi.approve, { imageId: image._id, expectedSha256: image.sha256 });
}
async function fixture() {
  const t = convexTest(schema, modules);
  const company = await seed(t);
  const admin = await seed(t, { accountType: "admin" });
  const uploaded = await upload(t, company.userId);
  return { t, company, admin, ...uploaded };
}

async function conversation(t: Backend, company: Awaited<ReturnType<typeof seed>>) {
  const client = await seed(t, { accountType: "client" });
  return await t.run(async ctx => {
    await ctx.db.patch(company.companyId, { verificationStatus: "verified" });
    const projectId = await ctx.db.insert("projects", { clientId: client.userId, primaryCategory: "renovation", city: "rabat",
      countryCode: "MA", title: "Villa renovation", propertyType: "house", surface: 100, surfaceUnknown: false,
      description: "Complete structural and finishing renovation.", timeline: "one_to_three_months", visibility: "marketplace",
      status: "published", lastCompletedStep: 6, createdAt: 1, updatedAt: 1, publishedAt: 1 });
    const quoteId = await ctx.db.insert("projectQuotes", { projectId, companyId: company.companyId, submittedByUserId: company.userId,
      message: "A proposal from our experienced team.", estimatedPrice: 100000, currency: "MAD", estimatedDuration: 60,
      availableStartDate: "2099-01-01", scope: "Full renovation and project coordination.", quoteType: "initial",
      status: "discussion_open", createdAt: 1, updatedAt: 1, submittedAt: 1 });
    const conversationId = await ctx.db.insert("conversations", { projectId, quoteId, clientId: client.userId,
      companyId: company.companyId, status: "active", createdBy: client.userId, createdAt: 1, updatedAt: 1 });
    return { projectId, quoteId, conversationId, clientId: client.userId };
  });
}

describe("private Company logo uploads", () => {
  test("Admin review DTOs identify the Company and both immutable submissions without storage references", async () => {
    const { t, company, admin, image: a } = await fixture();
    await approve(t, admin.userId, a);
    const b = (await upload(t, company.userId, new Uint8Array([...png, 2]))).image;
    const c = (await upload(t, company.userId, new Uint8Array([...png, 3]))).image;
    const reviewer = asUser(t, admin.userId);
    const review = await reviewer.query(logoApi.getAdminReview, { imageId: b._id });
    expect(review).toMatchObject({ company: { companyId: company.companyId, name: "Atlas Construction", legalName: "Atlas SARL" },
      currentSubmissionId: c._id, isCurrentSubmission: false, isCurrentApproved: false,
      image: { imageId: b._id, sha256: b.sha256 }, approved: { imageId: a._id, sha256: a.sha256 } });
    const queue = await reviewer.query(logoApi.listAdminLogos, { status: "pending", paginationOpts: page });
    expect(queue.page).toHaveLength(2);
    expect(queue.page.find(row => row.imageId === c._id)).toMatchObject({ companyName: "Atlas Construction", isCurrentSubmission: true });
    expect(queue.page.find(row => row.imageId === b._id)?.isCurrentSubmission).toBe(false);
    const summary = await reviewer.query(api.admin.companies.getCompanySummary, { companyId: company.companyId });
    expect(summary).toMatchObject({ submittedLogoImageId: c._id, approvedLogoImageId: a._id });
    for (const dto of [review, queue, summary]) {
      expect(JSON.stringify(dto)).not.toContain(a.storageId);
      expect(JSON.stringify(dto)).not.toContain(b.storageId);
      expect(JSON.stringify(dto)).not.toContain("/api/storage/");
    }
    await expect(asUser(t, company.userId).query(api.admin.companies.getCompanySummary, { companyId: company.companyId })).rejects.toThrow();
  });
  test("stores the exact bytes and storage-derived hash in one pending record and append-only history", async () => {
    const { t, company, image, uploadToken } = await fixture();
    const state = await t.run(async ctx => ({
      company: await ctx.db.get(company.companyId), metadata: await ctx.db.system.get("_storage", image.storageId),
      bytes: Array.from(new Uint8Array(await (await ctx.storage.get(image.storageId))!.arrayBuffer())),
      intent: await ctx.db.query("companyLogoUploadIntents").withIndex("by_token", q => q.eq("token", uploadToken)).unique(),
      history: await ctx.db.query("companyLogoModerationHistory").collect(),
    }));
    expect(state.bytes).toEqual(Array.from(png));
    expect(image).toMatchObject({ companyId: company.companyId, uploadedBy: company.userId, uploadedAt: now,
      moderationStatus: "pending", contentType: "image/png", size: png.length, sha256: state.metadata?.sha256 });
    expect(state.company?.submittedLogoImageId).toBe(image._id);
    expect(state.company?.approvedLogoImageId).toBeUndefined();
    expect(state.intent).toMatchObject({ userId: company.userId, companyId: company.companyId, claimedAt: now, imageId: image._id });
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ action: "uploaded", oldStatus: null, newStatus: "pending", changedBy: company.userId });
  });

  test.each([
    ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])],
    ["image/png", png],
    ["image/webp", new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
  ] as const)("accepts the existing %s signature", async (type, bytes) => {
    const t = convexTest(schema, modules);
    const company = await seed(t);
    expect((await upload(t, company.userId, bytes, type)).image.contentType).toBe(type);
  });

  test("accepts exactly 5 MiB and rejects invalid size/type intents", async () => {
    const t = convexTest(schema, modules);
    const company = await seed(t);
    const bytes = new Uint8Array(COMPANY_LOGO_MAX_BYTES); bytes.set(png);
    await upload(t, company.userId, bytes);
    for (const size of [0, -1, 1.5, COMPANY_LOGO_MAX_BYTES + 1, NaN, Infinity]) {
      await expect(asUser(t, company.userId).mutation(logoApi.generateUploadIntent, { contentType: "image/png", size })).rejects.toThrow();
    }
    await expect(asUser(t, company.userId).mutation(logoApi.generateUploadIntent, {
      contentType: "image/svg+xml" as "image/png", size: 100,
    })).rejects.toThrow();
  });

  test("only the active owner can issue an intent or upload; membership is rechecked", async () => {
    const { t, company, image } = await fixture();
    const owner = asUser(t, company.userId);
    const intent = await owner.mutation(logoApi.generateUploadIntent, { contentType: "image/png", size: png.length });
    const denied: Backend[] = [t];
    for (const options of [{ accountType: "client" }, { accountType: "admin" }, { accountType: "seo_team" },
      { role: "staff", companyId: company.companyId }, { status: "inactive" }] as const) {
      denied.push(asUser(t, (await seed(t, options)).userId));
    }
    for (const caller of denied) {
      await expect(caller.mutation(logoApi.generateUploadIntent, { contentType: "image/png", size: png.length })).rejects.toThrow();
      expect((await caller.fetch("/company-logos/upload", { method: "POST", headers: {
        "Content-Type": "image/png", "X-Upload-Token": intent.uploadToken,
      }, body: new Blob([png]) })).status).toBe(400);
    }
    await t.run(ctx => ctx.db.patch(company.membershipId, { status: "inactive" }));
    expect((await owner.fetch("/company-logos/upload", { method: "POST", headers: {
      "Content-Type": "image/png", "X-Upload-Token": intent.uploadToken,
    }, body: new Blob([png]) })).status).toBe(400);
    expect((await t.run(ctx => ctx.db.query("companyLogoImages").collect())).map(row => row._id)).toEqual([image._id]);
  });

  test("rejects cross-Company tokens, expiry at the boundary and successful token reuse", async () => {
    const { t, company, image, uploadToken } = await fixture();
    const other = await seed(t);
    const owner = asUser(t, company.userId);
    const intent = await owner.mutation(logoApi.generateUploadIntent, { contentType: "image/png", size: png.length });
    const send = (caller: Backend, token: string) => caller.fetch("/company-logos/upload", {
      method: "POST", headers: { "Content-Type": "image/png", "X-Upload-Token": token }, body: new Blob([png]),
    });
    expect((await send(asUser(t, other.userId), intent.uploadToken)).status).toBe(400);
    expect((await send(owner, uploadToken)).status).toBe(400);
    await t.run(async ctx => {
      const row = await ctx.db.query("companyLogoUploadIntents").withIndex("by_token", q => q.eq("token", intent.uploadToken)).unique();
      await ctx.db.patch(row!._id, { expiresAt: now });
    });
    expect((await send(owner, intent.uploadToken)).status).toBe(400);
    expect((await t.run(ctx => ctx.db.get(company.companyId)))?.submittedLogoImageId).toBe(image._id);
  });

  test("rejects forged headers, incorrect bytes/signature and streaming size mismatch before storing", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const owner = asUser(t, userId);
    const intent = await owner.mutation(logoApi.generateUploadIntent, { contentType: "image/png", size: png.length });
    const invalid = [
      { type: "image/jpeg", bytes: png }, { type: "image/png", bytes: new TextEncoder().encode("not an image") },
      { type: "image/png", bytes: new Uint8Array(png.length) }, { type: "image/png", bytes: png.slice(0, 7) },
      { type: "image/png", bytes: new Uint8Array(png.length + 1) }, { type: "image/png", bytes: new Uint8Array() },
      { type: "image/png", bytes: png, length: String(COMPANY_LOGO_MAX_BYTES + 1) },
    ];
    for (const input of invalid) {
      const response = await owner.fetch("/company-logos/upload", { method: "POST", headers: {
        "Content-Type": input.type, "X-Upload-Token": intent.uploadToken, ...(input.length ? { "Content-Length": input.length } : {}),
      }, body: new Blob([input.bytes]) });
      expect(response.status).toBe(400);
    }
    // A forged small Content-Length cannot hide a larger streaming body.
    const response = await owner.fetch("/company-logos/upload", { method: "POST", headers: {
      "Content-Type": "image/png", "X-Upload-Token": intent.uploadToken, "Content-Length": "1",
    }, body: new Blob([new Uint8Array(COMPANY_LOGO_MAX_BYTES + 1)]) });
    expect(response.status).toBe(400);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("companyLogoImages").collect())).toEqual([]);
  });

  test("rechecks ownership/expiry after receiving bytes and cleans only the failed new file", async () => {
    for (const change of ["inactive", "expired"] as const) {
      const { t, company, image } = await fixture();
      const owner = asUser(t, company.userId);
      const intent = await owner.mutation(logoApi.generateUploadIntent, { contentType: "image/png", size: png.length });
      const stream = new ReadableStream({ async pull(controller) {
        await t.run(async ctx => {
          if (change === "inactive") await ctx.db.patch(company.membershipId, { status: "inactive" });
          else {
            const row = await ctx.db.query("companyLogoUploadIntents").withIndex("by_token", q => q.eq("token", intent.uploadToken)).unique();
            await ctx.db.patch(row!._id, { expiresAt: now });
          }
        });
        controller.enqueue(png); controller.close();
      } }, { highWaterMark: 0 });
      expect((await owner.fetch("/company-logos/upload", { method: "POST", headers: {
        "Content-Type": "image/png", "X-Upload-Token": intent.uploadToken,
      }, body: stream, duplex: "half" } as RequestInit)).status).toBe(400);
      const files = await t.run(ctx => ctx.db.system.query("_storage").collect());
      expect(files.map(file => file._id)).toEqual([image.storageId]);
      await t.mutation(internal.companyLogos.index.cleanupFailedUpload, { storageId: image.storageId });
      expect(await t.run(async ctx => (await ctx.storage.get(image.storageId)) !== null)).toBe(true);
    }
  });

  test("concurrent successful uses of one intent leave one immutable image and no orphan file", async () => {
    const t = convexTest(schema, modules);
    const company = await seed(t);
    const owner = asUser(t, company.userId);
    const intent = await owner.mutation(logoApi.generateUploadIntent, { contentType: "image/png", size: png.length });
    const responses = await Promise.all([1, 2].map(() => owner.fetch("/company-logos/upload", {
      method: "POST", headers: { "Content-Type": "image/png", "X-Upload-Token": intent.uploadToken }, body: new Blob([png]),
    })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
    expect(await t.run(ctx => ctx.db.query("companyLogoImages").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("companyLogoModerationHistory").collect())).toHaveLength(1);
  });

  test("a transient failed cleanup schedules a safe retry for the unbound file", async () => {
    let attempts = 0;
    const t = convexTest(schema, { ...modules, "./companyLogos/index.ts": async () => {
      const original = await modules["./companyLogos/index.ts"]() as typeof import("./companyLogos/index");
      // Fault injection uses the runtime handler that Convex omits from its public types.
      const cleanup = original.cleanupFailedUpload as typeof original.cleanupFailedUpload & {
        _handler: (ctx: MutationCtx, args: { storageId: Id<"_storage"> }) => Promise<null>;
      };
      return { ...original, cleanupFailedUpload: internalMutation({
        args: { storageId: v.id("_storage") }, returns: v.null(), handler: async (ctx, args) => {
          if (++attempts === 1) throw new Error("Transient cleanup failure");
          return await cleanup._handler(ctx, args);
        },
      }) };
    } });
    const company = await seed(t);
    const owner = asUser(t, company.userId);
    const intent = await owner.mutation(logoApi.generateUploadIntent, { contentType: "image/png", size: png.length });
    const stream = new ReadableStream({ async pull(controller) {
      await t.run(ctx => ctx.db.patch(company.membershipId, { status: "inactive" }));
      controller.enqueue(png); controller.close();
    } }, { highWaterMark: 0 });
    expect((await owner.fetch("/company-logos/upload", { method: "POST", headers: {
      "Content-Type": "image/png", "X-Upload-Token": intent.uploadToken,
    }, body: stream, duplex: "half" } as RequestInit)).status).toBe(400);
    await t.finishAllScheduledFunctions(() => {});
    expect(attempts).toBe(2);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("companyLogoImages").collect())).toEqual([]);
  });

  test("CORS accepts only configured origins/methods/headers; every response is no-store", async () => {
    const { t, company, image } = await fixture();
    const allowed = await t.fetch("/company-logos/upload", { method: "OPTIONS", headers: {
      Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type,x-upload-token",
    } });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(allowed.headers.get("cache-control")).toContain("no-store");
    const deniedHeaders: Record<string, string>[] = [
      { Origin: "https://evil.test", "Access-Control-Request-Method": "POST" },
      { Origin: "http://localhost:3000", "Access-Control-Request-Method": "PUT" },
      { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "cookie" },
    ];
    for (const headers of deniedHeaders) expect((await t.fetch("/company-logos/upload", { method: "OPTIONS", headers })).status).toBe(403);
    expect((await asUser(t, company.userId).fetch(privatePath(image._id), { headers: { Origin: "https://evil.test" } })).status).toBe(404);
    const unauthorized = await t.fetch(privatePath(image._id));
    expect(unauthorized.headers.get("cache-control")).toContain("no-store");
  });
});

describe("logo visibility and moderation", () => {
  test("copied pending/rejected URLs work only for the current owner and Admin, including same-Company staff denial", async () => {
    const { t, company, admin, image } = await fixture();
    const denied: Backend[] = [t];
    for (const options of [{}, { accountType: "client" }, { accountType: "seo_team" },
      { role: "staff", companyId: company.companyId }, { status: "inactive" }] as const) {
      denied.push(asUser(t, (await seed(t, options)).userId));
    }
    for (const status of ["pending", "rejected"]) {
      if (status === "rejected") await asUser(t, admin.userId).mutation(logoApi.reject, {
        imageId: image._id, expectedSha256: image.sha256, reason: "Contains a phone number",
      });
      expect((await t.fetch(publicPath(image._id))).status).toBe(404);
      for (const caller of denied) {
        expect((await caller.fetch(privatePath(image._id))).status).toBe(404);
        await expect(caller.query(logoApi.getHistory, { imageId: image._id, paginationOpts: page })).rejects.toThrow();
        await expect(caller.query(logoApi.getAdminReview, { imageId: image._id })).rejects.toThrow();
      }
      for (const userId of [company.userId, admin.userId]) {
        const response = await asUser(t, userId).fetch(privatePath(image._id));
        expect(response.status).toBe(200);
        expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(png));
        expect(response.headers.get("cache-control")).toContain("no-store");
      }
    }
    const mine = await asUser(t, company.userId).query(logoApi.getMyLogos, {});
    expect(mine.submitted).toMatchObject({ moderationStatus: "rejected", reason: "Contains a phone number" });
    expect(JSON.stringify(mine)).not.toContain(image.storageId);
    expect(JSON.stringify(mine)).not.toContain("/api/storage/");
    await t.run(ctx => ctx.db.patch(company.membershipId, { status: "inactive" }));
    expect((await asUser(t, company.userId).fetch(privatePath(image._id))).status).toBe(404);
  });

  test("only Admin can approve/reject/hide and inspect the review queue", async () => {
    const { t, company, image } = await fixture();
    const callers = [t, asUser(t, company.userId)];
    for (const options of [{ accountType: "client" }, { accountType: "seo_team" }, { role: "staff", companyId: company.companyId }] as const) {
      callers.push(asUser(t, (await seed(t, options)).userId));
    }
    for (const caller of callers) {
      await expect(caller.query(logoApi.listAdminLogos, { status: "pending", paginationOpts: page })).rejects.toThrow();
      await expect(caller.mutation(logoApi.approve, { imageId: image._id, expectedSha256: image.sha256 })).rejects.toThrow();
      for (const fn of [logoApi.reject, logoApi.hide]) await expect(caller.mutation(fn, {
        imageId: image._id, expectedSha256: image.sha256, reason: "Has branding",
      })).rejects.toThrow();
    }
    expect((await t.run(ctx => ctx.db.get(image._id)))?.moderationStatus).toBe("pending");
  });

  test("A remains public while B waits, rejection keeps A, approval atomically replaces A", async () => {
    const { t, company, admin, image: a } = await fixture();
    await approve(t, admin.userId, a);
    const b = (await upload(t, company.userId, new Uint8Array([...png, 1]))).image;
    expect(b.sha256).not.toBe(a.sha256);
    expect(b.storageId).not.toBe(a.storageId);
    expect((await t.fetch(publicPath(a._id))).status).toBe(200);
    expect((await t.fetch(publicPath(b._id))).status).toBe(404);
    await asUser(t, admin.userId).mutation(logoApi.reject, { imageId: b._id, expectedSha256: b.sha256, reason: "Identifying watermark" });
    expect((await t.fetch(publicPath(a._id))).status).toBe(200);
    const c = (await upload(t, company.userId, new Uint8Array([...png, 2]))).image;
    await approve(t, admin.userId, c);
    expect((await t.fetch(publicPath(a._id))).status).toBe(404);
    const publicResponse = await t.fetch(publicPath(c._id));
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("cache-control")).toContain("no-store");
    expect(publicResponse.headers.get("content-type")).toBe("image/png");
    expect(await publicResponse.arrayBuffer()).toEqual(new Uint8Array([...png, 2]).buffer);
    const state = await t.run(async ctx => ({ company: await ctx.db.get(company.companyId), images: await ctx.db.query("companyLogoImages").collect() }));
    expect(state.company).toMatchObject({ submittedLogoImageId: c._id, approvedLogoImageId: c._id });
    expect(state.images).toHaveLength(3);
    expect(await t.run(async ctx => (await ctx.storage.get(a.storageId)) !== null)).toBe(true);
  });

  test("rejects stale submissions, wrong file hashes, repeat decisions and concurrent decisions", async () => {
    const { t, company, admin, image: a } = await fixture();
    const b = (await upload(t, company.userId)).image;
    await expect(approve(t, admin.userId, a)).rejects.toThrow("COMPANY_LOGO_REVIEW_STALE");
    await expect(asUser(t, admin.userId).mutation(logoApi.reject, { imageId: a._id, expectedSha256: a.sha256, reason: "Has branding" })).rejects.toThrow("COMPANY_LOGO_REVIEW_STALE");
    await expect(asUser(t, admin.userId).mutation(logoApi.approve, { imageId: b._id, expectedSha256: "different-file-hash" })).rejects.toThrow("COMPANY_LOGO_REVIEW_STALE");
    const decisions = await Promise.allSettled([
      approve(t, admin.userId, b),
      asUser(t, admin.userId).mutation(logoApi.reject, { imageId: b._id, expectedSha256: b.sha256, reason: "Has branding" }),
    ]);
    expect(decisions.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter(result => result.status === "rejected")).toHaveLength(1);
    await expect(approve(t, admin.userId, b)).rejects.toThrow("COMPANY_LOGO_REVIEW_STALE");
    const history = await t.run(ctx => ctx.db.query("companyLogoModerationHistory").collect());
    expect(history).toHaveLength(3); // two uploads, exactly one decision
  });

  test("hide requires a reason, clears only the current public reference and never restores an older approved logo", async () => {
    const { t, company, admin, image: a } = await fixture();
    await approve(t, admin.userId, a);
    const b = (await upload(t, company.userId)).image;
    await approve(t, admin.userId, b);
    const c = (await upload(t, company.userId)).image;
    for (const reason of ["", " x ", "x".repeat(501)]) await expect(asUser(t, admin.userId).mutation(logoApi.hide, {
      imageId: b._id, expectedSha256: b.sha256, reason,
    })).rejects.toThrow("REJECTION_REASON_REQUIRED");
    await expect(asUser(t, admin.userId).mutation(logoApi.hide, { imageId: a._id, expectedSha256: a.sha256, reason: "Has branding" })).rejects.toThrow("COMPANY_LOGO_REVIEW_STALE");
    await asUser(t, admin.userId).mutation(logoApi.hide, { imageId: b._id, expectedSha256: b.sha256, reason: "  Website   discovered  " });
    const state = await t.run(ctx => ctx.db.get(company.companyId));
    expect(state?.approvedLogoImageId).toBeUndefined();
    expect(state?.submittedLogoImageId).toBe(c._id);
    for (const image of [a, b, c]) expect((await t.fetch(publicPath(image._id))).status).toBe(404);
    const review = await asUser(t, admin.userId).query(logoApi.getAdminReview, { imageId: b._id });
    expect(review.image).toMatchObject({ moderationStatus: "rejected", reason: "Website discovered" });
    const ownerImages = await asUser(t, company.userId).query(logoApi.listMyLogos, { paginationOpts: page });
    expect(ownerImages.page.find(row => row.imageId === b._id)).toMatchObject({ reason: "Website discovered" });
    const history = await asUser(t, company.userId).query(logoApi.getHistory, { imageId: b._id, paginationOpts: page });
    expect(history.page.map(row => row.action).sort()).toEqual(["approved", "hidden", "uploaded"]);
    expect(history.page.find(row => row.action === "hidden")).toMatchObject({ oldStatus: "approved", newStatus: "rejected", changedBy: admin.userId, reason: "Website discovered" });
    expect((await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: (await t.run(ctx => ctx.db.get(company.companyId)))!.slug! }))?.logoUrl).toBeNull();
  });

  test("reject reasons and indexed review/history pagination are validated", async () => {
    const { t, company, admin, image } = await fixture();
    const reviewer = asUser(t, admin.userId);
    for (const reason of ["", "x", "x".repeat(501)]) await expect(reviewer.mutation(logoApi.reject, {
      imageId: image._id, expectedSha256: image.sha256, reason,
    })).rejects.toThrow("REJECTION_REASON_REQUIRED");
    expect((await reviewer.query(logoApi.listAdminLogos, { status: "pending", paginationOpts: page })).page).toHaveLength(1);
    for (const numItems of [0, 101, 1.5]) await expect(reviewer.query(logoApi.listAdminLogos, {
      status: "pending", paginationOpts: { numItems, cursor: null },
    })).rejects.toThrow("INVALID_PAGINATION");
    await approve(t, admin.userId, image);
    expect((await reviewer.query(logoApi.listAdminLogos, { status: "pending", paginationOpts: page })).page).toEqual([]);
    const first = await asUser(t, company.userId).query(logoApi.getHistory, { imageId: image._id, paginationOpts: { numItems: 1, cursor: null } });
    const second = await asUser(t, company.userId).query(logoApi.getHistory, { imageId: image._id, paginationOpts: { numItems: 1, cursor: first.continueCursor } });
    expect(new Set([...first.page, ...second.page].map(row => row.historyId)).size).toBe(2);
  });
});

describe("logo isolation and existing marketplace rules", () => {
  test("general Company, quote and conversation queries never expose pending/rejected files or reasons to staff/Clients", async () => {
    const { t, company, admin, image } = await fixture();
    const relationship = await conversation(t, company);
    const staff = await seed(t, { role: "staff", companyId: company.companyId });
    const slug = (await t.run(ctx => ctx.db.get(company.companyId)))!.slug!;
    for (const status of ["pending", "rejected"]) {
      if (status === "rejected") await asUser(t, admin.userId).mutation(logoApi.reject, {
        imageId: image._id, expectedSha256: image.sha256, reason: "Private rejection reason: phone number",
      });
      for (const caller of [t, asUser(t, relationship.clientId), asUser(t, staff.userId)]) {
        const profile = await caller.query(api.portfolio.index.getPublicCompanyProfile, { slug });
        expect(profile?.logoUrl).toBeNull();
        const directory = await caller.query(api.companies.directory.listPublicCompanies, {
          paginationOpts: page, verifiedOnly: false, sort: "newest",
        });
        expect(directory.page.find(row => row.id === company.companyId)?.logoUrl).toBeNull();
        expect(JSON.stringify([profile, directory])).not.toContain(image.storageId);
        expect(JSON.stringify([profile, directory])).not.toContain("Private rejection reason");
      }
      for (const userId of [relationship.clientId, staff.userId]) {
        const caller = asUser(t, userId);
        const threads = await caller.query(api.messages.index.listMyThreads, {});
        const thread = await caller.query(api.messages.index.getConversation, { conversationId: relationship.conversationId });
        expect(JSON.stringify([threads, thread])).not.toContain(image.storageId);
        expect(JSON.stringify([threads, thread])).not.toContain(`/company-logos/`);
        expect(JSON.stringify([threads, thread])).not.toContain("Private rejection reason");
        await expect(caller.query(logoApi.listMyLogos, { paginationOpts: page })).rejects.toThrow();
      }
      const quotes = await asUser(t, relationship.clientId).query(api.quotes.index.listReceivedInitialQuotes, { projectId: relationship.projectId });
      expect(JSON.stringify(quotes)).not.toContain(`/company-logos/`);
      expect(JSON.stringify(quotes)).not.toContain(image.storageId);
      const summary = await asUser(t, admin.userId).query(api.admin.companies.getCompanySummary, { companyId: company.companyId });
      expect(summary?.logoUrl).toBeNull();
    }
  });

  test("public delivery follows existing profile visibility; approval neither verifies a Company nor changes NAME masking", async () => {
    const { t, company, admin, image } = await fixture();
    const before = (await t.run(ctx => ctx.db.get(company.companyId)))!;
    const getProfile = () => t.query(api.portfolio.index.getPublicCompanyProfile, { slug: before.slug! });
    const initial = await getProfile();
    await approve(t, admin.userId, image);
    const approved = await getProfile();
    expect(approved).toMatchObject({ isVerified: false, name: maskCompanyName(before.name), logoUrl: `https://example.convex.site${publicPath(image._id)}` });
    expect(approved?.name).toBe(initial?.name);
    const after = await t.run(ctx => ctx.db.get(company.companyId));
    expect(after).toMatchObject({ name: before.name, legalName: before.legalName, verificationStatus: "draft" });
    expect(await t.run(ctx => ctx.db.query("companyVerificationHistory").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("companyVerificationDocuments").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("deals").collect())).toEqual([]);
    expect((await t.fetch(publicPath(image._id))).status).toBe(200); // Admin approval alone is sufficient.
    await t.run(ctx => ctx.db.patch(company.companyId, { operationalStatus: "suspended" }));
    expect((await t.fetch(publicPath(image._id))).status).toBe(200); // Existing historical public profile remains readable.
    expect((await getProfile())?.marketplaceAvailable).toBe(false);
    for (const patch of [{ onboardingStatus: "pending" as const }, { description: undefined }]) {
      await t.run(ctx => ctx.db.patch(company.companyId, patch));
      expect((await t.fetch(publicPath(image._id))).status).toBe(404);
      expect(await getProfile()).toBeNull();
      await t.run(ctx => ctx.db.patch(company.companyId, { onboardingStatus: "completed", description: before.description }));
    }
  });

  test("preserves every legacy file/reference but treats all legacy logos as unreviewed without a fallback", async () => {
    const { t, company, admin, image } = await fixture();
    const legacy = await t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob([png], { type: "image/png" }));
      const mediaId = await ctx.db.insert("publicMedia", { storageProvider: "r2", companyId: company.companyId, purpose: "companyLogo",
        objectKey: `companies/${company.companyId}/logo/legacy.png`, mimeType: "image/png", size: png.length, uploadedBy: company.userId, createdAt: 1 });
      await ctx.db.patch(company.companyId, { logoStorageId: storageId, logoMediaId: mediaId });
      return { storageId, mediaId };
    });
    const owner = asUser(t, company.userId);
    expect((await owner.query(api.companies.index.getProfileManager, {})).logoUrl).toBeNull();
    expect((await owner.query(api.companies.index.getOnboardingProfile, {}))?.logoUrl).toBeNull();
    await approve(t, admin.userId, image);
    await asUser(t, admin.userId).mutation(logoApi.hide, { imageId: image._id, expectedSha256: image.sha256, reason: "Contains a QR code" });
    expect((await owner.query(api.companies.index.getProfileManager, {})).logoUrl).toBeNull();
    const state = await t.run(async ctx => ({ company: await ctx.db.get(company.companyId), media: await ctx.db.get(legacy.mediaId),
      storage: await ctx.db.system.get("_storage", legacy.storageId), images: await ctx.db.query("companyLogoImages").collect() }));
    expect(state.company).toMatchObject({ logoStorageId: legacy.storageId, logoMediaId: legacy.mediaId });
    expect(state.media).not.toBeNull(); expect(state.storage).not.toBeNull(); expect(state.images).toHaveLength(1);
    // Existing native links remain a separate rollout issue; this code does not revoke them.
    expect(await t.run(ctx => getNonVerificationStorageUrl(ctx, legacy.storageId))).not.toBeNull();
  });

  test("closes every legacy public logo intent path while covers also require private moderation", async () => {
    const { t, company } = await fixture();
    const owner = asUser(t, company.userId);
    await expect(owner.action(api.storage.r2.requestPublicMediaUpload, { purpose: "companyLogo", contentType: "image/png", size: png.length })).rejects.toThrow("COMPANY_LOGO_PRIVATE_UPLOAD_REQUIRED");
    await expect(owner.mutation(api.companies.index.setCompanyPublicImage, { kind: "logo", uploadToken: "legacy" })).rejects.toThrow("COMPANY_LOGO_PRIVATE_UPLOAD_REQUIRED");
    await expect(owner.mutation(api.companies.index.completeOnboarding, {
      name: "Atlas Construction", legalName: "Atlas SARL", website: "", phone: "0612345678", city: "Rabat", description: "A complete construction profile.", services: [], logoUploadToken: "legacy",
    })).rejects.toThrow("COMPANY_LOGO_PRIVATE_UPLOAD_REQUIRED");
    await expect(t.query(internal.storage.publicMedia.getUploadAccess, { userId: company.userId, purpose: "companyLogo", contentType: "image/png", size: png.length })).rejects.toThrow("COMPANY_LOGO_PRIVATE_UPLOAD_REQUIRED");
    await expect(t.mutation(internal.storage.publicMedia.createUploadIntent, { userId: company.userId, companyId: company.companyId,
      purpose: "companyLogo", contentType: "image/png", size: png.length, uploadToken: "legacy", objectKey: `companies/${company.companyId}/logo/legacy.png`,
    })).rejects.toThrow("COMPANY_LOGO_PRIVATE_UPLOAD_REQUIRED");
    const token = await t.run(async ctx => {
      await ctx.db.insert("publicMediaUploadIntents", { userId: company.userId, companyId: company.companyId, purpose: "companyLogo",
        expectedContentType: "image/png", expectedSize: png.length, token: "legacy", objectKey: `companies/${company.companyId}/logo/legacy.png`, verifiedAt: now, expiresAt: now + 1000, createdAt: now });
      return "legacy";
    });
    await expect(t.query(internal.storage.publicMedia.getUploadIntentForVerification, { userId: company.userId, uploadToken: token })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
    await expect(t.mutation(internal.storage.publicMedia.markUploadVerified, { userId: company.userId, uploadToken: token,
      objectKey: `companies/${company.companyId}/logo/legacy.png`, contentType: "image/png", size: png.length,
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
    await expect(t.query(internal.storage.publicMedia.getUploadAccess, { userId: company.userId, purpose: "companyCover", contentType: "image/png", size: png.length })).rejects.toThrow("COMPANY_COVER_PRIVATE_UPLOAD_REQUIRED");
  });

  test("private logo IDs cannot yield raw URLs, be attached/downloaded as PDFs or be discarded through other APIs", async () => {
    const { t, company, image } = await fixture();
    await expect(t.run(ctx => assertNotVerificationStorage(ctx, image.storageId))).rejects.toThrow("PRIVATE_COMPANY_LOGO_FILE");
    expect(await t.run(ctx => getNonVerificationStorageUrl(ctx, image.storageId))).toBeNull();
    const relationship = await conversation(t, company);
    const owner = asUser(t, company.userId);
    const client = asUser(t, relationship.clientId);
    const draft = await client.mutation(api.projects.index.initializeDraft, {});
    const forgedDocument = { storageId: image.storageId, uploadToken: "arbitrary", fileName: "document.pdf" };
    await expect(client.mutation(api.projects.index.saveFiles, { projectId: draft.projectId, imageUploadTokens: [],
      documents: [forgedDocument],
    })).rejects.toThrow();
    const messageIntent = await owner.mutation(api.messages.attachments.generateAttachmentUploadUrl, {
      conversationId: relationship.conversationId, fileName: "quote.pdf", contentType: "application/pdf", size: png.length,
    });
    await expect(owner.action(api.messages.attachments.sendMessageWithAttachment, { conversationId: relationship.conversationId,
      body: "Attached quote", clientMessageId: "logo-reuse", uploadToken: messageIntent.uploadToken, storageId: image.storageId,
    })).rejects.toThrow("PRIVATE_COMPANY_LOGO_FILE");
    await expect(owner.mutation(api.messages.attachments.discardAttachmentUpload, { conversationId: relationship.conversationId,
      uploadToken: messageIntent.uploadToken, storageId: image.storageId,
    })).rejects.toThrow("PRIVATE_COMPANY_LOGO_FILE");
    const finalQuote = await client.mutation(api.finalQuotes.index.request, { conversationId: relationship.conversationId });
    const forgedPdf = { storageId: image.storageId, uploadToken: "arbitrary", fileName: "quote.pdf" };
    await expect(owner.mutation(api.finalQuotes.index.submitRevision, { conversationId: relationship.conversationId,
      price: 100000, duration: 30, plannedStartDate: "2099-01-01", validUntil: "2099-02-01", scope: "Full construction and finishing work.",
      inclusions: "Materials and labour", exclusions: "Municipal fees", paymentTerms: "Monthly milestones",
      pdf: forgedPdf,
    })).rejects.toThrow();
    const ids = await t.run(async ctx => {
      const messageId = await ctx.db.insert("messages", { conversationId: relationship.conversationId, senderUserId: company.userId,
        senderType: "company", body: "A legacy attachment", createdAt: 1 });
      const attachmentId = await ctx.db.insert("messageAttachments", { messageId, conversationId: relationship.conversationId, uploadedByUserId: company.userId,
        storageId: image.storageId, originalFileName: "legacy.pdf", mimeType: "application/pdf", kind: "pdf", sizeBytes: png.length, createdAt: 1 });
      const revisionId = await ctx.db.insert("finalQuoteRevisions", { finalQuoteId: finalQuote.finalQuoteId, revisionNumber: 1,
        price: 100000, currency: "MAD", duration: 30, plannedStartDate: "2099-01-01", validUntil: "2099-02-01", scope: "Complete renovation",
        inclusions: "Materials", exclusions: "Fees", paymentTerms: "Monthly milestones", submittedByUserId: company.userId,
        pdfStorageId: image.storageId, pdfFileName: "legacy.pdf", pdfSize: png.length, submittedAt: 1, createdAt: 1 });
      return { attachmentId, revisionId };
    });
    expect((await client.fetch(`/messages/attachments/${ids.attachmentId}`)).status).toBe(404);
    expect((await client.fetch(`/final-quotes/pdf/${ids.revisionId}`)).status).toBe(404);
    expect(await t.run(async ctx => (await ctx.storage.get(image.storageId)) !== null)).toBe(true);
  });

  test("a changed storage hash or cross-Company approved reference is never publicly served", async () => {
    const { t, company, admin, image } = await fixture();
    await t.run(ctx => ctx.db.patch(image._id, { sha256: "forged-hash" }));
    await expect(asUser(t, admin.userId).mutation(logoApi.approve, { imageId: image._id, expectedSha256: "forged-hash" })).rejects.toThrow("COMPANY_LOGO_NOT_FOUND");
    await t.run(ctx => ctx.db.patch(image._id, { sha256: image.sha256 }));
    await approve(t, admin.userId, image);
    const other = await seed(t);
    await t.run(ctx => ctx.db.patch(company.companyId, { approvedLogoImageId: undefined }));
    await t.run(ctx => ctx.db.patch(other.companyId, { approvedLogoImageId: image._id }));
    expect((await t.fetch(publicPath(image._id))).status).toBe(404);
    const otherProfile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: (await t.run(ctx => ctx.db.get(other.companyId)))!.slug! });
    expect(otherProfile?.logoUrl).toBeNull();
    expect((await asUser(t, other.userId).fetch(privatePath(image._id))).status).toBe(404);
  });
});
