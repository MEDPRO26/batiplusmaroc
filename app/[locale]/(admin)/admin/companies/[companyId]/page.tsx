import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminCompanyDetailPanel, type AdminCompanyTab } from "@/features/admin/components/admin-company-detail-panel";
import { resolveLocale } from "@/lib/page-meta";

type Props = {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

const TABS = new Set<AdminCompanyTab>(["overview", "verification", "projectsDeals", "commissions", "reviews", "activity", "messages"]);

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "adminCompanies" });
  return { title: t("detail.metaTitle"), description: t("detail.metaDescription"), robots: { index: false, follow: false } };
}

export default async function AdminCompanyPage({ params, searchParams }: Props) {
  const resolved = await params;
  const locale = await resolveLocale(Promise.resolve(resolved));
  const requestedTab = (await searchParams).tab;
  const initialTab = typeof requestedTab === "string" && TABS.has(requestedTab as AdminCompanyTab)
    ? requestedTab as AdminCompanyTab
    : "overview";
  setRequestLocale(locale);
  return <AdminCompanyDetailPanel companyId={resolved.companyId as Id<"companies">} initialTab={initialTab} />;
}
