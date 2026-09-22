import { setRequestLocale } from "next-intl/server";
import { SignUpRoleSelection } from "@/features/auth/components/sign-up-role-selection";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.signUp, "signUp");
}

export default async function SignUpPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <SignUpRoleSelection />;
}
