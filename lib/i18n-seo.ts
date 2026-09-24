import { SITE_URL } from "@/lib/seo";
import { getPathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import type { Metadata } from "next";

type AppPathname = keyof typeof routing.pathnames;

export function htmlLang(locale: AppLocale) {
  return locale === "fr" ? "fr-FR" : "en";
}

export function localizedUrl(locale: AppLocale, href: AppPathname, params?: Record<string, string>) {
  const pathname = getPathname({
    locale,
    href: params ? { pathname: href, params } : href,
  } as Parameters<typeof getPathname>[0]);
  const withSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return new URL(withSlash, SITE_URL).toString();
}

export function languageAlternates(href: AppPathname, params?: Record<string, string>) {
  return {
    "fr-FR": localizedUrl("fr", href, params),
    en: localizedUrl("en", href, params),
    "x-default": localizedUrl("fr", href, params),
  };
}

export function createLocalizedMetadata({
  locale,
  href,
  title,
  description,
  params,
}: {
  locale: AppLocale;
  href: AppPathname;
  title: string;
  description: string;
  params?: Record<string, string>;
}): Metadata {
  const canonical = localizedUrl(locale, href, params);
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: languageAlternates(href, params),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      locale: htmlLang(locale),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  };
}

export function buildWebPageJsonLd({
  locale,
  href,
  title,
  description,
  crumbs,
  params,
}: {
  locale: AppLocale;
  href: AppPathname;
  title: string;
  description: string;
  crumbs: { name: string; href?: AppPathname }[];
  params?: Record<string, string>;
}) {
  const url = localizedUrl(locale, href, params);
  const lang = htmlLang(locale);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: title,
        description,
        inLanguage: lang,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: crumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          ...(crumb.href ? { item: localizedUrl(locale, crumb.href) } : {}),
        })),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Batiplus",
        inLanguage: lang,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Batiplus",
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          inLanguage: lang,
          url: `${SITE_URL}/brand/s2mbou-logo.webp`,
          contentUrl: `${SITE_URL}/brand/s2mbou-logo.webp`,
          width: 153,
          height: 40,
          caption: "Batiplus",
        },
      },
    ],
  };
}

export type { AppPathname };
