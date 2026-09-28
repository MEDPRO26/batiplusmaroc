import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import {
  CompanySettings,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/features/companies/components/profile/company-settings";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
};

export function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.companySettings, "companySettings");
}

export default async function CompanySettingsPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const requested = (await searchParams).section;
  const section = SETTINGS_SECTIONS.find((item) => item === requested) ?? ("profile" satisfies SettingsSection);
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <CompanySettings section={section} />
    </>
  );
}
