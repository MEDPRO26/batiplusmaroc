import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { CompanyOperationalMessaging } from "@/features/operations/components/company-operational-messaging";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "operationalMessaging" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function CompanyBatiplusPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <CompanyOperationalMessaging />
    </>
  );
}
