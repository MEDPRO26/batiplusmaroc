import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 bg-[#f5f8fa]" id="contenu">
        <section className="relative isolate flex w-full items-center overflow-hidden px-[18px] py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div aria-hidden className="absolute inset-0 -z-10 opacity-55 [background-image:linear-gradient(#dce4e9_1px,transparent_1px),linear-gradient(90deg,#dce4e9_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

          <div className="mx-auto grid w-full max-w-[1180px] items-center gap-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-20">
            <div className="relative min-h-[240px] overflow-hidden rounded-[28px] bg-brand-dark p-7 text-white shadow-[0_28px_80px_rgb(23_61_99_/_0.18)] sm:min-h-[340px] sm:p-10 lg:min-h-[430px]">
              <div aria-hidden className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgb(255_255_255_/_0.28)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/_0.28)_1px,transparent_1px)] [background-size:36px_36px]" />
              <div aria-hidden className="absolute -right-16 -bottom-24 size-72 rounded-full border border-white/15 sm:size-96" />
              <div aria-hidden className="absolute -right-4 -bottom-16 size-48 rounded-full border border-white/15 sm:size-64" />

              <div className="relative flex min-h-[190px] flex-col justify-between sm:min-h-[260px] lg:min-h-[350px]">
                <p className="m-0 text-[0.68rem] font-bold tracking-[0.2em] text-white/65 uppercase">{t("kicker")}</p>
                <div className="flex items-end justify-between gap-6">
                  <h1 className="m-0 text-[clamp(6.5rem,22vw,12.5rem)] leading-[0.72] font-bold tracking-[-0.08em] text-white! select-none">404</h1>
                  <BlueprintMark />
                </div>
              </div>
            </div>

            <div className="max-w-[660px] lg:py-8">
              <p className="eyebrow">{t("eyebrow")}</p>
              <h2 className="max-w-[620px] text-[clamp(2.35rem,5vw,4.4rem)] leading-[0.98] tracking-[-0.05em]">{t("title")}</h2>
              <p className="mt-6 max-w-[570px] text-[1rem] leading-7 text-muted sm:text-[1.08rem] sm:leading-8">{t("description")}</p>

              <nav aria-label={t("actionsLabel")} className="mt-9 flex flex-wrap gap-3">
                <Link className="button button-primary active:scale-[0.96]" href={routes.home}>
                  {t("home")} <span aria-hidden="true">→</span>
                </Link>
                <Link className="button border border-brand-border bg-white text-ink shadow-[0_8px_24px_rgb(23_61_99_/_0.06)] transition-[border-color,color,transform] duration-200 hover:border-brand hover:text-brand active:scale-[0.96]" href={routes.companies}>
                  {t("browseCompanies")}
                </Link>
              </nav>

              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 border-t border-brand-border pt-6 text-sm font-semibold text-brand">
                <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={routes.services}>{t("services")}</Link>
                <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={routes.projects}>{t("projects")}</Link>
                <Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={routes.contact}>{t("contact")}</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function BlueprintMark() {
  return (
    <svg aria-hidden="true" className="mb-1 hidden h-20 w-24 shrink-0 text-white/65 sm:block lg:h-24 lg:w-28" fill="none" viewBox="0 0 112 96">
      <path d="M8 86V38l48-28 48 28v48" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="M27 86V49h58v37M47 86V61h19v25M8 38h96" stroke="currentColor" strokeWidth="2" />
      <path d="M1 86h110" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}
