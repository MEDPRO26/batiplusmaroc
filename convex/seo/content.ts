import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import schema from "../schema";
import { getPublicMediaUrl } from "../storage/publicUrl";
import { requireSeoTeamUser } from "./access";
import { audit, ensureBriefArticleStrategyCoherent, ensureCanonicalAvailable, requireActiveArticleContentMedia, requireActiveMedia, requireLocaleReference, syncArticleContentMedia } from "./model";
import { requireApprovedPage, SEO_PAGE_REGISTRY } from "./pageRegistry";
import {
  bodyText, canonicalUrl, keywordList, optionalText, pageKey, publicUrl, requiredText, slug,
  seoArticleStatusValidator, seoBriefStatusValidator, seoClusterStatusValidator,
  seoLocaleValidator, seoPillarStatusValidator, seoRobotsValidator, seoSearchIntentValidator,
} from "./validators";

const nullableId = <T extends Parameters<typeof v.id>[0]>(table: T) => v.union(v.id(table), v.null());

export const listPillars = query({
  args: { locale: seoLocaleValidator, status: v.optional(seoPillarStatusValidator), limit: v.optional(v.number()) },
  returns: v.array(schema.doc("seoPillars")),
  handler: async (ctx, args) => {
    await requireSeoTeamUser(ctx);
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100);
    return args.status
      ? await ctx.db.query("seoPillars").withIndex("by_locale_and_status", (q) => q.eq("locale", args.locale).eq("status", args.status!)).order("desc").take(limit)
      : await ctx.db.query("seoPillars").withIndex("by_locale_and_slug", (q) => q.eq("locale", args.locale)).take(limit);
  },
});

export const createPillar = mutation({
  args: { title: v.string(), slug: v.string(), description: v.string(), primaryKeyword: v.string(), searchIntent: seoSearchIntentValidator, locale: seoLocaleValidator, targetUrl: v.optional(v.string()) },
  returns: v.id("seoPillars"),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const normalizedSlug = slug(args.slug);
    if (await ctx.db.query("seoPillars").withIndex("by_locale_and_slug", (q) => q.eq("locale", args.locale).eq("slug", normalizedSlug)).unique()) throw new ConvexError("SEO_PILLAR_SLUG_CONFLICT");
    const now = Date.now(); const id = await ctx.db.insert("seoPillars", {
      title: requiredText(args.title, 2, 160), slug: normalizedSlug,
      description: requiredText(args.description, 1, 2_000), primaryKeyword: requiredText(args.primaryKeyword, 1, 120),
      searchIntent: args.searchIntent, locale: args.locale, status: "planned",
      targetUrl: args.targetUrl ? publicUrl(args.targetUrl) : undefined,
      createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now,
    });
    await audit(ctx, actor._id, "pillar", id, "pillar.created", ["title", "slug", "locale", "status"]); return id;
  },
});

export const updatePillar = mutation({
  args: { pillarId: v.id("seoPillars"), title: v.string(), slug: v.string(), description: v.string(), primaryKeyword: v.string(), searchIntent: seoSearchIntentValidator, targetUrl: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const pillar = await ctx.db.get(args.pillarId);
    if (!pillar) throw new ConvexError("SEO_PILLAR_NOT_FOUND"); const normalizedSlug = slug(args.slug);
    const conflict = await ctx.db.query("seoPillars").withIndex("by_locale_and_slug", (q) => q.eq("locale", pillar.locale).eq("slug", normalizedSlug)).unique();
    if (conflict && conflict._id !== pillar._id) throw new ConvexError("SEO_PILLAR_SLUG_CONFLICT");
    await ctx.db.patch(pillar._id, { title: requiredText(args.title, 2, 160), slug: normalizedSlug, description: requiredText(args.description, 1, 2_000), primaryKeyword: requiredText(args.primaryKeyword, 1, 120), searchIntent: args.searchIntent, targetUrl: args.targetUrl ? publicUrl(args.targetUrl) : undefined, updatedBy: actor._id, updatedAt: Date.now() });
    await audit(ctx, actor._id, "pillar", pillar._id, "pillar.changed", ["title", "slug", "description", "primaryKeyword", "searchIntent", "targetUrl"]); return null;
  },
});

export const setPillarStatus = mutation({
  args: { pillarId: v.id("seoPillars"), status: seoPillarStatusValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const item = await ctx.db.get(args.pillarId); if (!item) throw new ConvexError("SEO_PILLAR_NOT_FOUND");
    const allowed = { planned: ["active", "archived"], active: ["planned", "archived"], archived: ["planned"] } as const;
    if (item.status !== args.status && !(allowed[item.status] as readonly string[]).includes(args.status)) throw new ConvexError("INVALID_SEO_STATUS_TRANSITION");
    if (item.status !== args.status) { await ctx.db.patch(item._id, { status: args.status, archivedAt: args.status === "archived" ? Date.now() : undefined, updatedBy: actor._id, updatedAt: Date.now() }); await audit(ctx, actor._id, "pillar", item._id, "pillar.status_changed", ["status"], { before: item.status, after: args.status }); }
    return null;
  },
});

export const createCluster = mutation({
  args: { pillarId: v.id("seoPillars"), topic: v.string(), primaryKeyword: v.string(), secondaryKeywords: v.array(v.string()), searchIntent: seoSearchIntentValidator, locale: seoLocaleValidator, targetPageKey: v.optional(v.string()), priority: v.number() },
  returns: v.id("seoClusters"),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); await requireLocaleReference(ctx, "seoPillars", args.pillarId, args.locale);
    if (!Number.isInteger(args.priority) || args.priority < 0 || args.priority > 100) throw new ConvexError("INVALID_SEO_PRIORITY"); const now = Date.now();
    const id = await ctx.db.insert("seoClusters", { pillarId: args.pillarId, topic: requiredText(args.topic, 2, 180), primaryKeyword: requiredText(args.primaryKeyword, 1, 120), secondaryKeywords: keywordList(args.secondaryKeywords), searchIntent: args.searchIntent, locale: args.locale, targetPageKey: args.targetPageKey ? pageKey(args.targetPageKey) : undefined, status: "planned", priority: args.priority, createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now });
    await audit(ctx, actor._id, "cluster", id, "cluster.created", ["pillarId", "topic", "locale", "status"]); return id;
  },
});

export const updateCluster = mutation({
  args: { clusterId: v.id("seoClusters"), pillarId: v.id("seoPillars"), topic: v.string(), primaryKeyword: v.string(), secondaryKeywords: v.array(v.string()), searchIntent: seoSearchIntentValidator, targetArticleId: nullableId("seoArticles"), targetPageKey: v.union(v.string(), v.null()), priority: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const item = await ctx.db.get(args.clusterId); if (!item) throw new ConvexError("SEO_CLUSTER_NOT_FOUND");
    await requireLocaleReference(ctx, "seoPillars", args.pillarId, item.locale); await requireLocaleReference(ctx, "seoArticles", args.targetArticleId ?? undefined, item.locale);
    if (!Number.isInteger(args.priority) || args.priority < 0 || args.priority > 100) throw new ConvexError("INVALID_SEO_PRIORITY");
    await ctx.db.patch(item._id, { pillarId: args.pillarId, topic: requiredText(args.topic, 2, 180), primaryKeyword: requiredText(args.primaryKeyword, 1, 120), secondaryKeywords: keywordList(args.secondaryKeywords), searchIntent: args.searchIntent, targetArticleId: args.targetArticleId ?? undefined, targetPageKey: args.targetPageKey ? pageKey(args.targetPageKey) : undefined, priority: args.priority, updatedBy: actor._id, updatedAt: Date.now() });
    await audit(ctx, actor._id, "cluster", item._id, "cluster.changed", ["pillarId", "topic", "keywords", "targets", "priority"]); return null;
  },
});

export const setClusterStatus = mutation({
  args: { clusterId: v.id("seoClusters"), status: seoClusterStatusValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const item = await ctx.db.get(args.clusterId); if (!item) throw new ConvexError("SEO_CLUSTER_NOT_FOUND");
    const allowed = { planned: ["briefed", "archived"], briefed: ["writing", "archived"], writing: ["published", "archived"], published: ["writing", "archived"], archived: ["planned"] } as const;
    if (item.status !== args.status && !(allowed[item.status] as readonly string[]).includes(args.status)) throw new ConvexError("INVALID_SEO_STATUS_TRANSITION");
    if (item.status !== args.status) { await ctx.db.patch(item._id, { status: args.status, archivedAt: args.status === "archived" ? Date.now() : undefined, updatedBy: actor._id, updatedAt: Date.now() }); await audit(ctx, actor._id, "cluster", item._id, "cluster.status_changed", ["status"], { before: item.status, after: args.status }); } return null;
  },
});

export const listClusters = query({ args: { pillarId: v.id("seoPillars"), limit: v.optional(v.number()) }, returns: v.array(schema.doc("seoClusters")), handler: async (ctx, args) => { await requireSeoTeamUser(ctx); return await ctx.db.query("seoClusters").withIndex("by_pillarId", (q) => q.eq("pillarId", args.pillarId)).take(Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100)); } });

export const createBrief = mutation({
  args: { locale: seoLocaleValidator, targetKeyword: v.string(), supportingKeywords: v.array(v.string()), searchIntent: seoSearchIntentValidator, targetAudience: v.string(), suggestedTitle: v.string(), suggestedH1: v.string(), outline: v.array(v.object({ level: v.union(v.literal(2), v.literal(3)), heading: v.string() })), questions: v.array(v.string()), internalLinkNotes: v.array(v.string()), externalReferences: v.array(v.string()), wordCountTarget: v.number(), cta: v.string(), notes: v.optional(v.string()), pillarId: v.optional(v.id("seoPillars")), clusterId: v.optional(v.id("seoClusters")) }, returns: v.id("seoBriefs"),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); await requireLocaleReference(ctx, "seoPillars", args.pillarId, args.locale); const cluster = await requireLocaleReference(ctx, "seoClusters", args.clusterId, args.locale);
    if (cluster && args.pillarId && cluster.pillarId !== args.pillarId) throw new ConvexError("INVALID_SEO_REFERENCE"); if (!Number.isInteger(args.wordCountTarget) || args.wordCountTarget < 300 || args.wordCountTarget > 20_000) throw new ConvexError("INVALID_SEO_WORD_COUNT"); const now = Date.now();
    if (args.outline.length > 40) throw new ConvexError("INVALID_SEO_INPUT");
    const outline = args.outline.map((item) => ({ level: item.level, heading: requiredText(item.heading, 1, 180) }));
    const id = await ctx.db.insert("seoBriefs", { locale: args.locale, targetKeyword: requiredText(args.targetKeyword, 1, 120), supportingKeywords: keywordList(args.supportingKeywords), searchIntent: args.searchIntent, targetAudience: requiredText(args.targetAudience, 2, 500), suggestedTitle: requiredText(args.suggestedTitle, 2, 180), suggestedH1: requiredText(args.suggestedH1, 2, 180), outline, questions: keywordList(args.questions, 30), internalLinkNotes: keywordList(args.internalLinkNotes, 30), externalReferences: args.externalReferences.map(publicUrl), wordCountTarget: args.wordCountTarget, cta: requiredText(args.cta, 1, 500), notes: optionalText(args.notes, 5_000), pillarId: args.pillarId, clusterId: args.clusterId, status: "draft", createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now });
    await audit(ctx, actor._id, "brief", id, "brief.created", ["locale", "keyword", "references", "status"]); return id;
  },
});

export const updateBrief = mutation({
  args: { briefId: v.id("seoBriefs"), targetKeyword: v.string(), supportingKeywords: v.array(v.string()), searchIntent: seoSearchIntentValidator, targetAudience: v.string(), suggestedTitle: v.string(), suggestedH1: v.string(), outline: v.array(v.object({ level: v.union(v.literal(2), v.literal(3)), heading: v.string() })), questions: v.array(v.string()), internalLinkNotes: v.array(v.string()), externalReferences: v.array(v.string()), wordCountTarget: v.number(), cta: v.string(), notes: v.union(v.string(), v.null()), pillarId: nullableId("seoPillars"), clusterId: nullableId("seoClusters"), articleId: nullableId("seoArticles") }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const item = await ctx.db.get(args.briefId); if (!item) throw new ConvexError("SEO_BRIEF_NOT_FOUND");
    await requireLocaleReference(ctx, "seoPillars", args.pillarId ?? undefined, item.locale); const cluster = await requireLocaleReference(ctx, "seoClusters", args.clusterId ?? undefined, item.locale); const article = await requireLocaleReference(ctx, "seoArticles", args.articleId ?? undefined, item.locale);
    if (cluster && args.pillarId && cluster.pillarId !== args.pillarId) throw new ConvexError("INVALID_SEO_REFERENCE"); if (!Number.isInteger(args.wordCountTarget) || args.wordCountTarget < 300 || args.wordCountTarget > 20_000) throw new ConvexError("INVALID_SEO_WORD_COUNT");
    if (article) {
      if (article.briefId && article.briefId !== item._id) throw new ConvexError("INVALID_SEO_REFERENCE");
      ensureBriefArticleStrategyCoherent(
        { pillarId: args.pillarId ?? undefined, clusterId: args.clusterId ?? undefined },
        article,
      );
    }
    if (args.outline.length > 40) throw new ConvexError("INVALID_SEO_INPUT");
    const outline = args.outline.map((entry) => ({ level: entry.level, heading: requiredText(entry.heading, 1, 180) }));
    const now = Date.now();
    if (item.articleId && item.articleId !== args.articleId) {
      const previousArticle = await ctx.db.get(item.articleId);
      if (previousArticle?.briefId === item._id) {
        await ctx.db.patch(previousArticle._id, { briefId: undefined, updatedBy: actor._id, updatedAt: now });
        await audit(ctx, actor._id, "article", previousArticle._id, "article.metadata_changed", ["briefId"]);
      }
    }
    if (article && article.briefId !== item._id) {
      await ctx.db.patch(article._id, { briefId: item._id, updatedBy: actor._id, updatedAt: now });
      await audit(ctx, actor._id, "article", article._id, "article.metadata_changed", ["briefId"]);
    }
    await ctx.db.patch(item._id, { targetKeyword: requiredText(args.targetKeyword, 1, 120), supportingKeywords: keywordList(args.supportingKeywords), searchIntent: args.searchIntent, targetAudience: requiredText(args.targetAudience, 2, 500), suggestedTitle: requiredText(args.suggestedTitle, 2, 180), suggestedH1: requiredText(args.suggestedH1, 2, 180), outline, questions: keywordList(args.questions, 30), internalLinkNotes: keywordList(args.internalLinkNotes, 30), externalReferences: args.externalReferences.map(publicUrl), wordCountTarget: args.wordCountTarget, cta: requiredText(args.cta, 1, 500), notes: optionalText(args.notes ?? undefined, 5_000), pillarId: args.pillarId ?? undefined, clusterId: args.clusterId ?? undefined, articleId: args.articleId ?? undefined, updatedBy: actor._id, updatedAt: now });
    await audit(ctx, actor._id, "brief", item._id, "brief.changed", ["content", "references"]); return null;
  },
});

export const setBriefStatus = mutation({
  args: { briefId: v.id("seoBriefs"), status: seoBriefStatusValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const item = await ctx.db.get(args.briefId); if (!item) throw new ConvexError("SEO_BRIEF_NOT_FOUND");
    const allowed = { draft: ["ready", "archived"], ready: ["draft", "converted", "archived"], converted: ["ready", "archived"], archived: ["draft"] } as const;
    if (item.status !== args.status && !(allowed[item.status] as readonly string[]).includes(args.status)) throw new ConvexError("INVALID_SEO_STATUS_TRANSITION");
    if (item.status !== args.status) { await ctx.db.patch(item._id, { status: args.status, archivedAt: args.status === "archived" ? Date.now() : undefined, updatedBy: actor._id, updatedAt: Date.now() }); await audit(ctx, actor._id, "brief", item._id, "brief.status_changed", ["status"], { before: item.status, after: args.status }); } return null;
  },
});

export const listBriefs = query({ args: { locale: seoLocaleValidator, status: seoBriefStatusValidator, limit: v.optional(v.number()) }, returns: v.array(schema.doc("seoBriefs")), handler: async (ctx, args) => { await requireSeoTeamUser(ctx); return await ctx.db.query("seoBriefs").withIndex("by_locale_and_status", (q) => q.eq("locale", args.locale).eq("status", args.status)).order("desc").take(Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100)); } });

export const upsertMediaMetadata = mutation({
  args: { mediaId: v.id("seoMedia"), locale: seoLocaleValidator, altText: v.string(), title: v.optional(v.string()), caption: v.optional(v.string()), description: v.optional(v.string()), seoFilename: v.optional(v.string()) }, returns: v.id("seoMediaMetadata"),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); await requireActiveMedia(ctx, args.mediaId); const existing = await ctx.db.query("seoMediaMetadata").withIndex("by_mediaId_and_locale", (q) => q.eq("mediaId", args.mediaId).eq("locale", args.locale)).unique(); const now = Date.now();
    const values = { altText: requiredText(args.altText, 1, 300), title: optionalText(args.title, 300), caption: optionalText(args.caption, 1_000), description: optionalText(args.description, 2_000), seoFilename: args.seoFilename ? slug(args.seoFilename) : undefined, updatedBy: actor._id, updatedAt: now };
    const id = existing ? (await ctx.db.patch(existing._id, values), existing._id) : await ctx.db.insert("seoMediaMetadata", { mediaId: args.mediaId, locale: args.locale, ...values, createdBy: actor._id, createdAt: now }); await audit(ctx, actor._id, "media_metadata", id, "image_metadata.changed", ["altText", "title", "caption", "description", "seoFilename"]); return id;
  },
});

export const archiveMedia = mutation({
  args: { mediaId: v.id("seoMedia") }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const media = await ctx.db.get(args.mediaId);
    if (!media) throw new ConvexError("SEO_MEDIA_NOT_FOUND");
    if (media.status === "archived") return null;
    const references = await Promise.all([
      ctx.db.query("seoArticles").withIndex("by_featuredMediaId", (q) => q.eq("featuredMediaId", media._id)).take(1),
      ctx.db.query("seoArticles").withIndex("by_ogMediaId", (q) => q.eq("ogMediaId", media._id)).take(1),
      ctx.db.query("seoPageMetadata").withIndex("by_ogMediaId", (q) => q.eq("ogMediaId", media._id)).take(1),
      ctx.db.query("seoArticleMedia").withIndex("by_mediaId", (q) => q.eq("mediaId", media._id)).take(1),
    ]);
    if (references.some((rows) => rows.length > 0)) throw new ConvexError("SEO_MEDIA_IN_USE");
    const now = Date.now();
    await ctx.db.patch(media._id, { status: "archived", archivedAt: now, updatedAt: now });
    await audit(ctx, actor._id, "media", media._id, "media.archived", ["status"], { before: media.status, after: "archived" });
    return null;
  },
});

const mediaListItemValidator = v.object({
  mediaId: v.id("seoMedia"), filename: v.string(), mimeType: v.string(),
  width: v.union(v.number(), v.null()), height: v.union(v.number(), v.null()), size: v.number(),
  status: v.union(v.literal("active"), v.literal("archived")), publicUrl: v.union(v.string(), v.null()),
  frMetadataReady: v.boolean(), enMetadataReady: v.boolean(),
  frAltText: v.union(v.string(), v.null()), enAltText: v.union(v.string(), v.null()),
  createdAt: v.number(), updatedAt: v.number(),
});

export const listMedia = query({
  args: {
    status: v.union(v.literal("active"), v.literal("archived")),
    search: v.optional(v.string()), limit: v.optional(v.number()),
  },
  returns: v.array(mediaListItemValidator),
  handler: async (ctx, args) => {
    await requireSeoTeamUser(ctx);
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 60), 1), 100);
    const rows = await ctx.db.query("seoMedia")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", args.status))
      .order("desc").take(limit);
    const search = args.search?.trim().toLocaleLowerCase();
    const filtered = rows.filter((media) => !search || media.filename.toLocaleLowerCase().includes(search));
    return await Promise.all(filtered.map(async (media) => {
      const [fr, en] = await Promise.all([
        ctx.db.query("seoMediaMetadata").withIndex("by_mediaId_and_locale", (q) => q.eq("mediaId", media._id).eq("locale", "fr")).unique(),
        ctx.db.query("seoMediaMetadata").withIndex("by_mediaId_and_locale", (q) => q.eq("mediaId", media._id).eq("locale", "en")).unique(),
      ]);
      return {
        mediaId: media._id, filename: media.filename, mimeType: media.mimeType,
        width: media.width ?? null, height: media.height ?? null, size: media.size,
        status: media.status, publicUrl: getPublicMediaUrl(media.objectKey),
        frMetadataReady: Boolean(fr?.altText), enMetadataReady: Boolean(en?.altText),
        frAltText: fr?.altText ?? null, enAltText: en?.altText ?? null,
        createdAt: media.createdAt, updatedAt: media.updatedAt,
      };
    }));
  },
});

export const getMediaDetails = query({
  args: { mediaId: v.id("seoMedia") },
  returns: v.union(v.null(), v.object({
    media: schema.doc("seoMedia"), publicUrl: v.union(v.string(), v.null()),
    fr: v.union(schema.doc("seoMediaMetadata"), v.null()),
    en: v.union(schema.doc("seoMediaMetadata"), v.null()),
    usage: v.object({ featured: v.number(), openGraph: v.number(), content: v.number(), pages: v.number() }),
  })),
  handler: async (ctx, args) => {
    await requireSeoTeamUser(ctx); const media = await ctx.db.get(args.mediaId);
    if (!media) return null;
    const [fr, en, featured, openGraph, content, pages] = await Promise.all([
      ctx.db.query("seoMediaMetadata").withIndex("by_mediaId_and_locale", (q) => q.eq("mediaId", media._id).eq("locale", "fr")).unique(),
      ctx.db.query("seoMediaMetadata").withIndex("by_mediaId_and_locale", (q) => q.eq("mediaId", media._id).eq("locale", "en")).unique(),
      ctx.db.query("seoArticles").withIndex("by_featuredMediaId", (q) => q.eq("featuredMediaId", media._id)).take(101),
      ctx.db.query("seoArticles").withIndex("by_ogMediaId", (q) => q.eq("ogMediaId", media._id)).take(101),
      ctx.db.query("seoArticleMedia").withIndex("by_mediaId", (q) => q.eq("mediaId", media._id)).take(101),
      ctx.db.query("seoPageMetadata").withIndex("by_ogMediaId", (q) => q.eq("ogMediaId", media._id)).take(101),
    ]);
    return { media, publicUrl: getPublicMediaUrl(media.objectKey), fr: fr ?? null, en: en ?? null,
      usage: { featured: featured.length, openGraph: openGraph.length, content: content.length, pages: pages.length } };
  },
});

export const upsertPageMetadata = mutation({
  args: { pageKey: v.string(), locale: seoLocaleValidator, seoTitle: v.string(), metaDescription: v.string(), canonicalUrl: v.union(v.string(), v.null()), robots: seoRobotsValidator, ogTitle: v.optional(v.string()), ogDescription: v.optional(v.string()), ogMediaId: nullableId("seoMedia"), confirmCriticalNoindex: v.optional(v.boolean()) }, returns: v.id("seoPageMetadata"),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const page = requireApprovedPage(args.pageKey); const key = page.pageKey;
    if (page.critical && args.robots.startsWith("noindex") && args.confirmCriticalNoindex !== true) throw new ConvexError("SEO_CRITICAL_NOINDEX_CONFIRMATION_REQUIRED");
    const existing = await ctx.db.query("seoPageMetadata").withIndex("by_pageKey_and_locale", (q) => q.eq("pageKey", key).eq("locale", args.locale)).unique(); const canonical = canonicalUrl(args.canonicalUrl ?? undefined); await ensureCanonicalAvailable(ctx, canonical, { pageMetadataId: existing?._id }); await requireActiveMedia(ctx, args.ogMediaId ?? undefined); const now = Date.now();
    const values = { seoTitle: requiredText(args.seoTitle, 2, 70), metaDescription: requiredText(args.metaDescription, 20, 180), canonicalUrl: canonical, robots: args.robots, ogTitle: optionalText(args.ogTitle, 100), ogDescription: optionalText(args.ogDescription, 300), ogMediaId: args.ogMediaId ?? undefined, updatedBy: actor._id, updatedAt: now };
    const id = existing ? (await ctx.db.patch(existing._id, values), existing._id) : await ctx.db.insert("seoPageMetadata", { pageKey: key, locale: args.locale, ...values, createdBy: actor._id, createdAt: now }); await audit(ctx, actor._id, "page_metadata", id, "page_metadata.changed", ["seoTitle", "metaDescription", "canonicalUrl", "robots", "openGraph"]); return id;
  },
});

export const getPageMetadata = query({ args: { pageKey: v.string(), locale: seoLocaleValidator }, returns: v.union(schema.doc("seoPageMetadata"), v.null()), handler: async (ctx, args) => { await requireSeoTeamUser(ctx); const page = requireApprovedPage(args.pageKey); return await ctx.db.query("seoPageMetadata").withIndex("by_pageKey_and_locale", (q) => q.eq("pageKey", page.pageKey).eq("locale", args.locale)).unique(); } });

export const listPageMetadata = query({
  args: {},
  returns: v.array(v.object({
    pageKey: v.string(), nameKey: v.string(), path: v.string(), locale: seoLocaleValidator,
    critical: v.boolean(), seoTitleReady: v.boolean(), metaDescriptionReady: v.boolean(),
    canonicalUrl: v.union(v.string(), v.null()), robots: v.union(seoRobotsValidator, v.null()),
    updatedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx) => {
    await requireSeoTeamUser(ctx);
    return await Promise.all(SEO_PAGE_REGISTRY.flatMap((page) => (["fr", "en"] as const).map(async (locale) => {
      const metadata = await ctx.db.query("seoPageMetadata")
        .withIndex("by_pageKey_and_locale", (q) => q.eq("pageKey", page.pageKey).eq("locale", locale)).unique();
      return {
        pageKey: page.pageKey, nameKey: page.nameKey, path: page.paths[locale], locale,
        critical: page.critical, seoTitleReady: Boolean(metadata?.seoTitle),
        metaDescriptionReady: Boolean(metadata?.metaDescription), canonicalUrl: metadata?.canonicalUrl ?? null,
        robots: metadata?.robots ?? null, updatedAt: metadata?.updatedAt ?? null,
      };
    })));
  },
});

const articleInput = {
  title: v.string(), slug: v.string(), excerpt: v.string(), content: v.string(),
  featuredMediaId: v.optional(v.id("seoMedia")), locale: seoLocaleValidator, category: v.string(),
  primaryKeyword: v.string(), secondaryKeywords: v.array(v.string()), searchIntent: seoSearchIntentValidator,
  seoTitle: v.string(), metaDescription: v.string(), canonicalUrl: v.optional(v.string()), robots: seoRobotsValidator,
  ogTitle: v.optional(v.string()), ogDescription: v.optional(v.string()), ogMediaId: v.optional(v.id("seoMedia")),
  pillarId: v.optional(v.id("seoPillars")), clusterId: v.optional(v.id("seoClusters")),
  briefId: v.optional(v.id("seoBriefs")), translationGroup: v.optional(v.string()),
};

const articleListItemValidator = v.object({
  articleId: v.id("seoArticles"),
  title: v.string(),
  slug: v.string(),
  locale: seoLocaleValidator,
  status: seoArticleStatusValidator,
  primaryKeyword: v.string(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
});

export const listArticlesForWorkspace = query({
  args: {
    locale: v.optional(seoLocaleValidator),
    status: v.optional(seoArticleStatusValidator),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(articleListItemValidator),
  handler: async (ctx, args) => {
    await requireSeoTeamUser(ctx);
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 100), 1), 100);
    const locales = args.locale ? [args.locale] : (["fr", "en"] as const);
    const statuses = args.status
      ? [args.status]
      : (["draft", "review", "published", "archived"] as const);
    const pages = await Promise.all(
      locales.flatMap((locale) =>
        statuses.map((status) =>
          ctx.db
            .query("seoArticles")
            .withIndex("by_locale_and_status", (q) => q.eq("locale", locale).eq("status", status))
            .order("desc")
            .take(limit),
        ),
      ),
    );
    const search = args.search?.trim().toLocaleLowerCase();
    return pages
      .flat()
      .filter(
        (article) =>
          !search ||
          article.title.toLocaleLowerCase().includes(search) ||
          article.slug.toLocaleLowerCase().includes(search),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((article) => ({
        articleId: article._id,
        title: article.title,
        slug: article.slug,
        locale: article.locale,
        status: article.status,
        primaryKeyword: article.primaryKeyword,
        updatedAt: article.updatedAt,
        publishedAt: article.publishedAt ?? null,
      }));
  },
});

export const getWorkspaceDashboard = query({
  args: {},
  returns: v.object({
    draftArticles: v.number(),
    reviewArticles: v.number(),
    publishedArticles: v.number(),
    missingMetadata: v.number(),
    pillars: v.number(),
    clusters: v.number(),
  }),
  handler: async (ctx) => {
    await requireSeoTeamUser(ctx);
    const articleStatuses = ["draft", "review", "published", "archived"] as const;
    const locales = ["fr", "en"] as const;
    const articlePages = await Promise.all(
      locales.flatMap((locale) =>
        articleStatuses.map((status) =>
          ctx.db
            .query("seoArticles")
            .withIndex("by_locale_and_status", (q) => q.eq("locale", locale).eq("status", status))
            .take(101),
        ),
      ),
    );
    const articles = articlePages.flat();
    const pillarPages = await Promise.all(
      locales.flatMap((locale) =>
        (["planned", "active", "archived"] as const).map((status) =>
          ctx.db
            .query("seoPillars")
            .withIndex("by_locale_and_status", (q) => q.eq("locale", locale).eq("status", status))
            .take(101),
        ),
      ),
    );
    const clusterPages = await Promise.all(
      locales.flatMap((locale) =>
        (["planned", "briefed", "writing", "published", "archived"] as const).map((status) =>
          ctx.db
            .query("seoClusters")
            .withIndex("by_locale_and_status_and_priority", (q) =>
              q.eq("locale", locale).eq("status", status),
            )
            .take(101),
        ),
      ),
    );
    return {
      draftArticles: articles.filter((article) => article.status === "draft").length,
      reviewArticles: articles.filter((article) => article.status === "review").length,
      publishedArticles: articles.filter((article) => article.status === "published").length,
      missingMetadata: articles.filter(
        (article) => !article.ogTitle || !article.ogDescription,
      ).length,
      pillars: pillarPages.flat().length,
      clusters: clusterPages.flat().length,
    };
  },
});

export const createArticle = mutation({
  args: articleInput, returns: v.id("seoArticles"),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const normalizedSlug = slug(args.slug); const content = bodyText(args.content); const contentMedia = await requireActiveArticleContentMedia(ctx, content);
    if (await ctx.db.query("seoArticles").withIndex("by_locale_and_slug", (q) => q.eq("locale", args.locale).eq("slug", normalizedSlug)).unique()) throw new ConvexError("SEO_ARTICLE_SLUG_CONFLICT");
    await requireActiveMedia(ctx, args.featuredMediaId); await requireActiveMedia(ctx, args.ogMediaId); const pillar = await requireLocaleReference(ctx, "seoPillars", args.pillarId, args.locale); const cluster = await requireLocaleReference(ctx, "seoClusters", args.clusterId, args.locale); const brief = await requireLocaleReference(ctx, "seoBriefs", args.briefId, args.locale);
    if ((cluster && pillar && cluster.pillarId !== pillar._id) || brief?.articleId) throw new ConvexError("INVALID_SEO_REFERENCE");
    if (brief) ensureBriefArticleStrategyCoherent(brief, { pillarId: args.pillarId, clusterId: args.clusterId });
    const group = optionalText(args.translationGroup, 100); if (group && await ctx.db.query("seoArticles").withIndex("by_translationGroup_and_locale", (q) => q.eq("translationGroup", group).eq("locale", args.locale)).unique()) throw new ConvexError("SEO_TRANSLATION_LOCALE_CONFLICT"); const canonical = canonicalUrl(args.canonicalUrl); await ensureCanonicalAvailable(ctx, canonical); const now = Date.now();
    const id = await ctx.db.insert("seoArticles", { title: requiredText(args.title, 2, 180), slug: normalizedSlug, excerpt: requiredText(args.excerpt, 10, 500), content, featuredMediaId: args.featuredMediaId, authorId: actor._id, locale: args.locale, category: requiredText(args.category, 1, 100), primaryKeyword: requiredText(args.primaryKeyword, 1, 120), secondaryKeywords: keywordList(args.secondaryKeywords), searchIntent: args.searchIntent, seoTitle: requiredText(args.seoTitle, 2, 70), metaDescription: requiredText(args.metaDescription, 20, 180), canonicalUrl: canonical, robots: args.robots, ogTitle: optionalText(args.ogTitle, 100), ogDescription: optionalText(args.ogDescription, 300), ogMediaId: args.ogMediaId, pillarId: args.pillarId, clusterId: args.clusterId, briefId: args.briefId, translationGroup: group, status: "draft", createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now });
    await syncArticleContentMedia(ctx, id, contentMedia);
    if (brief && !brief.articleId) await ctx.db.patch(brief._id, { articleId: id, updatedBy: actor._id, updatedAt: now }); await audit(ctx, actor._id, "article", id, "article.created", ["title", "slug", "locale", "references", "status"]); return id;
  },
});

export const updateArticle = mutation({
  args: { articleId: v.id("seoArticles"), ...articleInput, featuredMediaId: nullableId("seoMedia"), canonicalUrl: v.union(v.string(), v.null()), ogMediaId: nullableId("seoMedia"), pillarId: nullableId("seoPillars"), clusterId: nullableId("seoClusters"), briefId: nullableId("seoBriefs"), translationGroup: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const article = await ctx.db.get(args.articleId); if (!article) throw new ConvexError("SEO_ARTICLE_NOT_FOUND"); if (article.status === "archived") throw new ConvexError("SEO_ARTICLE_ARCHIVED"); if (args.locale !== article.locale) throw new ConvexError("SEO_ARTICLE_LOCALE_IMMUTABLE"); const normalizedSlug = slug(args.slug); const content = bodyText(args.content); const contentMedia = await requireActiveArticleContentMedia(ctx, content);
    const slugConflict = await ctx.db.query("seoArticles").withIndex("by_locale_and_slug", (q) => q.eq("locale", args.locale).eq("slug", normalizedSlug)).unique(); if (slugConflict && slugConflict._id !== article._id) throw new ConvexError("SEO_ARTICLE_SLUG_CONFLICT");
    await requireActiveMedia(ctx, args.featuredMediaId ?? undefined); await requireActiveMedia(ctx, args.ogMediaId ?? undefined); const pillar = await requireLocaleReference(ctx, "seoPillars", args.pillarId ?? undefined, args.locale); const cluster = await requireLocaleReference(ctx, "seoClusters", args.clusterId ?? undefined, args.locale); const brief = await requireLocaleReference(ctx, "seoBriefs", args.briefId ?? undefined, args.locale); if ((cluster && pillar && cluster.pillarId !== pillar._id) || (brief?.articleId && brief.articleId !== article._id)) throw new ConvexError("INVALID_SEO_REFERENCE");
    if (brief) ensureBriefArticleStrategyCoherent(brief, { pillarId: args.pillarId ?? undefined, clusterId: args.clusterId ?? undefined });
    const group = optionalText(args.translationGroup ?? undefined, 100); const translationConflict = group ? await ctx.db.query("seoArticles").withIndex("by_translationGroup_and_locale", (q) => q.eq("translationGroup", group).eq("locale", args.locale)).unique() : null; if (translationConflict && translationConflict._id !== article._id) throw new ConvexError("SEO_TRANSLATION_LOCALE_CONFLICT"); const canonical = canonicalUrl(args.canonicalUrl ?? undefined); await ensureCanonicalAvailable(ctx, canonical, { articleId: article._id });
    const now = Date.now();
    if (article.briefId && article.briefId !== args.briefId) { const oldBrief = await ctx.db.get(article.briefId); if (oldBrief?.articleId === article._id) await ctx.db.patch(oldBrief._id, { articleId: undefined, updatedBy: actor._id, updatedAt: now }); }
    if (brief && !brief.articleId) await ctx.db.patch(brief._id, { articleId: article._id, updatedBy: actor._id, updatedAt: now });
    await ctx.db.patch(article._id, { title: requiredText(args.title, 2, 180), slug: normalizedSlug, excerpt: requiredText(args.excerpt, 10, 500), content, featuredMediaId: args.featuredMediaId ?? undefined, category: requiredText(args.category, 1, 100), primaryKeyword: requiredText(args.primaryKeyword, 1, 120), secondaryKeywords: keywordList(args.secondaryKeywords), searchIntent: args.searchIntent, seoTitle: requiredText(args.seoTitle, 2, 70), metaDescription: requiredText(args.metaDescription, 20, 180), canonicalUrl: canonical, robots: args.robots, ogTitle: optionalText(args.ogTitle, 100), ogDescription: optionalText(args.ogDescription, 300), ogMediaId: args.ogMediaId ?? undefined, pillarId: args.pillarId ?? undefined, clusterId: args.clusterId ?? undefined, briefId: args.briefId ?? undefined, translationGroup: group, updatedBy: actor._id, updatedAt: now });
    await syncArticleContentMedia(ctx, article._id, contentMedia);
    await audit(ctx, actor._id, "article", article._id, "article.metadata_changed", ["title", "slug", "excerpt", "content", "media", "keywords", "metadata", "references"]);
    if ((article.featuredMediaId ?? null) !== args.featuredMediaId) {
      await audit(ctx, actor._id, "article", article._id, "article.featured_image_changed", ["featuredMediaId"]);
    }
    return null;
  },
});

export const setArticleStatus = mutation({
  args: { articleId: v.id("seoArticles"), status: seoArticleStatusValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUser(ctx); const item = await ctx.db.get(args.articleId); if (!item) throw new ConvexError("SEO_ARTICLE_NOT_FOUND"); const allowed = { draft: ["review", "archived"], review: ["draft", "published", "archived"], published: ["draft", "archived"], archived: ["draft"] } as const; if (item.status !== args.status && !(allowed[item.status] as readonly string[]).includes(args.status)) throw new ConvexError("INVALID_SEO_STATUS_TRANSITION");
    if (item.status !== args.status) { const now = Date.now(); const action = args.status === "review" ? "article.submitted_for_review" : args.status === "published" ? "article.published" : item.status === "published" ? "article.unpublished" : args.status === "archived" ? "article.archived" : "article.restored"; await ctx.db.patch(item._id, { status: args.status, publishedAt: args.status === "published" ? now : undefined, archivedAt: args.status === "archived" ? now : undefined, updatedBy: actor._id, updatedAt: now }); await audit(ctx, actor._id, "article", item._id, action, ["status"], { before: item.status, after: args.status }); } return null;
  },
});

export const getArticle = query({ args: { articleId: v.id("seoArticles") }, returns: v.union(schema.doc("seoArticles"), v.null()), handler: async (ctx, args) => { await requireSeoTeamUser(ctx); return await ctx.db.get(args.articleId); } });
export const listArticles = query({ args: { locale: seoLocaleValidator, status: seoArticleStatusValidator, limit: v.optional(v.number()) }, returns: v.array(schema.doc("seoArticles")), handler: async (ctx, args) => { await requireSeoTeamUser(ctx); return await ctx.db.query("seoArticles").withIndex("by_locale_and_status", (q) => q.eq("locale", args.locale).eq("status", args.status)).order("desc").take(Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100)); } });

export const addArticleLink = mutation({ args: { sourceArticleId: v.id("seoArticles"), targetArticleId: nullableId("seoArticles"), targetPageKey: v.union(v.string(), v.null()), anchorText: v.string() }, returns: v.id("seoArticleLinks"), handler: async (ctx, args) => { const actor = await requireSeoTeamUser(ctx); const source = await ctx.db.get(args.sourceArticleId); if (!source) throw new ConvexError("SEO_ARTICLE_NOT_FOUND"); if ((args.targetArticleId === null) === (args.targetPageKey === null)) throw new ConvexError("INVALID_SEO_LINK_TARGET"); if (args.targetArticleId) { const target = await ctx.db.get(args.targetArticleId); if (!target || target._id === source._id || target.locale !== source.locale) throw new ConvexError("INVALID_SEO_LINK_TARGET"); const duplicate = await ctx.db.query("seoArticleLinks").withIndex("by_sourceArticleId_and_targetArticleId", (q) => q.eq("sourceArticleId", source._id).eq("targetArticleId", target._id)).unique(); if (duplicate) throw new ConvexError("SEO_LINK_CONFLICT"); } const id = await ctx.db.insert("seoArticleLinks", { sourceArticleId: source._id, targetArticleId: args.targetArticleId ?? undefined, targetPageKey: args.targetPageKey ? pageKey(args.targetPageKey) : undefined, anchorText: requiredText(args.anchorText, 1, 200), createdBy: actor._id, createdAt: Date.now() }); await audit(ctx, actor._id, "article_link", id, "article_link.created", ["source", "target", "anchorText"]); return id; } });
export const removeArticleLink = mutation({ args: { linkId: v.id("seoArticleLinks") }, returns: v.null(), handler: async (ctx, args) => { const actor = await requireSeoTeamUser(ctx); const link = await ctx.db.get(args.linkId); if (!link) throw new ConvexError("SEO_LINK_NOT_FOUND"); await ctx.db.delete(link._id); await audit(ctx, actor._id, "article_link", link._id, "article_link.removed", ["link"]); return null; } });
export const listArticleLinks = query({ args: { sourceArticleId: v.id("seoArticles"), limit: v.optional(v.number()) }, returns: v.array(schema.doc("seoArticleLinks")), handler: async (ctx, args) => { await requireSeoTeamUser(ctx); return await ctx.db.query("seoArticleLinks").withIndex("by_sourceArticleId", (q) => q.eq("sourceArticleId", args.sourceArticleId)).take(Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100)); } });
export const listAuditEvents = query({ args: { entityType: v.union(v.literal("article"), v.literal("media"), v.literal("media_metadata"), v.literal("page_metadata"), v.literal("pillar"), v.literal("cluster"), v.literal("brief"), v.literal("article_link")), entityId: v.string(), limit: v.optional(v.number()) }, returns: v.array(schema.doc("seoAuditEvents")), handler: async (ctx, args) => { await requireSeoTeamUser(ctx); return await ctx.db.query("seoAuditEvents").withIndex("by_entityType_and_entityId_and_occurredAt", (q) => q.eq("entityType", args.entityType).eq("entityId", args.entityId)).order("desc").take(Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100)); } });
