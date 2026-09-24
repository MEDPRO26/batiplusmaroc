import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";
import { outfit } from "@/components/shared/outfit";

const advantages: ReadonlyArray<{
  key: "0" | "1" | "2" | "3";
  number: string;
  href: AppRoute;
  image: string;
}> = [
  { key: "0", number: "01", href: routes.postProject, image: "/images/how-it-works/how-it-works-hiring-01.png" },
  { key: "1", number: "02", href: routes.companies, image: "/images/how-it-works/how-it-works-hiring-02.png" },
  { key: "2", number: "03", href: routes.companies, image: "/images/how-it-works/how-it-works-hiring-03.png" },
  { key: "3", number: "04", href: routes.postProject, image: "/images/how-it-works/how-it-works-work-03.png" },
];

export async function TrustStrip() {
  const t = await getTranslations("home.trust");

  return (
    <section
      aria-labelledby="advantages-title"
      className={`${outfit.className} bg-white py-16 text-start sm:py-22 lg:py-30`}
    >
      <div className="mx-auto w-full max-w-7xl px-4 text-start sm:w-[calc(100%-64px)] sm:px-0 lg:w-[calc(100%-80px)]">
        <header className="max-w-160 text-start">
          <p className="mb-3 text-start text-[0.8rem] font-medium tracking-[-0.01em] text-brand">{t("eyebrow")}</p>
          <h2
            className="mb-0 text-start text-[clamp(1.85rem,4.4vw,3.15rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink!"
            id="advantages-title"
          >
            {t("title")}
          </h2>
          <p className="mt-4 max-w-136 text-start text-[1rem] leading-7 text-muted sm:mt-5 sm:text-[1.05rem] sm:leading-7">
            {t("description")}
          </p>
        </header>

        <ul className="mt-12 grid list-none grid-cols-1 gap-8 p-0 text-start sm:mt-14 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:mt-16 lg:grid-cols-4 lg:gap-8">
          {advantages.map((advantage) => (
            <li className="how-it-works-card text-start" key={advantage.key}>
              <Link
                className="group flex h-full flex-col items-start rounded-md text-start focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                href={advantage.href}
              >
                <div className="relative aspect-4/3 w-full overflow-hidden rounded-md outline-1 outline-black/10">
                  <Image
                    alt={t(`items.${advantage.key}.alt`)}
                    className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.03]"
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
                    src={advantage.image}
                  />
                </div>
                <p className="mt-5 mb-0 px-1 text-start text-[0.75rem] font-semibold tracking-[0.08em] text-brand">
                  {advantage.number}
                </p>
                <h3 className="mt-1.5 mb-0 px-1 text-start text-[1.15rem] leading-snug font-semibold tracking-[-0.03em] text-ink sm:text-[1.25rem]">
                  {t(`items.${advantage.key}.title`)}
                </h3>
                <p className="mt-2 mb-0 px-1 text-start text-[0.92rem] leading-6 text-muted">{t(`items.${advantage.key}.text`)}</p>
                <div className="how-it-works-reveal w-full text-start">
                  <p className="mt-3 mb-0 px-1 text-start text-[0.88rem] font-medium text-brand">{t("cardCta")}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex justify-center sm:mt-14">
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-[0.92rem] font-semibold text-white! transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-brand-hover hover:text-white! active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            href={routes.postProject}
          >
            {t("cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
