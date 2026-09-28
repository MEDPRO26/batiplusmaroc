import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { CompanyWork } from "@/features/deals/components/company-work";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
};

export function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyWork, "companyWork");
}

export default async function CompanyWorkPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const view = (await searchParams).view === "history" ? "history" : "active";
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <CompanyWork view={view} />
    </>
  );
}
