import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { CompanyProjectDetails } from "@/features/projects/components/company-project-details";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string; projectId: string }> };

export default async function CompanyProjectPage({ params }: Props) {
  const { projectId } = await params;
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <><SiteHeader /><CompanyProjectDetails projectId={projectId} /></>;
}
