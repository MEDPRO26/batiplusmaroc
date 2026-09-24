/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  createPresignedPutUrl,
  headPublicMediaObject,
  readPublicMediaBytes,
} from "./storage/r2Client";

const modules = import.meta.glob("./**/*.ts");

vi.mock("./storage/r2Client", () => ({
  createPresignedPutUrl: vi.fn(async () => "https://upload.example.test/presigned"),
  headPublicMediaObject: vi.fn(async () => ({
    ContentType: "image/png",
    ContentLength: 24,
    ETag: '"seo-test-etag"',
  })),
  readPublicMediaBytes: vi.fn(async () => pngBytes(1200, 630)),
  deletePublicMediaObject: vi.fn(async () => undefined),
}));

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "batiplus-test";
  process.env.R2_ENDPOINT = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
});

beforeEach(() => {
  vi.mocked(createPresignedPutUrl).mockResolvedValue("https://upload.example.test/presigned");
  vi.mocked(headPublicMediaObject).mockResolvedValue({
    ContentType: "image/png",
    ContentLength: 24,
    ETag: '"seo-test-etag"',
    $metadata: {},
  });
  vi.mocked(readPublicMediaBytes).mockResolvedValue(pngBytes(1200, 630));
});

type TestBackend = ReturnType<typeof convexTest>;

function pngBytes(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

async function seedUser(
  t: TestBackend,
  accountType: "client" | "company" | "admin" | "seo_team",
) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${accountType}-${crypto.randomUUID()}@example.test`,
    accountType,
    countryCode: "MA",
    onboardingStatus: "completed",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function seedMedia(t: TestBackend, uploadedBy: Id<"users">) {
  return await t.run((ctx) => ctx.db.insert("seoMedia", {
    objectKey: `seo/media/${crypto.randomUUID()}.png`,
    filename: "old-image.png",
    mimeType: "image/png",
    width: 800,
    height: 600,
    size: 24,
    uploadedBy,
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

describe("SEO Media R2 upload boundary", () => {
  test("allows only the exact seo_team role to request an upload", async () => {
    const args = { fileName: "chantier.png", contentType: "image/png", size: 24 };
    const anonymous = convexTest(schema, modules);
    await expect(anonymous.action(api.seo.media.requestSeoMediaUpload, args))
      .rejects.toThrow("NOT_AUTHENTICATED");

    for (const role of ["client", "company", "admin"] as const) {
      const t = convexTest(schema, modules);
      await expect(asUser(t, await seedUser(t, role)).action(
        api.seo.media.requestSeoMediaUpload,
        args,
      )).rejects.toThrow("SEO_TEAM_REQUIRED");
    }

    const t = convexTest(schema, modules);
    await expect(asUser(t, await seedUser(t, "seo_team")).action(
      api.seo.media.requestSeoMediaUpload,
      args,
    )).resolves.toMatchObject({
      uploadUrl: "https://upload.example.test/presigned",
      uploadToken: expect.any(String),
    });
  });

  test("rejects unsupported MIME types and oversized files before signing", async () => {
    const t = convexTest(schema, modules);
    const seo = asUser(t, await seedUser(t, "seo_team"));

    await expect(seo.action(api.seo.media.requestSeoMediaUpload, {
      fileName: "notes.txt",
      contentType: "text/plain",
      size: 24,
    })).rejects.toThrow("INVALID_SEO_MEDIA");
    await expect(seo.action(api.seo.media.requestSeoMediaUpload, {
      fileName: "large.png",
      contentType: "image/png",
      size: 10 * 1024 * 1024 + 1,
    })).rejects.toThrow("INVALID_SEO_MEDIA");
  });

  test("does not let a non-SEO identity verify another user's upload intent", async () => {
    const t = convexTest(schema, modules);
    const seo = asUser(t, await seedUser(t, "seo_team"));
    const admin = asUser(t, await seedUser(t, "admin"));
    const intent = await seo.action(api.seo.media.requestSeoMediaUpload, {
      fileName: "secured.png", contentType: "image/png", size: 24,
    });
    await expect(admin.action(api.seo.media.verifySeoMediaUpload, {
      uploadToken: intent.uploadToken,
    })).rejects.toThrow("SEO_TEAM_REQUIRED");
  });

  test("HEAD and signature verification create server-derived media metadata", async () => {
    const t = convexTest(schema, modules);
    const seoId = await seedUser(t, "seo_team");
    const seo = asUser(t, seoId);
    const intent = await seo.action(api.seo.media.requestSeoMediaUpload, {
      fileName: "../../chantier principal.png",
      contentType: "image/png",
      size: 24,
    });
    const mediaId = await seo.action(api.seo.media.verifySeoMediaUpload, {
      uploadToken: intent.uploadToken,
    });
    const media = await t.run((ctx) => ctx.db.get(mediaId));
    const auditEvents = await t.run((ctx) => ctx.db.query("seoAuditEvents")
      .withIndex("by_entityType_and_entityId_and_occurredAt", (q) =>
        q.eq("entityType", "media").eq("entityId", mediaId),
      ).collect());

    expect(media).toMatchObject({
      filename: "..-..-chantier principal.png",
      mimeType: "image/png",
      size: 24,
      width: 1200,
      height: 630,
      uploadedBy: seoId,
      status: "active",
      etag: '"seo-test-etag"',
    });
    expect(media?.objectKey).toMatch(/^seo\/media\/[0-9a-f-]+\.png$/);
    expect(auditEvents.some((event) => event.action === "media.uploaded")).toBe(true);
  });

  test("rejects an uploaded object whose verified metadata or signature does not match", async () => {
    const t = convexTest(schema, modules);
    const seo = asUser(t, await seedUser(t, "seo_team"));
    const first = await seo.action(api.seo.media.requestSeoMediaUpload, {
      fileName: "wrong-size.png", contentType: "image/png", size: 24,
    });
    vi.mocked(headPublicMediaObject).mockResolvedValueOnce({
      ContentType: "image/png", ContentLength: 25,
      $metadata: {},
    });
    await expect(seo.action(api.seo.media.verifySeoMediaUpload, {
      uploadToken: first.uploadToken,
    })).rejects.toThrow("INVALID_SEO_MEDIA_UPLOAD");

    const second = await seo.action(api.seo.media.requestSeoMediaUpload, {
      fileName: "wrong-signature.png", contentType: "image/png", size: 24,
    });
    vi.mocked(readPublicMediaBytes).mockResolvedValueOnce(new Uint8Array(24));
    await expect(seo.action(api.seo.media.verifySeoMediaUpload, {
      uploadToken: second.uploadToken,
    })).rejects.toThrow("INVALID_SEO_MEDIA_UPLOAD");
  });

  test("replacement archives the original and atomically migrates every reference", async () => {
    const t = convexTest(schema, modules);
    const seoId = await seedUser(t, "seo_team");
    const seo = asUser(t, seoId);
    const oldMediaId = await seedMedia(t, seoId);
    await seo.mutation(api.seo.content.upsertMediaMetadata, {
      mediaId: oldMediaId,
      locale: "fr",
      altText: "Chantier de maison",
      caption: "Travaux en cours",
    });
    const { articleId, pageId } = await t.run(async (ctx) => {
      const now = Date.now();
      const articleId = await ctx.db.insert("seoArticles", {
        title: "Guide chantier", slug: "guide-chantier", excerpt: "Guide pratique",
        content: `![Chantier](media:${oldMediaId})`, locale: "fr", category: "construction",
        authorId: seoId,
        primaryKeyword: "chantier", secondaryKeywords: [], searchIntent: "informational",
        seoTitle: "Guide chantier", metaDescription: "Guide chantier au Maroc",
        robots: "index,follow", featuredMediaId: oldMediaId, ogMediaId: oldMediaId,
        status: "draft", createdBy: seoId, updatedBy: seoId, createdAt: now, updatedAt: now,
      });
      await ctx.db.insert("seoArticleMedia", { articleId, mediaId: oldMediaId, createdAt: now });
      const pageId = await ctx.db.insert("seoPageMetadata", {
        pageKey: "homepage", locale: "fr", seoTitle: "Accueil Batiplus",
        metaDescription: "Trouvez une entreprise de construction.", robots: "index,follow",
        ogMediaId: oldMediaId, createdBy: seoId, updatedBy: seoId, createdAt: now, updatedAt: now,
      });
      return { articleId, pageId };
    });

    const intent = await seo.action(api.seo.media.requestSeoMediaUpload, {
      fileName: "new-image.png", contentType: "image/png", size: 24,
      replacesMediaId: oldMediaId,
    });
    const newMediaId = await seo.action(api.seo.media.verifySeoMediaUpload, {
      uploadToken: intent.uploadToken,
    });
    const state = await t.run(async (ctx) => ({
      oldMedia: await ctx.db.get(oldMediaId),
      newMedia: await ctx.db.get(newMediaId),
      article: await ctx.db.get(articleId),
      page: await ctx.db.get(pageId),
      relation: await ctx.db.query("seoArticleMedia")
        .withIndex("by_articleId", (q) => q.eq("articleId", articleId)).unique(),
      metadata: await ctx.db.query("seoMediaMetadata")
        .withIndex("by_mediaId_and_locale", (q) => q.eq("mediaId", newMediaId).eq("locale", "fr")).unique(),
      replacementEvents: await ctx.db.query("seoAuditEvents")
        .withIndex("by_entityType_and_entityId_and_occurredAt", (q) =>
          q.eq("entityType", "media").eq("entityId", oldMediaId),
        ).collect(),
    }));

    expect(state.oldMedia).toMatchObject({ status: "archived", replacedByMediaId: newMediaId });
    expect(state.newMedia).toMatchObject({ status: "active", replacesMediaId: oldMediaId });
    expect(state.article).toMatchObject({ featuredMediaId: newMediaId, ogMediaId: newMediaId });
    expect(state.article?.content).toContain(`media:${newMediaId}`);
    expect(state.page?.ogMediaId).toBe(newMediaId);
    expect(state.relation?.mediaId).toBe(newMediaId);
    expect(state.metadata).toMatchObject({ altText: "Chantier de maison", caption: "Travaux en cours" });
    expect(state.replacementEvents.some((event) => event.action === "media.replaced")).toBe(true);
  });
});
