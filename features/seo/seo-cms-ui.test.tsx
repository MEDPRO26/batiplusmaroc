import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({ queryResult: [] as unknown }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("convex/react", () => ({
  useQuery: () => convex.queryResult,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signOut: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string } }) => (
    <a href={typeof href === "string" ? href : href.pathname} {...props}>{children}</a>
  ),
  getPathname: ({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`,
  usePathname: () => "/seo/articles",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { SeoArticleEditor, ArticlePreview } from "./components/seo-article-editor";
import { SeoArticlesList } from "./components/seo-articles-list";
import { SeoMediaLibrary } from "./components/seo-media-library";
import { SeoPagesManager } from "./components/seo-pages-manager";
import { SeoWorkspaceShell } from "./components/seo-workspace-shell";

function provider(locale: "en" | "fr", children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      {children}
    </NextIntlClientProvider>
  );
}

describe("SEO CMS interface", () => {
  beforeEach(() => { convex.queryResult = []; });

  test.each([
    ["en", "SEO workspace", "Dashboard", "Articles", "Media", "Pages", "Pillars", "Clusters", "SEO Briefs"],
    ["fr", "Espace SEO", "Tableau de bord", "Articles", "Médias", "Pages", "Piliers", "Clusters", "Briefs SEO"],
  ] as const)("renders the %s workspace shell navigation", (locale, workspace, ...labels) => {
    const html = renderToStaticMarkup(provider(locale, <SeoWorkspaceShell email="seo@example.test" firstName="Sara" lastName="SEO"><div>content</div></SeoWorkspaceShell>));
    expect(html).toContain(workspace);
    for (const label of labels) expect(html).toContain(label);
    expect(html).toContain("lg:hidden");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("seo@example.test");
  });

  test("renders populated desktop and mobile article lists", () => {
    convex.queryResult = [{
      articleId: "article-1" as Id<"seoArticles">,
      title: "Construction maison au Maroc",
      slug: "construction-maison-maroc",
      locale: "fr",
      status: "draft",
      primaryKeyword: "construction maison",
      updatedAt: 1790000000000,
      publishedAt: null,
    }];
    const html = renderToStaticMarkup(provider("en", <SeoArticlesList />));
    expect(html).toContain("Construction maison au Maroc");
    expect(html).toContain("construction-maison-maroc");
    expect(html).toContain("Primary keyword");
    expect(html).toContain("md:hidden");
    expect(html).toContain("md:block");
    expect(html).toContain("<table");
    expect(html).toContain("<article");
  });

  test.each([
    ["en", "Create article", "Main content", "Primary keyword", "Save draft", "Article formatting", "Choose featured image"],
    ["fr", "Créer un article", "Contenu principal", "Mot-clé principal", "Enregistrer le brouillon", "Mise en forme de l’article", "Choisir l’image à la une"],
  ] as const)("renders the complete %s article form", (locale, ...labels) => {
    convex.queryResult = [];
    const html = renderToStaticMarkup(provider(locale, <SeoArticleEditor />));
    for (const label of labels) expect(html).toContain(label);
    expect(html).toContain("seo-article-form");
    expect(html).toContain("textarea");
  });

  test.each([
    ["en", "Media Library", "Upload image", "Search by filename", "Active images"],
    ["fr", "Médiathèque", "Importer une image", "Rechercher par nom de fichier", "Images actives"],
  ] as const)("renders the responsive %s Media Library", (locale, ...labels) => {
    convex.queryResult = [];
    const html = renderToStaticMarkup(provider(locale, <SeoMediaLibrary />));
    for (const label of labels) expect(html).toContain(label);
    expect(html).toContain("accept=\"image/jpeg,image/png,image/webp\"");
  });

  test.each([
    ["en", "Page metadata", "Homepage", "Companies directory", "Missing metadata only"],
    ["fr", "Métadonnées des pages", "Page d’accueil", "Annuaire des entreprises", "Métadonnées manquantes uniquement"],
  ] as const)("renders the approved %s page registry", (locale, ...labels) => {
    convex.queryResult = [
      { pageKey: "homepage", nameKey: "homepage", path: `/${locale}`, locale, critical: true, seoTitleReady: false, metaDescriptionReady: false, canonicalUrl: null, robots: null, updatedAt: null },
      { pageKey: "companies-directory", nameKey: "companiesDirectory", path: `/${locale}/companies`, locale, critical: false, seoTitleReady: false, metaDescriptionReady: false, canonicalUrl: null, robots: null, updatedAt: null },
    ];
    const html = renderToStaticMarkup(provider(locale, <SeoPagesManager />));
    for (const label of labels) expect(html).toContain(label);
    expect(html).toContain("<table");
    expect(html).toContain("md:hidden");
  });

  test("renders draft content only inside the protected preview component", () => {
    const html = renderToStaticMarkup(provider("en", <ArticlePreview form={{
      title: "Private draft", slug: "private-draft", excerpt: "Draft excerpt", content: "## Draft heading\n\nPrivate body",
      locale: "en", category: "Guides", primaryKeyword: "private", secondaryKeywords: "",
      searchIntent: "informational", seoTitle: "Private draft", metaDescription: "Private draft description for testing.",
      canonicalUrl: "", robots: "noindex,nofollow", ogTitle: "", ogDescription: "", pillarId: "", clusterId: "",
      featuredMediaId: "", ogMediaId: "",
    }} onClose={() => {}} />));
    expect(html).toContain("Protected internal preview");
    expect(html).toContain("Private draft");
    expect(html).toContain("Draft heading");
    expect(html).toContain("Private body");
  });
});
