import { setRequestLocale } from "next-intl/server";
import { CompanyDirectory } from "@/features/companies/components/company-directory";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companies, "companies");
}

export default async function CompaniesPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <CompanyDirectory />;
}
