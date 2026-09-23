import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { ClientProfileEditor } from "@/features/clients/components/client-profile-editor";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.clientProfile, "clientProfile");
}

export default async function ClientProfilePage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <ClientProfileEditor />
    </>
  );
}
