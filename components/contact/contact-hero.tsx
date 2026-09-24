import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export async function ContactHero() {
  const t = await getTranslations("contact");
  const tNav = await getTranslations("nav");
  const tCrumbs = await getTranslations("breadcrumbs");

  return (
    <section className="relative overflow-hidden bg-[#0a2138] text-white">
      <div className="grid min-h-[540px] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative z-10 flex items-end px-[18px] pt-20 pb-24 sm:px-6 sm:pt-24 lg:justify-end lg:px-8 lg:py-28">
          <div className="w-full max-w-[760px] lg:pl-8">
            <nav className="mb-14 flex items-center gap-2 text-xs font-semibold text-white/55" aria-label={tCrumbs("label")}>
              <Link className="transition-colors hover:text-white" href={routes.home}>{tNav("home")}</Link>
              <span aria-hidden="true">/</span>
              <span className="text-white/85">{t("crumb")}</span>
            </nav>
            <p className="mb-7 text-[0.7rem] font-bold tracking-[0.2em] text-[#83cef3] uppercase">{t("eyebrow")}</p>
            <h1 className="m-0 max-w-3xl text-[clamp(3.4rem,7vw,7.3rem)] leading-[0.88] font-semibold tracking-[-0.065em] text-white!">{t("title")}</h1>
          </div>
        </div>

        <div className="relative min-h-[360px] overflow-hidden lg:min-h-full">
          <Image
            className="object-cover"
            src="/images/portfolio-2026/projects/immeuble-r5-al-huda-gros-oeuvre.webp"
            alt={t("imageAlt")}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 46vw"
          />
          <div className="absolute inset-0 bg-linear-to-r from-[#0a2138]/45 via-transparent to-transparent lg:from-[#0a2138]/25" aria-hidden="true" />
          <div className="absolute right-8 bottom-8 left-8 flex items-center justify-between border-t border-white/35 pt-4 text-[0.65rem] font-bold tracking-[0.16em] text-white uppercase">
            <span>{t("brandBadge")}</span><span>{t("locationBadge")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
