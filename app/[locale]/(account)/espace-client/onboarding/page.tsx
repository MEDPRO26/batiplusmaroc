import { setRequestLocale } from "next-intl/server";
import { ClientOnboardingForm } from "@/features/clients/components/client-onboarding-form";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.clientOnboarding, "clientOnboarding");
}

export default async function ClientOnboardingPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <ClientOnboardingForm />;
}
