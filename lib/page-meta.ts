import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { routing, type AppLocale } from "@/i18n/routing";
import { createLocalizedMetadata, type AppPathname } from "@/lib/i18n-seo";
import { routes } from "@/lib/routes";

export type MetaNamespace =
  | "home"
  | "about"
  | "services"
  | "projects"
  | "contact"
  | "terms"
  | "privacy"
  | "structuralWork"
  | "finishingWork"
  | "categoryGeneral"
  | "categoryStructuralWork"
  | "constructionTrends2025"
  | "constructionBudget"
  | "constructionMaterials"
  | "helloWorld"
  | "howItWorks"
  | "companies"
  | "companyProfile"
  | "browseProjects"
  | "postProject"
  | "postProjectWizard"
  | "signIn"
  | "signUp"
  | "signUpClient"
  | "signUpCompany"
  | "clientDashboard"
  | "clientProfile"
  | "clientOnboarding"
  | "companyDashboard"
  | "companyProjects"
  | "companyCommissions"
  | "companyProfileManagement"
  | "companyOnboarding"
  | "companyVerification"
  | "companyPortfolio"
  | "messages";

export const articleMetaByRoute = {
  [routes.constructionTrends2025]: "constructionTrends2025",
  [routes.constructionBudget]: "constructionBudget",
  [routes.constructionMaterials]: "constructionMaterials",
  [routes.helloWorld]: "helloWorld",
} as const;

export async function resolveLocale(params: Promise<{ locale: string }>): Promise<AppLocale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return locale;
}

export async function localizedPageMetadata(
  params: Promise<{ locale: string }>,
  href: AppPathname,
  namespace: MetaNamespace,
  extra?: { params?: Record<string, string> },
) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: `meta.${namespace}` });
  return createLocalizedMetadata({
    locale,
    href,
    title: t("title"),
    description: t("description"),
    params: extra?.params,
  });
}

export async function managedPageMetadata(
  params: Promise<{ locale: string }>,
  href: AppPathname,
  namespace: MetaNamespace,
  pageKey: string,
) {
  const [locale, fallback] = await Promise.all([
    resolveLocale(params),
    localizedPageMetadata(params, href, namespace),
  ]);
  try {
    const managed = await fetchQuery(api.seo.public.getPublicPageMetadata, { pageKey, locale });
    if (!managed) return fallback;
    const canonical = managed.canonicalUrl ?? fallback.alternates?.canonical;
    const [index, follow] = managed.robots.split(",");
    return {
      ...fallback,
      title: managed.seoTitle,
      description: managed.metaDescription,
      alternates: { ...fallback.alternates, canonical },
      openGraph: {
        ...(fallback.openGraph ?? {}),
        title: managed.ogTitle ?? managed.seoTitle,
        description: managed.ogDescription ?? managed.metaDescription,
        url: canonical,
        ...(managed.ogImageUrl ? { images: [{ url: managed.ogImageUrl }] } : {}),
      },
      twitter: {
        ...(fallback.twitter ?? {}),
        title: managed.ogTitle ?? managed.seoTitle,
        description: managed.ogDescription ?? managed.metaDescription,
        ...(managed.ogImageUrl ? { images: [managed.ogImageUrl] } : {}),
      },
      robots: { index: index === "index", follow: follow === "follow" },
    };
  } catch (error) {
    console.error("Unable to load managed page metadata", error instanceof Error ? error.name : "UnknownError");
    return fallback;
  }
}
