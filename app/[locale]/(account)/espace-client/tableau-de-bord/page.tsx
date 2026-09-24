import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { ClientDashboard } from "@/features/clients/components/client-dashboard";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.clientDashboard, "clientDashboard");
}

export default async function ClientDashboardPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <ClientDashboard />
    </>
  );
}
