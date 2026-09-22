import { setRequestLocale } from "next-intl/server";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.signUpCompany, "signUpCompany");
}

export default async function CompanySignUpPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <SignUpForm role="company" />;
}
