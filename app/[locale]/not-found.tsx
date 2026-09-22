import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <section className="relative isolate flex min-h-[70vh] overflow-hidden bg-[#edf3f7] px-[18px] py-16 sm:px-6 md:py-24 lg:px-8 lg:py-28">
      <div className="mx-auto grid w-full max-w-[1280px] items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="relative border-l-2 border-[#e7b63f] pl-5 sm:pl-8">
          <p className="mb-6 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">{t("kicker")}</p>
          <h1 className="m-0 text-[clamp(6.5rem,22vw,15rem)] leading-[0.72] font-bold tracking-[-0.08em] text-[#173d63]! select-none">404</h1>
        </div>
        <div className="max-w-[660px] lg:py-8">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 className="max-w-[620px] text-[clamp(2.15rem,5vw,4.3rem)] leading-[0.98]">{t("title")}</h2>
          <p className="mt-6 max-w-[570px] text-[1.02rem] leading-7 text-muted sm:text-[1.1rem] sm:leading-8">{t("description")}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link className="button button-primary" href={routes.home}>
              {t("home")} <span aria-hidden="true">→</span>
            </Link>
            <Link className="button border border-brand-border bg-white text-ink shadow-[0_8px_24px_rgb(23_61_99_/_0.06)] hover:border-brand hover:text-brand" href={routes.contact}>
              {t("contact")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
