import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { CompanyProposals } from "@/features/proposals/components/company-proposals";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyProposals, "companyProposals");
}

export default async function CompanyProposalsPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <CompanyProposals />
    </>
  );
}
