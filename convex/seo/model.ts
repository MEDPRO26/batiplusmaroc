import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { SeoLocale } from "./validators";

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
