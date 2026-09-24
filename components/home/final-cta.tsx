import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";
import { outfit } from "@/components/shared/outfit";

const cards = [
  {
    key: "hire",
    href: routes.companies,
    image: "/images/how-it-works/how-it-works-hiring-02.png",
  },
  {
    key: "work",
    href: routes.browseProjects,
    image: "/images/how-it-works/how-it-works-work-01.png",
  },
] as const;

export async function FinalCta() {
  const t = await getTranslations("home.finalCta");

  return (
    <section
      aria-labelledby="final-cta-title"
      className={`${outfit.className} bg-white py-16 text-start sm:py-22 lg:py-30`}
    >
      <div className="mx-auto w-[calc(100%-36px)] max-w-7xl sm:w-[calc(100%-64px)] lg:w-[calc(100%-80px)]">
        <h2
          className="mb-8 max-w-160 text-[clamp(1.85rem,4.4vw,3.15rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink! sm:mb-10"
          id="final-cta-title"
        >
          {t("title")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          {cards.map((card) => (
            <article
              className="flex flex-col gap-5 rounded-lg bg-surface-muted p-4 sm:flex-row sm:items-center sm:gap-7 sm:p-6"
              key={card.key}
            >
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-md outline-1 outline-black/10 sm:aspect-square sm:h-[168px] sm:w-[168px] sm:shrink-0">
                <Image
                  alt={t(`${card.key}.imageAlt`)}
                  className="object-cover"
                  fill
                  sizes="(max-width: 639px) 100vw, 168px"
                  src={card.image}
                />
              </div>
              <div className="min-w-0">
                <h3 className="mb-5 text-[1.35rem] leading-snug font-semibold tracking-[-0.035em] text-ink sm:text-[1.55rem]">
                  {t(`${card.key}.title`)}
                </h3>
                <CtaLink href={card.href}>{t(`${card.key}.cta`)}</CtaLink>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaLink({ children, href }: { children: string; href: AppRoute }) {
  return (
    <Link
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-[0.88rem] font-semibold text-white! transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-brand-hover hover:text-white! active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      href={href}
    >
      {children}
    </Link>
  );
}
