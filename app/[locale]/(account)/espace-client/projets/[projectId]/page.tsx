import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { ClientProjectDetails } from "@/features/projects/components/client-project-details";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string; projectId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "meta.clientProject" });
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

export default async function ClientProjectPage({ params }: Props) {
  const { projectId } = await params;
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <><SiteHeader /><ClientProjectDetails projectId={projectId} /></>;
}
