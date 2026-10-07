import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { ClientWork, type ClientWorkTab } from "@/features/clients/components/client-work";
import { resolveLocale } from "@/lib/page-meta";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "clientWork" });
  return { title: t("metaTitle"), description: t("metaDescription"), robots: { index: false, follow: false } };
}

export default async function ClientWorkPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const initialTab: ClientWorkTab = (await searchParams).tab === "contracts" ? "contracts" : "projects";
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <ClientWork initialTab={initialTab} />
    </>
  );
}
