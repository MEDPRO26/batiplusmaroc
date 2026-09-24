import { setRequestLocale } from "next-intl/server";
import { CompanyDirectory } from "@/features/companies/components/company-directory";
import { managedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

export async function generateMetadata({ params }: Props) {
  return managedPageMetadata(params, routes.companies, "companies", "companies-directory");
}

export default async function CompaniesPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const query = (await searchParams).q;
  const initialSearch = (Array.isArray(query) ? query[0] : query)?.trim().slice(0, 120) ?? "";
  setRequestLocale(locale);
  return <CompanyDirectory initialSearch={initialSearch} key={initialSearch} />;
}
