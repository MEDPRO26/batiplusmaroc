import { ConvexError, v } from "convex/values";

export const seoLocaleValidator = v.union(v.literal("fr"), v.literal("en"));
export const seoSearchIntentValidator = v.union(
  v.literal("informational"), v.literal("commercial"), v.literal("transactional"),
  v.literal("navigational"), v.literal("local"),
);
export const seoRobotsValidator = v.union(
  v.literal("index,follow"), v.literal("noindex,follow"),
  v.literal("index,nofollow"), v.literal("noindex,nofollow"),
);
export const seoArticleStatusValidator = v.union(
  v.literal("draft"), v.literal("review"), v.literal("published"), v.literal("archived"),
);
export const seoPillarStatusValidator = v.union(
  v.literal("planned"), v.literal("active"), v.literal("archived"),
);
export const seoClusterStatusValidator = v.union(
  v.literal("planned"), v.literal("briefed"), v.literal("writing"),
  v.literal("published"), v.literal("archived"),
);
export const seoBriefStatusValidator = v.union(
  v.literal("draft"), v.literal("ready"), v.literal("converted"), v.literal("archived"),
);

export type SeoLocale = "fr" | "en";

export function requiredText(value: string, min: number, max: number, code = "INVALID_SEO_INPUT") {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < min || normalized.length > max) throw new ConvexError(code);
  return normalized;
}

export function bodyText(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length < 1 || normalized.length > 500_000) throw new ConvexError("INVALID_SEO_CONTENT");
  articleMediaReferences(normalized);
  return normalized;
}

export function articleMediaReferences(content: string) {
  const references: string[] = [];
  const imagePattern = /!\[[^\]\n]{0,300}\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/g;
  for (const match of content.matchAll(imagePattern)) {
    const target = match[1];
    if (!target?.startsWith("media:") || target.length <= "media:".length) {
      throw new ConvexError("INVALID_SEO_CONTENT_MEDIA");
    }
    references.push(target.slice("media:".length));
  }
  if ((content.match(/!\[/g) ?? []).length !== references.length) {
    throw new ConvexError("INVALID_SEO_CONTENT_MEDIA");
  }
  return [...new Set(references)];
}

export function optionalText(value: string | undefined, max: number) {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized.length > max) throw new ConvexError("INVALID_SEO_INPUT");
  return normalized;
}

export function slug(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new ConvexError("INVALID_SEO_SLUG");
  }
  return normalized;
}

export function pageKey(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 160 || !/^[a-z0-9]+(?:[a-z0-9:-]*[a-z0-9])?$/.test(normalized)) {
    throw new ConvexError("INVALID_SEO_PAGE_KEY");
  }
  return normalized;
}

export function keywordList(values: string[], limit = 30) {
  if (values.length > limit) throw new ConvexError("INVALID_SEO_INPUT");
  const normalized = values.map((value) => requiredText(value, 1, 120));
  if (new Set(normalized.map((value) => value.toLocaleLowerCase())).size !== normalized.length) {
    throw new ConvexError("INVALID_SEO_INPUT");
  }
  return normalized;
}

export function canonicalUrl(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { throw new ConvexError("INVALID_SEO_CANONICAL"); }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash ||
    !["batiplusmaroc.com", "www.batiplusmaroc.com"].includes(parsed.hostname.toLowerCase())
  ) throw new ConvexError("INVALID_SEO_CANONICAL");
  return parsed.toString();
}

export function publicUrl(value: string) {
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { throw new ConvexError("INVALID_SEO_URL"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ConvexError("INVALID_SEO_URL");
  }
  return parsed.toString();
}
