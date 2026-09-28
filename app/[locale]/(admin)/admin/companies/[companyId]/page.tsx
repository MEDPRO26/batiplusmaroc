import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminCompanyDetailPanel } from "@/features/admin/components/admin-company-detail-panel";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string; companyId: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "adminCompanies" });
  return { title: t("detail.metaTitle"), description: t("detail.metaDescription"), robots: { index: false, follow: false } };
}

export default async function AdminCompanyPage({ params }: Props) {
  const resolved = await params;
  const locale = await resolveLocale(Promise.resolve(resolved));
  setRequestLocale(locale);
  return <AdminCompanyDetailPanel companyId={resolved.companyId as Id<"companies">} />;
}
