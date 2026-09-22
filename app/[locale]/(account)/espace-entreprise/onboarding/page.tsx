import { setRequestLocale } from "next-intl/server";
import { CompanyOnboardingForm } from "@/features/companies/components/company-onboarding-form";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyOnboarding, "companyOnboarding");
}

export default async function CompanyOnboardingPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <CompanyOnboardingForm />;
}
