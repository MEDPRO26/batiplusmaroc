import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getPublicMediaUrl } from "../storage/publicUrl";
import { seoLocaleValidator, seoRobotsValidator } from "./validators";

const publicArticleValidator = v.object({
  title: v.string(), slug: v.string(), excerpt: v.string(),
  content: v.string(), locale: seoLocaleValidator, category: v.string(), seoTitle: v.string(),
  metaDescription: v.string(), canonicalUrl: v.union(v.string(), v.null()), robots: seoRobotsValidator,
  ogTitle: v.union(v.string(), v.null()), ogDescription: v.union(v.string(), v.null()),
  featuredImageUrl: v.union(v.string(), v.null()), ogImageUrl: v.union(v.string(), v.null()),
  featuredImageMetadata: v.union(v.null(), v.object({
    altText: v.string(), title: v.union(v.string(), v.null()),
    caption: v.union(v.string(), v.null()), description: v.union(v.string(), v.null()),
  })),
  publishedAt: v.number(), translation: v.union(v.null(), v.object({ locale: seoLocaleValidator, slug: v.string() })),
});

async function publicDto(ctx: QueryCtx, article: Doc<"seoArticles">) {
  const [featured, og, featuredMetadata] = await Promise.all([
    article.featuredMediaId ? ctx.db.get("seoMedia", article.featuredMediaId) : null,
    article.ogMediaId ? ctx.db.get("seoMedia", article.ogMediaId) : null,
    article.featuredMediaId
      ? ctx.db.query("seoMediaMetadata").withIndex("by_mediaId_and_locale", (q) => q.eq("mediaId", article.featuredMediaId!).eq("locale", article.locale)).unique()
      : null,
  ]);
  let translation: { locale: "fr" | "en"; slug: string } | null = null;
  if (article.translationGroup) {
    const otherLocale = article.locale === "fr" ? "en" : "fr";
    const other = await ctx.db.query("seoArticles").withIndex("by_translationGroup_and_locale", (q) => q.eq("translationGroup", article.translationGroup).eq("locale", otherLocale)).unique();
    if (other?.status === "published" && other.publishedAt !== undefined) translation = { locale: other.locale, slug: other.slug };
  }
  return {
    title: article.title, slug: article.slug, excerpt: article.excerpt,
    content: article.content, locale: article.locale, category: article.category, seoTitle: article.seoTitle,
    metaDescription: article.metaDescription, canonicalUrl: article.canonicalUrl ?? null, robots: article.robots,
    ogTitle: article.ogTitle ?? null, ogDescription: article.ogDescription ?? null,
    featuredImageUrl: featured?.status === "active" ? getPublicMediaUrl(featured.objectKey) : null,
    ogImageUrl: og?.status === "active" ? getPublicMediaUrl(og.objectKey) : null,
    featuredImageMetadata: featured?.status === "active" && featuredMetadata ? {
      altText: featuredMetadata.altText, title: featuredMetadata.title ?? null,
      caption: featuredMetadata.caption ?? null, description: featuredMetadata.description ?? null,
    } : null,
    publishedAt: article.publishedAt!, translation,
  };
}

export const getPublishedArticleBySlug = query({
  args: { locale: seoLocaleValidator, slug: v.string() },
  returns: v.union(publicArticleValidator, v.null()),
  handler: async (ctx, args) => {
    const article = await ctx.db.query("seoArticles").withIndex("by_locale_and_slug", (q) => q.eq("locale", args.locale).eq("slug", args.slug.trim().toLowerCase())).unique();
    if (!article || article.status !== "published" || article.publishedAt === undefined) return null;
    return await publicDto(ctx, article);
  },
});

export const getPublicPageMetadata = query({
  args: { pageKey: v.string(), locale: seoLocaleValidator },
  returns: v.union(v.null(), v.object({
    seoTitle: v.string(), metaDescription: v.string(), canonicalUrl: v.union(v.string(), v.null()),
    robots: seoRobotsValidator, ogTitle: v.union(v.string(), v.null()),
    ogDescription: v.union(v.string(), v.null()), ogImageUrl: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const key = args.pageKey.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:[a-z0-9:-]*[a-z0-9])?$/.test(key)) return null;
    const metadata = await ctx.db.query("seoPageMetadata").withIndex("by_pageKey_and_locale", (q) => q.eq("pageKey", key).eq("locale", args.locale)).unique();
    if (!metadata) return null;
    const media = metadata.ogMediaId ? await ctx.db.get("seoMedia", metadata.ogMediaId) : null;
    return { seoTitle: metadata.seoTitle, metaDescription: metadata.metaDescription,
      canonicalUrl: metadata.canonicalUrl ?? null, robots: metadata.robots,
      ogTitle: metadata.ogTitle ?? null, ogDescription: metadata.ogDescription ?? null,
      ogImageUrl: media?.status === "active" ? getPublicMediaUrl(media.objectKey) : null };
  },
});

export const listPublishedArticles = query({
  args: { locale: seoLocaleValidator, limit: v.optional(v.number()) },
  returns: v.array(publicArticleValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 50);
    const articles = await ctx.db.query("seoArticles").withIndex("by_locale_and_status", (q) => q.eq("locale", args.locale).eq("status", "published")).order("desc").take(limit);
    const valid = articles.filter((article) => article.publishedAt !== undefined);
    return await Promise.all(valid.map((article) => publicDto(ctx, article)));
  },
});
