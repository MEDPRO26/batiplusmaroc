import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { ClientSupportPage } from "@/features/client-support/components/client-support-page";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string; projectId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "clientSupport" });
  return { title: t("metaTitle"), description: t("metaDescription"), robots: { index: false, follow: false } };
}

export default async function ClientProjectSupportPage({ params }: Props) {
  const { projectId } = await params;
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <><SiteHeader /><ClientSupportPage projectId={projectId} /></>;
}
