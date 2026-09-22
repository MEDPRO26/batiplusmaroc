"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { getPathname, usePathname } from "@/i18n/navigation";

function useLocaleHref(nextLocale: "fr" | "en") {
  const pathname = usePathname();
  const params = useParams();
  const rest = { ...params };
  delete rest.locale;
  const href = Object.keys(rest).length > 0 ? { pathname, params: rest } : pathname;
  const localized = getPathname({ href: href as never, locale: nextLocale });
  return localized.endsWith("/") ? localized : `${localized}/`;
}

export function LanguageSwitcher({ inverted = false }: { inverted?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("language");
  const frHref = useLocaleHref("fr");
  const enHref = useLocaleHref("en");
  const muted = inverted ? "text-white/70 hover:text-white" : "text-ink/45 hover:text-ink";
  const active = inverted ? "text-white" : "text-ink";

  return (
    <nav aria-label={t("label")} className="inline-flex shrink-0 items-center gap-1.5 text-[0.78rem] font-semibold tracking-[0.04em]">
      <a
        aria-current={locale === "fr" ? "true" : undefined}
        className={`transition-colors duration-150 ${locale === "fr" ? active : muted}`}
        href={frHref}
      >
        {t("fr")}
      </a>
      <span aria-hidden="true" className={inverted ? "text-white/35" : "text-ink/25"}>
        |
      </span>
      <a
        aria-current={locale === "en" ? "true" : undefined}
        className={`transition-colors duration-150 ${locale === "en" ? active : muted}`}
        href={enHref}
      >
        {t("en")}
      </a>
    </nav>
  );
}
