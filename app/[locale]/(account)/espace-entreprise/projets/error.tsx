"use client";

import { useTranslations } from "next-intl";

export default function CompanyProjectsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("companyProjects.error");
  return <main className="mx-auto flex min-h-[60vh] w-[calc(100%-36px)] max-w-[720px] items-center justify-center py-12 text-center"><div role="alert"><h1 className="m-0 text-2xl font-semibold text-ink">{t("title")}</h1><p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("lead")}</p><button className="mt-6 min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white" onClick={reset} type="button">{t("retry")}</button></div></main>;
}
