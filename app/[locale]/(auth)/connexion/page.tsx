import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.signIn, "signIn");
}

export default async function SignInPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const tBrand = await getTranslations("brand");

  return <SignInForm brandName={tBrand("name")} />;
}
