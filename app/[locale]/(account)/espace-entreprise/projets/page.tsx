import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { CompanyProjectMarketplace } from "@/features/projects/components/company-project-marketplace";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

export function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyProjects, "companyProjects");
}

export default async function CompanyProjectsPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const query = (await searchParams).q;
  const initialSearch = (Array.isArray(query) ? query[0] : query)?.trim().slice(0, 120) ?? "";
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <CompanyProjectMarketplace initialSearch={initialSearch} key={initialSearch} />
    </>
  );
}
