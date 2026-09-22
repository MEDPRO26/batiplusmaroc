import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { CompanyDashboard } from "@/features/companies/components/company-dashboard";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyDashboard, "companyDashboard");
}

export default async function CompanyDashboardPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <CompanyDashboard />
    </>
  );
}
