import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminDashboard } from "@/features/admin/components/admin-dashboard";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "adminAccess" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function AdminPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);

  return <AdminDashboard />;
}
