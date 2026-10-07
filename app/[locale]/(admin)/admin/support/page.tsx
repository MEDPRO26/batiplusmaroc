import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminSupportPanel } from "@/features/client-support/components/admin-support-panel";
import { resolveLocale } from "@/lib/page-meta";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ projectId?: string | string[] }>;
};

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "clientSupport.admin" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function AdminSupportPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const requested = (await searchParams).projectId;
  setRequestLocale(locale);

  return <AdminSupportPanel initialProjectId={typeof requested === "string" && requested ? requested : null} />;
}
