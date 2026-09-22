import { getTranslations } from "next-intl/server";
import { CompanyDirectorySkeleton } from "@/features/companies/components/company-directory-skeleton";

export default async function CompaniesLoading() {
  const t = await getTranslations("companyDirectory");
  return <CompanyDirectorySkeleton label={t("loading")} />;
}
