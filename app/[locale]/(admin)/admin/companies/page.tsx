import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminCompaniesPanel } from "@/features/admin/components/admin-companies-panel";
import { parseCompanyFilters } from "@/features/admin/lib/company-filters";
import { resolveLocale } from "@/lib/page-meta";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "adminCompanies" });
  return { title: t("metaTitle"), description: t("metaDescription"), robots: { index: false, follow: false } };
}

export default async function AdminCompaniesPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <AdminCompaniesPanel initialFilters={parseCompanyFilters(await searchParams)} />;
}
