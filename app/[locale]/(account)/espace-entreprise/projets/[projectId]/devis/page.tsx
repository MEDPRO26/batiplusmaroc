import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { CompanyInitialQuoteWorkspace } from "@/features/quotes/components/company-initial-quote-workspace";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string; projectId: string }> };

export default async function CompanyInitialQuotePage({ params }: Props) {
  const { projectId } = await params;
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <><SiteHeader /><CompanyInitialQuoteWorkspace projectId={projectId} /></>;
}
