/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestBackend = ReturnType<typeof convexTest>;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_PUBLIC_BASE_URL = "https://media.batiplusmaroc.com";
});

async function user(t: TestBackend, accountType: "client" | "company" | "admin" | "seo_team") {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${accountType}-${crypto.randomUUID()}@example.test`, accountType,
    countryCode: "MA", onboardingStatus: "completed", createdAt: 1, updatedAt: 1,
  }));
}
function as(t: TestBackend, id: Id<"users">) { return t.withIdentity({ subject: `${id}|test-session` }); }

const pillarInput = { title: "Construction maison", slug: "construction-maison", description: "Guide de construction", primaryKeyword: "construction maison", searchIntent: "informational" as const, locale: "fr" as const };
const articleInput = (overrides: Record<string, unknown> = {}) => ({
  title: "Prix construction maison", slug: "prix-construction-maison",
  excerpt: "Tout comprendre sur les prix de construction au Maroc.",
  content: "Premier paragraphe.\n\nDeuxième paragraphe.", locale: "fr" as const,
  category: "construction", primaryKeyword: "prix construction", secondaryKeywords: ["budget maison"],
  searchIntent: "informational" as const, seoTitle: "Prix construction maison au Maroc",
  metaDescription: "Découvrez les prix de construction d'une maison au Maroc et les facteurs du budget.",
  robots: "index,follow" as const, ...overrides,
});
const articleUpdateInput = (articleId: Id<"seoArticles">, overrides: Record<string, unknown> = {}) => ({
  ...articleInput(), articleId, featuredMediaId: null, canonicalUrl: null, ogMediaId: null,
  pillarId: null, clusterId: null, briefId: null, translationGroup: null, ...overrides,
});
const briefInput = (overrides: Record<string, unknown> = {}) => ({
  locale: "fr" as const, targetKeyword: "prix construction", supportingKeywords: [],
  searchIntent: "informational" as const, targetAudience: "Propriétaires marocains",
  suggestedTitle: "Prix construction", suggestedH1: "Quel prix pour construire ?",
  outline: [{ level: 2 as const, heading: "Coût au mètre carré" }], questions: [],
  internalLinkNotes: [], externalReferences: [], wordCountTarget: 1200,
  cta: "Publier votre projet", ...overrides,
});
const briefUpdateInput = (briefId: Id<"seoBriefs">, overrides: Record<string, unknown> = {}) => ({
  briefId, targetKeyword: "prix construction", supportingKeywords: [],
  searchIntent: "informational" as const, targetAudience: "Propriétaires marocains",
  suggestedTitle: "Prix construction", suggestedH1: "Quel prix pour construire ?",
  outline: [{ level: 2 as const, heading: "Coût au mètre carré" }], questions: [],
  internalLinkNotes: [], externalReferences: [], wordCountTarget: 1200,
  cta: "Publier votre projet", notes: null, pillarId: null, clusterId: null,
  articleId: null, ...overrides,
});

describe("SEO CMS authorization", () => {
  test("only seo_team can use every private CMS entry point", async () => {
    const t = convexTest(schema, modules); const seo = await user(t, "seo_team");
    await expect(as(t, seo).mutation(api.seo.content.createPillar, pillarInput)).resolves.toEqual(expect.any(String));
    await expect(t.mutation(api.seo.content.createPillar, pillarInput)).rejects.toThrow("NOT_AUTHENTICATED");
    for (const role of ["client", "company", "admin"] as const) {
      const id = await user(t, role);
      await expect(as(t, id).mutation(api.seo.content.createPillar, pillarInput)).rejects.toThrow("SEO_TEAM_REQUIRED");
      await expect(as(t, id).query(api.seo.content.listPillars, { locale: "fr" })).rejects.toThrow("SEO_TEAM_REQUIRED");
    }
  });
});

describe("SEO CMS domain model", () => {
  test("enforces slug uniqueness per locale while allowing the same slug across locales", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    await c.mutation(api.seo.content.createPillar, pillarInput);
    await expect(c.mutation(api.seo.content.createPillar, pillarInput)).rejects.toThrow("SEO_PILLAR_SLUG_CONFLICT");
    await expect(c.mutation(api.seo.content.createPillar, { ...pillarInput, locale: "en" })).resolves.toEqual(expect.any(String));
    await c.mutation(api.seo.content.createArticle, articleInput());
    await expect(c.mutation(api.seo.content.createArticle, articleInput())).rejects.toThrow("SEO_ARTICLE_SLUG_CONFLICT");
    await expect(c.mutation(api.seo.content.createArticle, articleInput({ locale: "en" }))).resolves.toEqual(expect.any(String));
  });

  test("enforces locale-consistent strategy references", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    const enPillar = await c.mutation(api.seo.content.createPillar, { ...pillarInput, locale: "en" });
    await expect(c.mutation(api.seo.content.createCluster, { pillarId: enPillar, topic: "Prix", primaryKeyword: "prix", secondaryKeywords: [], searchIntent: "informational", locale: "fr", priority: 10 })).rejects.toThrow("INVALID_SEO_REFERENCE");
    await expect(c.mutation(api.seo.content.createArticle, articleInput({ pillarId: enPillar }))).rejects.toThrow("INVALID_SEO_REFERENCE");
  });

  test("keeps translations as separate records and prevents duplicate locale membership", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    const fr = await c.mutation(api.seo.content.createArticle, articleInput({ translationGroup: "house-price-guide" }));
    const en = await c.mutation(api.seo.content.createArticle, articleInput({ locale: "en", translationGroup: "house-price-guide" }));
    expect(fr).not.toBe(en);
    await expect(c.mutation(api.seo.content.createArticle, articleInput({ slug: "autre", translationGroup: "house-price-guide" }))).rejects.toThrow("SEO_TRANSLATION_LOCALE_CONFLICT");
  });

  test("normalizes image metadata per locale and archives replaced media", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    const first = await c.mutation(api.seo.content.registerMedia, { objectKey: "seo/images/first.webp", filename: "first.webp", mimeType: "image/webp", width: 1200, height: 630, size: 5000 });
    const fr = await c.mutation(api.seo.content.upsertMediaMetadata, { mediaId: first, locale: "fr", altText: "Maison en construction" });
    const en = await c.mutation(api.seo.content.upsertMediaMetadata, { mediaId: first, locale: "en", altText: "House under construction" });
    expect(fr).not.toBe(en);
    await c.mutation(api.seo.content.registerMedia, { objectKey: "seo/images/replacement.webp", filename: "replacement.webp", mimeType: "image/webp", size: 6000, replacesMediaId: first });
    expect((await t.run((ctx) => ctx.db.get(first)))?.status).toBe("archived");
  });

  test("validates and uniquely owns Batiplus canonical URLs across articles and pages", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    await expect(c.mutation(api.seo.content.createArticle, articleInput({ canonicalUrl: "http://evil.example/post" }))).rejects.toThrow("INVALID_SEO_CANONICAL");
    await expect(c.mutation(api.seo.content.createPillar, { ...pillarInput, targetUrl: "https://user:secret@example.com/page" })).rejects.toThrow("INVALID_SEO_URL");
    await c.mutation(api.seo.content.createArticle, articleInput({ canonicalUrl: "https://batiplusmaroc.com/fr/blog/prix-construction" }));
    await expect(c.mutation(api.seo.content.upsertPageMetadata, { pageKey: "homepage", locale: "fr", seoTitle: "Batiplus Maroc accueil", metaDescription: "Trouvez les meilleurs professionnels de construction au Maroc.", canonicalUrl: "https://batiplusmaroc.com/fr/blog/prix-construction", robots: "index,follow", ogMediaId: null })).rejects.toThrow("SEO_CANONICAL_CONFLICT");
  });

  test("enforces explicit article lifecycle and public published-only DTO isolation", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    const articleId = await c.mutation(api.seo.content.createArticle, articleInput());
    await expect(t.query(api.seo.public.getPublishedArticleBySlug, { locale: "fr", slug: "prix-construction-maison" })).resolves.toBeNull();
    await expect(c.mutation(api.seo.content.setArticleStatus, { articleId, status: "published" })).rejects.toThrow("INVALID_SEO_STATUS_TRANSITION");
    await c.mutation(api.seo.content.setArticleStatus, { articleId, status: "review" });
    await c.mutation(api.seo.content.setArticleStatus, { articleId, status: "published" });
    const result = await t.query(api.seo.public.getPublishedArticleBySlug, { locale: "fr", slug: "prix-construction-maison" });
    expect(result).toMatchObject({ locale: "fr", slug: "prix-construction-maison", content: "Premier paragraphe.\n\nDeuxième paragraphe." });
    expect(result).not.toHaveProperty("articleId");
    expect(result).not.toHaveProperty("primaryKeyword"); expect(result).not.toHaveProperty("briefId"); expect(result).not.toHaveProperty("createdBy");
    await c.mutation(api.seo.content.setArticleStatus, { articleId, status: "draft" });
    await expect(t.query(api.seo.public.getPublishedArticleBySlug, { locale: "fr", slug: "prix-construction-maison" })).resolves.toBeNull();
  });

  test("uses structured brief outlines and exact lifecycle transitions", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    const briefId = await c.mutation(api.seo.content.createBrief, briefInput({ outline: [{ level: 2, heading: "Coût au mètre carré" }, { level: 3, heading: "Gros œuvre" }] }));
    await expect(c.mutation(api.seo.content.setBriefStatus, { briefId, status: "converted" })).rejects.toThrow("INVALID_SEO_STATUS_TRANSITION");
    await c.mutation(api.seo.content.setBriefStatus, { briefId, status: "ready" });
    await c.mutation(api.seo.content.setBriefStatus, { briefId, status: "converted" });
    expect((await t.run((ctx) => ctx.db.get(briefId)))?.outline).toEqual([{ level: 2, heading: "Coût au mètre carré" }, { level: 3, heading: "Gros œuvre" }]);
  });

  test("keeps brief/article association bidirectional, unique, and strategy-coherent", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    const pillarId = await c.mutation(api.seo.content.createPillar, pillarInput);
    const otherPillarId = await c.mutation(api.seo.content.createPillar, { ...pillarInput, slug: "autre-pilier" });
    const briefId = await c.mutation(api.seo.content.createBrief, briefInput({ pillarId }));
    const firstArticle = await c.mutation(api.seo.content.createArticle, articleInput({ pillarId }));
    const secondArticle = await c.mutation(api.seo.content.createArticle, articleInput({ slug: "second-article", pillarId }));

    await c.mutation(api.seo.content.updateBrief, briefUpdateInput(briefId, { pillarId, articleId: firstArticle }));
    expect((await t.run((ctx) => ctx.db.get(firstArticle)))?.briefId).toBe(briefId);
    expect((await t.run((ctx) => ctx.db.get(briefId)))?.articleId).toBe(firstArticle);

    await c.mutation(api.seo.content.updateBrief, briefUpdateInput(briefId, { pillarId, articleId: secondArticle }));
    const reassigned = await t.run(async (ctx) => ({
      first: await ctx.db.get(firstArticle), second: await ctx.db.get(secondArticle), brief: await ctx.db.get(briefId),
    }));
    expect(reassigned.first?.briefId).toBeUndefined();
    expect(reassigned.second?.briefId).toBe(briefId);
    expect(reassigned.brief?.articleId).toBe(secondArticle);

    await expect(c.mutation(api.seo.content.updateBrief, briefUpdateInput(briefId, { pillarId: otherPillarId, articleId: secondArticle }))).rejects.toThrow("INVALID_SEO_REFERENCE");
    const secondBrief = await c.mutation(api.seo.content.createBrief, briefInput({ pillarId }));
    await expect(c.mutation(api.seo.content.updateBrief, briefUpdateInput(secondBrief, { pillarId, articleId: secondArticle }))).rejects.toThrow("INVALID_SEO_REFERENCE");
  });

  test("article-side brief reassignment synchronizes both ends and rejects brief reuse", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    const firstBrief = await c.mutation(api.seo.content.createBrief, briefInput());
    const secondBrief = await c.mutation(api.seo.content.createBrief, briefInput());
    const articleId = await c.mutation(api.seo.content.createArticle, articleInput({ briefId: firstBrief }));
    await c.mutation(api.seo.content.updateArticle, articleUpdateInput(articleId, { briefId: secondBrief }));
    const state = await t.run(async (ctx) => ({ article: await ctx.db.get(articleId), first: await ctx.db.get(firstBrief), second: await ctx.db.get(secondBrief) }));
    expect(state.article?.briefId).toBe(secondBrief);
    expect(state.first?.articleId).toBeUndefined();
    expect(state.second?.articleId).toBe(articleId);
    await expect(c.mutation(api.seo.content.createArticle, articleInput({ slug: "duplicate-brief", briefId: secondBrief }))).rejects.toThrow("INVALID_SEO_REFERENCE");
  });

  test("models explicit article/page links and strategy lifecycle without inventing routes", async () => {
    const t = convexTest(schema, modules); const c = as(t, await user(t, "seo_team"));
    const pillarId = await c.mutation(api.seo.content.createPillar, pillarInput);
    const clusterId = await c.mutation(api.seo.content.createCluster, { pillarId, topic: "Prix", primaryKeyword: "prix", secondaryKeywords: [], searchIntent: "informational", locale: "fr", targetPageKey: "service:construction-maison", priority: 10 });
    await expect(c.mutation(api.seo.content.setClusterStatus, { clusterId, status: "published" })).rejects.toThrow("INVALID_SEO_STATUS_TRANSITION");
    await c.mutation(api.seo.content.setClusterStatus, { clusterId, status: "briefed" });
    await c.mutation(api.seo.content.setClusterStatus, { clusterId, status: "writing" });
    await c.mutation(api.seo.content.setClusterStatus, { clusterId, status: "published" });
    const source = await c.mutation(api.seo.content.createArticle, articleInput({ pillarId, clusterId }));
    const target = await c.mutation(api.seo.content.createArticle, articleInput({ slug: "permis-construire" }));
    await expect(c.mutation(api.seo.content.addArticleLink, { sourceArticleId: source, targetArticleId: null, targetPageKey: null, anchorText: "invalide" })).rejects.toThrow("INVALID_SEO_LINK_TARGET");
    await c.mutation(api.seo.content.addArticleLink, { sourceArticleId: source, targetArticleId: target, targetPageKey: null, anchorText: "Permis de construire" });
    await c.mutation(api.seo.content.addArticleLink, { sourceArticleId: source, targetArticleId: null, targetPageKey: "service:construction-maison", anchorText: "Construction maison" });
    expect(await c.query(api.seo.content.listArticleLinks, { sourceArticleId: source })).toHaveLength(2);

    await c.mutation(api.seo.content.upsertPageMetadata, { pageKey: "homepage", locale: "fr", seoTitle: "Batiplus Maroc accueil", metaDescription: "Trouvez les meilleurs professionnels de construction au Maroc.", canonicalUrl: null, robots: "index,follow", ogMediaId: null });
    expect(await t.query(api.seo.public.getPublicPageMetadata, { pageKey: "homepage", locale: "fr" })).toMatchObject({ seoTitle: "Batiplus Maroc accueil" });
    await expect(t.query(api.seo.public.getPublicPageMetadata, { pageKey: "homepage", locale: "en" })).resolves.toBeNull();
  });

  test("creates compact append-only audit events without article bodies", async () => {
    const t = convexTest(schema, modules); const seoId = await user(t, "seo_team"); const c = as(t, seoId);
    const articleId = await c.mutation(api.seo.content.createArticle, articleInput());
    await c.mutation(api.seo.content.setArticleStatus, { articleId, status: "review" });
    const events = await c.query(api.seo.content.listAuditEvents, { entityType: "article", entityId: articleId });
    expect(events.map((event) => event.action)).toEqual(["article.submitted_for_review", "article.created"]);
    expect(events.every((event) => event.actorId === seoId && !("content" in event))).toBe(true);
  });
});
