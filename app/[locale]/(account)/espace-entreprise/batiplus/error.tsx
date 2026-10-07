"use client";

import { useTranslations } from "next-intl";
import { SiteHeader } from "@/components/layout/site-header";

export default function CompanyBatiplusError({ reset }: { reset: () => void }) {
  const t = useTranslations("operationalMessaging.access");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] w-[calc(100%-32px)] max-w-[760px] items-center justify-center py-12 text-center">
        <div role="alert">
          <h1 className="m-0 text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("lead")}</p>
          <button className="mt-6 min-h-11 rounded-sm bg-brand px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand" onClick={reset} type="button">{t("retry")}</button>
        </div>
      </main>
    </>
  );
}
