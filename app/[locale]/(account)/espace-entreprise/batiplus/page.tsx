import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { api } from "@/convex/_generated/api";
import { CompanyOperationalMessaging } from "@/features/operations/components/company-operational-messaging";
import { redirect } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "operationalMessaging" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function CompanyBatiplusPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const token = await convexAuthNextjsToken();
  if (!token) redirect({ href: routes.signIn, locale });

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user?.accountType) {
    redirect({ href: routes.signIn, locale });
    return null;
  }
  if (user.accountType !== "company") {
    redirect({ href: workspaceRouteForUser(user), locale });
  }

  return (
    <>
      <SiteHeader />
      <CompanyOperationalMessaging />
    </>
  );
}
