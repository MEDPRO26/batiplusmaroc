import { setRequestLocale } from "next-intl/server";
import { CompanyVerificationForm } from "@/features/companies/components/company-verification-form";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyVerification, "companyVerification");
}

export default async function CompanyVerificationPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <CompanyVerificationForm />;
}
