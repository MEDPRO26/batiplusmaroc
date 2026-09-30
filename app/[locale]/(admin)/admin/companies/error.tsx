"use client";

import { useTranslations } from "next-intl";
import { ADMIN_PRESS } from "@/features/admin/components/admin-shell";

export default function AdminCompaniesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("adminCompanies");
  return <section className="mx-4 rounded-[20px] border border-red-100 bg-white p-6 sm:mx-6 lg:mx-8"><h1 className="text-xl font-semibold">{t("error.title")}</h1><p className="mt-2 text-sm text-[#626970]">{t("error.lead")}</p><button className={`mt-5 min-h-11 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white ${ADMIN_PRESS}`} onClick={reset} type="button">{t("error.retry")}</button></section>;
}
