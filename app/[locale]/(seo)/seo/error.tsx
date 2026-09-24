"use client";

import { useTranslations } from "next-intl";
import { SEO_PRESS } from "@/features/seo/components/seo-workspace-shell";

export default function SeoError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("seoCms.errorState");
  return <div className="mx-auto grid min-h-[60dvh] w-full max-w-xl place-items-center text-center"><div><h1 className="text-2xl font-semibold">{t("title")}</h1><p className="mt-2 text-sm leading-6 text-[#626970]">{t("description")}</p><button className={`mt-6 inline-flex min-h-11 items-center rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white ${SEO_PRESS}`} onClick={reset} type="button">{t("retry")}</button></div></div>;
}
