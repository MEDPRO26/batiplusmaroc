import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { PortfolioManager } from "@/features/portfolio/components/portfolio-manager";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyPortfolio, "companyPortfolio");
}

export default async function CompanyPortfolioPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <><SiteHeader /><PortfolioManager /></>;
}
