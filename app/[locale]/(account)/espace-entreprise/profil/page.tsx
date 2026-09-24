import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { CompanyProfileEditor } from "@/features/companies/components/company-profile-editor";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyProfileManagement, "companyProfileManagement");
}

export default async function CompanyProfileManagementPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <CompanyProfileEditor />
    </>
  );
}
