import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminVerificationPanel } from "@/features/admin/components/admin-verification-panel";
import { resolveLocale } from "@/lib/page-meta";

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

  return <AdminVerificationPanel />;
}
