import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { api } from "@/convex/_generated/api";
import { AdminPage, AdminShell } from "@/features/admin/components/admin-shell";
import { NotificationsPage } from "@/features/notifications/components/notifications-page";
import { SeoWorkspaceShell } from "@/features/seo/components/seo-workspace-shell";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "notifications" });
  return { title: t("metaTitle"), description: t("metaDescription"), robots: { index: false, follow: false } };
}

export default async function NotificationHistoryPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const token = await convexAuthNextjsToken();
  if (!token) redirect({ href: routes.signIn, locale });
  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user?.accountType) {
    redirect({ href: routes.signIn, locale });
    return null;
  }

  const content = <NotificationsPage accountType={user.accountType} />;
  if (user.accountType === "admin") {
    const t = await getTranslations({ locale, namespace: "notifications" });
    return (
      <AdminShell email={user.email} firstName={user.firstName} lastName={user.lastName}>
        <AdminPage breadcrumb={t("title")} title={t("title")}>{content}</AdminPage>
      </AdminShell>
    );
  }
  if (user.accountType === "seo_team") {
    return <SeoWorkspaceShell email={user.email} firstName={user.firstName} lastName={user.lastName}>{content}</SeoWorkspaceShell>;
  }
  return <><SiteHeader />{content}</>;
}
