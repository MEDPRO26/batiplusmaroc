"use client";

import { useTranslations } from "next-intl";
import { SiteHeader } from "@/components/layout/site-header";

export default function CompanyCommissionsError({ reset }: { reset: () => void }) {
  const t = useTranslations("companyCommissions");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] w-[calc(100%-36px)] max-w-[760px] items-center justify-center py-12 text-center">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-ink">{t("error.title")}</h1>
          <p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("error.lead")}</p>
          <button className="mt-6 min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white" onClick={reset} type="button">
            {t("error.retry")}
          </button>
        </div>
      </main>
    </>
  );
}
