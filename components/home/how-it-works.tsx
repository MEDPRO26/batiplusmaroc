"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

type Audience = "hiring" | "findingWork";
type CardKey = "0" | "1" | "2";

const cards: Record<
  Audience,
  ReadonlyArray<{
    key: CardKey;
    href: AppRoute;
    image: string;
  }>
> = {
  hiring: [
    { key: "0", href: routes.postProject, image: "/images/how-it-works/how-it-works-hiring-01.png" },
    { key: "1", href: routes.companies, image: "/images/how-it-works/how-it-works-hiring-02.png" },
    { key: "2", href: routes.postProject, image: "/images/how-it-works/how-it-works-hiring-03.png" },
  ],
  findingWork: [
    { key: "0", href: routes.signUp, image: "/images/how-it-works/how-it-works-work-01.png" },
    { key: "1", href: routes.browseProjects, image: "/images/how-it-works/how-it-works-work-02.png" },
    { key: "2", href: routes.signUp, image: "/images/how-it-works/how-it-works-work-03.png" },
  ],
};

export function HowItWorks() {
  const t = useTranslations("home.howItWorks");
  const [audience, setAudience] = useState<Audience>("hiring");
  const namespace = audience === "hiring" ? "hiringCards" : "findingWorkCards";

  return (
    <section
      aria-labelledby="how-it-works-title"
      className="bg-white py-16 sm:py-22 lg:py-30"
      id="comment-ca-marche"
    >
      <div className="mx-auto w-[calc(100%-48px)] max-w-[1280px] sm:w-[calc(100%-64px)] lg:w-[calc(100%-80px)]">
        <div className="flex flex-col items-start justify-between gap-6 sm:gap-8 lg:flex-row lg:items-center">
          <h2
            className="mb-0 max-w-[16ch] text-[clamp(1.85rem,4.4vw,3.15rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink!"
            id="how-it-works-title"
          >
            {t("title")}
          </h2>

          <div
            aria-label={t("audienceLabel")}
            className="how-it-works-audience flex w-full max-w-full shrink-0 rounded-full border border-brand-border bg-white p-1 sm:w-fit"
            role="radiogroup"
          >
            {(["hiring", "findingWork"] as const).map((value) => {
              const selected = audience === value;

              return (
                <button
                  aria-checked={selected}
                  className={joinClassNames(
                    "min-h-11 flex-1 cursor-pointer appearance-none rounded-full px-4 py-2 text-[0.88rem] font-medium tracking-[-0.015em] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] sm:min-h-12 sm:flex-none sm:px-5",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96]",
                  )}
                  key={value}
                  onClick={() => setAudience(value)}
                  role="radio"
                  type="button"
                >
                  {t(value)}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="mt-12 grid list-none grid-cols-1 gap-10 p-0 sm:mt-14 sm:grid-cols-2 sm:gap-8 lg:mt-16 lg:grid-cols-3 lg:gap-10">
          {cards[audience].map((card) => (
            <li className="how-it-works-card" key={`${audience}-${card.key}`}>
              <article className="flex h-full flex-col">
                <div className="relative aspect-4/3 overflow-hidden rounded-md outline outline-1 outline-black/10">
                  <Image
                    alt={t(`${namespace}.${card.key}.imageAlt`)}
                    className="object-cover"
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                    src={card.image}
                  />
                </div>

                <h3 className="mt-4  mb-0  pt-3 pb-1 text-[1.15rem] leading-snug font-semibold tracking-[-0.03em] text-ink sm:mt-5  sm:pt-4 sm:text-[1.25rem]">
                  {t(`${namespace}.${card.key}.title`)}
                </h3>

                <div className="how-it-works-reveal">
                  <div className="pt-2 pb-1 s">
                    <p className="mt-0 mb-5 max-w-[36ch] text-[0.95rem] leading-6 text-muted">
                      {t(`${namespace}.${card.key}.body`)}
                    </p>
                    <Link
                      className="how-it-works-cta inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-[0.9rem] font-semibold transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-brand-hover active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      href={card.href}
                    >
                      {t(`${namespace}.${card.key}.cta`)}
                    </Link>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
