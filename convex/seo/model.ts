import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { SeoLocale } from "./validators";
import { articleMediaReferences } from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

export async function audit(
  ctx: MutationCtx,
  actorId: Id<"users">,
  entityType: "article" | "media" | "media_metadata" | "page_metadata" | "pillar" | "cluster" | "brief" | "article_link",
  entityId: string,
  action: string,
  changedFields: string[],
  status?: { before?: string; after?: string },
) {
  await ctx.db.insert("seoAuditEvents", {
    actorId, entityType, entityId, action,
    changedFields: [...new Set(changedFields)].slice(0, 40),
    beforeStatus: status?.before, afterStatus: status?.after, occurredAt: Date.now(),
  });
}

export async function requireLocaleReference<T extends "seoPillars" | "seoClusters" | "seoBriefs" | "seoArticles">(
  ctx: ReadCtx, table: T, id: Id<T> | undefined, locale: SeoLocale,
) {
  if (!id) return null;
  const doc = await ctx.db.get(table, id);
  if (!doc || doc.locale !== locale) throw new ConvexError("INVALID_SEO_REFERENCE");
  return doc;
}

export async function requireActiveMedia(ctx: ReadCtx, id: Id<"seoMedia"> | undefined) {
  if (!id) return null;
  const media = await ctx.db.get("seoMedia", id);
  if (!media || media.status !== "active") throw new ConvexError("INVALID_SEO_MEDIA_REFERENCE");
  return media;
}

export async function requireActiveArticleContentMedia(ctx: ReadCtx, content: string) {
  const ids: Id<"seoMedia">[] = [];
  for (const rawId of articleMediaReferences(content)) {
    const mediaId = ctx.db.normalizeId("seoMedia", rawId);
    if (!mediaId) throw new ConvexError("INVALID_SEO_CONTENT_MEDIA");
    await requireActiveMedia(ctx, mediaId);
    ids.push(mediaId);
  }
  return ids;
}

export async function syncArticleContentMedia(
  ctx: MutationCtx,
  articleId: Id<"seoArticles">,
  mediaIds: Id<"seoMedia">[],
) {
  const existing = await ctx.db.query("seoArticleMedia")
    .withIndex("by_articleId", (q) => q.eq("articleId", articleId)).take(101);
  if (existing.length > 100 || mediaIds.length > 100) throw new ConvexError("INVALID_SEO_CONTENT_MEDIA");
  const desired = new Set<string>(mediaIds);
  for (const row of existing) {
    if (!desired.has(row.mediaId)) await ctx.db.delete(row._id);
  }
  const current = new Set(existing.map((row) => row.mediaId as string));
  for (const mediaId of mediaIds) {
    if (!current.has(mediaId)) await ctx.db.insert("seoArticleMedia", { articleId, mediaId, createdAt: Date.now() });
  }
}

/** Optional strategy references may be absent, but may never contradict each other. */
export function ensureBriefArticleStrategyCoherent(
  brief: Pick<Doc<"seoBriefs">, "pillarId" | "clusterId">,
  article: Pick<Doc<"seoArticles">, "pillarId" | "clusterId">,
) {
  if (
    (brief.pillarId && brief.pillarId !== article.pillarId) ||
    (brief.clusterId && brief.clusterId !== article.clusterId)
  ) {
    throw new ConvexError("INVALID_SEO_REFERENCE");
  }
}

export async function ensureCanonicalAvailable(
  ctx: ReadCtx, canonicalUrl: string | undefined,
  except?: { articleId?: Id<"seoArticles">; pageMetadataId?: Id<"seoPageMetadata"> },
) {
  if (!canonicalUrl) return;
  const [article, page] = await Promise.all([
    ctx.db.query("seoArticles").withIndex("by_canonicalUrl", (q) => q.eq("canonicalUrl", canonicalUrl)).unique(),
    ctx.db.query("seoPageMetadata").withIndex("by_canonicalUrl", (q) => q.eq("canonicalUrl", canonicalUrl)).unique(),
  ]);
  if ((article && article._id !== except?.articleId) || (page && page._id !== except?.pageMetadataId)) {
    throw new ConvexError("SEO_CANONICAL_CONFLICT");
  }
}
