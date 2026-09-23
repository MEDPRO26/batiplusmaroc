import { getTranslations } from "next-intl/server";

export default async function SeoDashboardPage() {
  const t = await getTranslations("seoAccess");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16 sm:px-8">
      <div className="rounded-2xl border border-[#e6e9ee] bg-white p-6 shadow-[0_12px_36px_rgb(16_24_40/0.06)] sm:p-9">
        <p className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">{t("eyebrow")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">{t("title")}</h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted">{t("description")}</p>
      </div>
    </section>
  );
}
