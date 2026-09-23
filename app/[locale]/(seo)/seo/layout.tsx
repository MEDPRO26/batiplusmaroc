import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { seoAccessRedirect } from "@/features/seo/lib/access";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Omit<Props, "children">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "seoAccess" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function SeoLayout({ children, params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);

  const token = await convexAuthNextjsToken();
  if (!token) redirect({ href: routes.signIn, locale });

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  const destination = seoAccessRedirect(user);
  if (destination) redirect({ href: destination, locale });

  // Authoritative backend boundary. Future SEO functions must each enforce the
  // same requireSeoTeamUser guard independently.
  await fetchQuery(api.seo.index.getSeoSession, {}, { token });

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[#f4f6f8]">
      <main className="flex min-h-dvh flex-1 flex-col" id="contenu">
        {children}
      </main>
    </div>
  );
}
