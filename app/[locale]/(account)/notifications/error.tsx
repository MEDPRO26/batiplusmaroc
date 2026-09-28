"use client";

import { useTranslations } from "next-intl";

export default function NotificationsError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("notifications");
  return <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold text-ink">{t("errorTitle")}</h1><p className="mt-3 text-sm text-muted">{t("error")}</p><button className="mt-6 min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={reset} type="button">{t("retry")}</button></main>;
}
