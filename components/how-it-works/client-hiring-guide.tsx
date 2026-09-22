import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { outfit } from "@/components/shared/outfit";
import { featuredMarketplaceCompanies } from "@/content/marketplace";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

const tradeKeys = [
  "structural",
  "finishing",
  "renovation",
  "houseConstruction",
  "electrical",
  "plumbing",
  "joinery",
  "pool",
] as const;

const stepCards = [
  { key: "0", href: routes.postProject, icon: "brief" },
  { key: "1", href: routes.companies, icon: "search" },
  { key: "2", href: "#parcours" as const, icon: "chat" },
] as const;

const flowKeys = ["0", "1", "2", "3"] as const;

const faqItems = [
  { key: "0", href: routes.postProject },
  { key: "1", href: routes.companies },
  { key: "2", href: "#parcours" as const },
  { key: "3", href: routes.companies },
  { key: "4" },
  { key: "5", href: "#parcours" as const },
] as const;

export async function ClientHiringGuide() {
  const t = await getTranslations("clientHowItWorks");
  const tCategories = await getTranslations("home.marketplace.categories");
  const tCompany = await getTranslations("home.marketplace");
  const companies = featuredMarketplaceCompanies().slice(0, 2);

  return (
    <div className={`${outfit.className} bg-white pb-20 sm:pb-28`}>
      <section className="mx-auto w-[min(1280px,calc(100%-2rem))] pt-6 sm:w-[min(1280px,calc(100%-3rem))] sm:pt-8">
        <div className="relative flex min-h-[520px] items-end overflow-hidden rounded-[28px] sm:min-h-[560px] lg:min-h-[620px] lg:items-center lg:rounded-[36px]">
          <Image
            alt={t("hero.imageAlt")}
            className="object-cover object-[center_42%]"
            fill
            priority
            sizes="(max-width: 1280px) calc(100vw - 2rem), 1280px"
            src="/images/how-it-works/how-it-works-hiring-01.png"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,24,36,0.2)_0%,rgba(12,24,36,0.88)_72%)] lg:bg-[linear-gradient(90deg,rgba(12,24,36,0.88)_0%,rgba(12,24,36,0.55)_46%,rgba(12,24,36,0.05)_100%)]"
          />
          <div className="relative z-1 w-full max-w-[38rem] px-6 py-10 motion-safe:animate-[hero-panel-in_280ms_cubic-bezier(0.23,1,0.32,1)_both] sm:px-10 sm:py-14 lg:px-14">
            <h1 className="mb-0 max-w-[14ch] text-[clamp(2.4rem,6vw,4.4rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-white!">
              {t("hero.title")}
            </h1>
            <p className="mt-5 max-w-[38ch] text-[1.02rem] leading-7 text-white/88 sm:text-[1.08rem]">
              {t("hero.lead")}
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-[0.95rem] font-semibold text-white! transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-brand-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                href={routes.postProject}
              >
                {t("hero.cta")}
              </Link>
              <Link
                className="inline-flex min-h-12 items-center text-[0.95rem] font-semibold text-white! underline decoration-white/40 underline-offset-4 transition-colors duration-200 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                href={routes.companies}
              >
                {t("hero.browse")}
              </Link>
            </div>
          </div>
        </div>

      </section>

      <section aria-labelledby="hiring-steps-title" className="mx-auto mt-20 w-[min(1280px,calc(100%-2rem))] sm:mt-28 sm:w-[min(1280px,calc(100%-3rem))]">
        <h2
          className="mb-0 max-w-[16ch] text-[clamp(1.85rem,4.2vw,3rem)] leading-[1.05] font-semibold tracking-[-0.045em] text-ink!"
          id="hiring-steps-title"
        >
          {t("steps.title")}
        </h2>
        <ol className="mt-10 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3 md:gap-5">
          {stepCards.map((card) => (
            <li key={card.key}>
              <article className="flex h-full flex-col rounded-[22px] border border-brand-border bg-white p-6 transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:border-brand/40 hover:shadow-[0_16px_40px_rgb(23_61_99/0.06)] sm:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                  <StepIcon name={card.icon} />
                </span>
                <h3 className="mt-6 mb-0 text-[1.25rem] leading-snug font-semibold tracking-[-0.03em] text-ink!">
                  {t(`steps.cards.${card.key}.title`)}
                </h3>
                <p className="mt-3 mb-0 flex-1 text-[0.98rem] leading-7 text-muted">
                  {t(`steps.cards.${card.key}.body`)}
                </p>
                <StepLink href={card.href} label={t(`steps.cards.${card.key}.cta`)} />
              </article>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="hiring-ways-title" className="mx-auto mt-20 w-[min(1280px,calc(100%-2rem))] sm:mt-28 sm:w-[min(1280px,calc(100%-3rem))]">
        <h2
          className="mb-0 text-[clamp(1.7rem,3.4vw,2.4rem)] leading-[1.12] font-semibold tracking-[-0.04em] text-ink!"
          id="hiring-ways-title"
        >
          {t("ways.title")}
        </h2>

        <div className="mt-10 grid items-center gap-8 lg:mt-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <h3 className="mb-0 max-w-[12ch] text-[clamp(2.15rem,4.6vw,3.6rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-ink!">
              {t("ways.post.title")}
            </h3>
            <p className="mt-5 mb-0 max-w-[38ch] text-[1.02rem] leading-7 text-muted">{t("ways.post.body")}</p>
            <Link
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-[0.95rem] font-semibold text-white! transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-brand-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              href={routes.postProject}
            >
              {t("ways.post.cta")}
            </Link>
          </div>
          <div className="relative aspect-4/3 overflow-hidden rounded-[28px] outline outline-1 outline-black/8">
            <Image
              alt={t("ways.post.imageAlt")}
              className="object-cover"
              fill
              sizes="(max-width: 1023px) calc(100vw - 2rem), 640px"
              src="/images/how-it-works/how-it-works-hiring-02.png"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(18rem,0.9fr)] lg:gap-5">
          {companies.map((company) => {
            const category = company.categories[0];

            return (
              <article
                className="overflow-hidden rounded-[22px] border border-brand-border bg-white"
                key={company.id}
              >
                <Link
                  className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  href={{ pathname: "/entreprises/[slug]", params: { slug: company.slug } }}
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      alt={tCompany("imageAlt", { company: company.name, city: company.city })}
                      className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      fill
                      sizes="(max-width: 1023px) calc(100vw - 2rem), 360px"
                      src={company.image}
                    />
                  </div>
                  <div className="px-5 py-4">
                    <h3 className="mb-1 text-[1.05rem] leading-snug font-semibold tracking-[-0.02em] text-ink!">
                      {company.name}
                    </h3>
                    <p className="mb-3 text-[0.92rem] leading-6 text-muted">
                      {category ? tCategories(category) : company.city}
                      <span aria-hidden="true"> · </span>
                      {company.city}
                    </p>
                    <span className="inline-flex min-h-11 items-center gap-2 text-[0.92rem] font-semibold text-brand">
                      {t("ways.invite.profile")}
                      <ArrowIcon />
                    </span>
                  </div>
                </Link>
              </article>
            );
          })}

          <article className="flex flex-col justify-center rounded-[22px] bg-brand-soft px-6 py-8 sm:px-8">
            <h3 className="mb-0 text-[clamp(1.7rem,3vw,2.35rem)] leading-[1.08] font-semibold tracking-[-0.04em] text-ink!">
              {t("ways.invite.title")}
            </h3>
            <p className="mt-4 mb-0 text-[0.98rem] leading-7 text-muted">{t("ways.invite.body")}</p>
            <Link
              className="mt-7 inline-flex min-h-12 w-fit items-center justify-center rounded-full bg-brand px-6 text-[0.95rem] font-semibold text-white! transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-brand-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              href={routes.companies}
            >
              {t("ways.invite.cta")}
            </Link>
          </article>
        </div>
      </section>

      <section
        aria-labelledby="hiring-flow-title"
        className="mx-auto mt-20 w-[min(1280px,calc(100%-2rem))] scroll-mt-28 sm:mt-28 sm:w-[min(1280px,calc(100%-3rem))]"
        id="parcours"
      >
        <h2
          className="mb-0 max-w-[16ch] text-[clamp(1.85rem,4.2vw,3rem)] leading-[1.05] font-semibold tracking-[-0.045em] text-ink!"
          id="hiring-flow-title"
        >
          {t("flow.title")}
        </h2>
        <ol className="mt-10 grid list-none gap-0 p-0 md:mt-14 md:grid-cols-4">
          {flowKeys.map((key, index) => (
            <li className="relative border-brand-border py-6 md:border-t md:px-5 md:pt-8 md:pb-0 md:first:pl-0 md:last:pr-0" key={key}>
              <span
                aria-hidden="true"
                className="absolute top-0 left-0 hidden size-2.5 -translate-y-1/2 rounded-full bg-brand md:block"
              />
              <p className="mb-3 text-[0.78rem] font-semibold tracking-[0.14em] text-brand">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mb-2 text-[1.15rem] leading-snug font-semibold tracking-[-0.03em] text-ink!">
                {t(`flow.steps.${key}.title`)}
              </h3>
              <p className="mb-0 max-w-[28ch] text-[0.95rem] leading-6 text-muted">{t(`flow.steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="hiring-faq-title" className="mx-auto mt-16 w-[min(1280px,calc(100%-2rem))] sm:mt-20 sm:w-[min(1280px,calc(100%-3rem))]">
        <div className="rounded-[28px] bg-surface-muted px-6 py-12 sm:px-10 sm:py-14 lg:rounded-[32px] lg:px-14 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(11rem,14rem)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
            <h2
              className="mb-0 max-w-[10ch] text-[clamp(1.85rem,3.2vw,2.65rem)] leading-[1.12] font-semibold tracking-[-0.04em] text-ink! lg:sticky lg:top-28 lg:self-start"
              id="hiring-faq-title"
            >
              {t("faq.title")}
            </h2>
            <dl className="m-0">
              {faqItems.map((item) => (
                <div className="border-b border-brand-border py-6 first:pt-0 last:border-b-0 last:pb-0" key={item.key}>
                  <dt>
                    <h3 className="mb-0 text-[1.15rem] leading-snug font-semibold tracking-[-0.03em] text-ink! sm:text-[1.25rem]">
                      {t(`faq.items.${item.key}.question`)}
                    </h3>
                  </dt>
                  <dd className="mt-3 mb-0 max-w-[68ch] text-[0.98rem] leading-7 text-muted">
                    {t(`faq.items.${item.key}.answer`)}
                    {"href" in item ? (
                      <FaqLink href={item.href} label={t(`faq.items.${item.key}.more`)} />
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}

function FaqLink({
  href,
  label,
}: {
  href: Exclude<(typeof faqItems)[number], { key: "4" }>["href"];
  label: string;
}) {
  const className =
    "mt-3 flex w-fit min-h-11 items-center text-[0.95rem] font-semibold text-brand transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand";

  if (href === "#parcours") {
    return (
      <a className={className} href={href}>
        {label}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}

function StepLink({ href, label }: { href: (typeof stepCards)[number]["href"]; label: string }) {
  const className =
    "mt-6 inline-flex min-h-11 items-center gap-2 text-[0.95rem] font-semibold text-brand transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand";

  if (href === "#parcours") {
    return (
      <a className={className} href={href}>
        {label}
        <ArrowIcon />
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {label}
      <ArrowIcon />
    </Link>
  );
}

function StepIcon({ name }: { name: "brief" | "search" | "chat" }) {
  const common = {
    "aria-hidden": true as const,
    className: "size-6",
    fill: "none",
    viewBox: "0 0 24 24",
  };

  if (name === "brief") {
    return (
      <svg {...common}>
        <path className="stroke-current" d="M8 4.5h8l2 2.2V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6.7z" strokeLinejoin="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M9 11h6M9 14.5h4" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg {...common}>
        <circle className="stroke-current" cx="11" cy="11" r="6" strokeWidth="1.5" />
        <path className="stroke-current" d="m16 16 3.5 3.5" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path className="stroke-current" d="M5 7.5h14v8.2a1 1 0 0 1-1 1H9.2L6 19.2V16.7H6a1 1 0 0 1-1-1z" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <path className="stroke-current" d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}
