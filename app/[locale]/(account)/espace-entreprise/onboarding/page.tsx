import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { CompanyOnboardingForm } from "@/features/companies/components/company-onboarding-form";
import { redirect } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companyOnboarding, "companyOnboarding");
}

export default async function CompanyOnboardingPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect({ href: routes.signIn, locale });
    return null;
  }

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user) {
    redirect({ href: routes.signIn, locale });
    return null;
  }
  // Unfinalized OAuth accounts still use the existing client signup-intent flow.
  if (user.accountType !== null && (user.accountType !== "company" || user.onboardingStatus === "completed")) {
    redirect({ href: workspaceRouteForUser(user), locale });
    return null;
  }
  if (user.accountType === "company") {
    const profile = await fetchQuery(api.companies.index.getOnboardingProfile, {}, { token });
    if (profile?.onboardingStatus === "completed") {
      redirect({ href: routes.companyDashboard, locale });
      return null;
    }
  }
  return <CompanyOnboardingForm />;
}
