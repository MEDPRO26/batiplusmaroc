"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function AdminSettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("adminSettings");

  useEffect(() => {
    console.error("Admin settings route failed", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] px-4">
      <section className="w-full max-w-md rounded-[20px] border border-[#e7eaee] bg-white p-6 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <h1 className="text-xl font-semibold text-[#17191d]">{t("errorTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-[#626970]">{t("backendError")}</p>
        <button
          className="mt-5 min-h-11 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.96]"
          onClick={reset}
          type="button"
        >
          {t("retry")}
        </button>
      </section>
    </main>
  );
}
