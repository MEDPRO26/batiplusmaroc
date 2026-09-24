import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

const TERMS_SECTIONS = [
  "purpose",
  "accounts",
  "clients",
  "companies",
  "marketplace",
  "messaging",
  "deals",
  "commission",
  "content",
  "prohibited",
  "liability",
  "termination",
  "changes",
  "law",
  "contact",
] as const;

const PRIVACY_SECTIONS = [
  "who",
  "data",
  "use",
  "legalBasis",
  "sharing",
  "retention",
  "security",
  "rights",
  "cookies",
  "children",
  "changes",
  "contact",
] as const;

type LegalPage = "terms" | "privacy";

export async function LegalDocument({
  params,
  page,
}: {
  params: Promise<{ locale: string }>;
  page: LegalPage;
}) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: `legal.${page}` });
  const tLegal = await getTranslations({ locale, namespace: "legal" });
  const sections = page === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const relatedHref = page === "terms" ? routes.privacy : routes.terms;
  const relatedLabel = page === "terms" ? tLegal("privacyLink") : tLegal("termsLink");

  return (
    <article className="bg-[#f7f9fb]">
      <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
        <header className="border-b border-[#d5d9dc] pb-8">
          <p className="m-0 text-[0.7rem] font-bold tracking-[0.18em] text-brand uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 mb-0 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-ink">
            {t("title")}
          </h1>
          <p className="mt-4 mb-0 text-sm text-muted">{t("updated", { date: t("updatedDate") })}</p>
          <p className="mt-5 mb-0 text-base leading-7 text-ink/85">{t("intro")}</p>
        </header>

        <nav aria-label={t("tocLabel")} className="mt-8 rounded-2xl border border-[#d5d9dc] bg-white p-5 sm:p-6">
          <p className="m-0 text-sm font-semibold text-ink">{t("tocLabel")}</p>
          <ol className="mt-3 mb-0 grid list-decimal gap-2 pl-5 text-sm leading-6 text-brand">
            {sections.map((section) => (
              <li key={section}>
                <a className="font-medium underline-offset-2 hover:underline" href={`#${section}`}>
                  {t(`sections.${section}.title`)}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-4 space-y-0 rounded-2xl border border-[#d5d9dc] bg-white px-5 py-2 sm:px-8 sm:py-4">
          {sections.map((section) => {
            const paragraphs = t.raw(`sections.${section}.paragraphs`) as string[];
            return (
              <section className="border-b border-[#e4e8eb] py-8 last:border-b-0" id={section} key={section}>
                <h2 className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">
                  {t(`sections.${section}.title`)}
                </h2>
                <div className="mt-4 space-y-4 text-[0.95rem] leading-7 text-ink/85">
                  {paragraphs.map((paragraph) => (
                    <p className="m-0" key={paragraph.slice(0, 48)}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="mt-8 flex flex-col gap-3 border-t border-[#d5d9dc] pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">{t("footerNote")}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link className="font-semibold text-brand hover:underline" href={relatedHref}>
              {relatedLabel}
            </Link>
            <Link className="font-semibold text-brand hover:underline" href={routes.contact}>
              {tLegal("contactLink")}
            </Link>
          </div>
        </footer>
      </div>
    </article>
  );
}
