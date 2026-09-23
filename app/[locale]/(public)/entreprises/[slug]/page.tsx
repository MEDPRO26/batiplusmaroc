import { fetchQuery } from "convex/nextjs";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { PublicCompanyProfile } from "@/features/companies/components/public-company-profile";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return localizedPageMetadata(params, "/entreprises/[slug]", "companyProfile", { params: { slug } });
}

const getCompany = cache((slug: string) =>
  fetchQuery(api.portfolio.index.getPublicCompanyProfile, { slug }),
);

export default async function CompanyProfilePage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  setRequestLocale(locale);
  const company = await getCompany(slug);
  if (!company) notFound();

  return <PublicCompanyProfile company={company} />;
}
