import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { AdminVerificationPanel } from "@/features/admin/components/admin-verification-panel";
import { adminAccessRedirect } from "@/features/admin/lib/access";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "adminVerification" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function AdminVerificationPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);

  const token = await convexAuthNextjsToken();
  if (!token) redirect({ href: routes.signIn, locale });

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  const destination = adminAccessRedirect(user);
  if (destination) redirect({ href: destination, locale });

  const admin = await fetchQuery(api.admin.index.getAdminSession, {}, { token });

  return (
    <AdminVerificationPanel
      email={admin.email}
      firstName={admin.firstName}
      lastName={admin.lastName}
    />
  );
}
