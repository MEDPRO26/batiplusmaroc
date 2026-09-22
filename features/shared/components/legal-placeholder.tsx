import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveLocale } from "@/lib/page-meta";

export async function LegalPlaceholder({
  params,
  page,
}: {
  params: Promise<{ locale: string }>;
  page: "terms" | "privacy";
}) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: `legal.${page}` });

  return (
    <section className="mx-auto w-[calc(100%-36px)] max-w-3xl py-20 sm:w-[calc(100%-48px)] sm:py-24 lg:py-28">
      <p className="mb-4 text-[0.7rem] font-bold tracking-[0.18em] text-brand uppercase">
        {t("eyebrow")}
      </p>
      <h1 className="m-0 text-[clamp(2.2rem,5vw,4.2rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-ink">
        {t("title")}
      </h1>
      <div className="mt-8 space-y-5 text-base leading-7 text-muted">
        <p>{t("intro")}</p>
        <p>{t("placeholder")}</p>
      </div>
    </section>
  );
}
