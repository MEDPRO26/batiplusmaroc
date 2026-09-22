import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/layout/brand-logo";
import { footerColumns, footerSocial } from "@/content/site";
import { Link } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";
import { outfit } from "@/components/shared/outfit";

const linkClass =
  "inline-flex min-h-10 items-center text-[0.92rem] leading-6 text-white/72 transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tBrand = await getTranslations("brand");

  return (
    <footer className={`${outfit.className} bg-white px-4 pb-5 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8`}>
      <div className="mx-auto max-w-7xl rounded-xl bg-dark-section px-6 py-12 text-white sm:px-10 sm:py-14 lg:px-16 lg:py-16">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.35fr)_repeat(4,minmax(0,1fr))] lg:gap-10">
          <div className="col-span-2 lg:col-span-1">
            <Link
              aria-label={tBrand("homeAria")}
              className="inline-flex text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              href={routes.home}
            >
              <BrandLogo className="text-[1.7rem] leading-none text-white" name={tBrand("name")} />
            </Link>
            <p className="mt-5 mb-0 max-w-[22rem] text-[0.88rem] leading-6 text-white/62">{t("description")}</p>
          </div>

          {footerColumns.map((column) => (
            <nav aria-labelledby={`footer-${column.key}`} key={column.key}>
              <p
                className="mb-4 text-[0.82rem] leading-5 font-medium text-white/50"
                id={`footer-${column.key}`}
              >
                {t(`columns.${column.key}.heading`)}
              </p>
              <ul className="m-0 grid list-none gap-1 p-0">
                {column.links.map((item) => (
                  <li key={`${column.key}-${item.labelKey}`}>
                    <FooterLink hash={footerHash(item)} href={item.href}>
                      {t(`columns.${column.key}.${item.labelKey}` as Parameters<typeof t>[0])}
                    </FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 sm:mt-14 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <p className="mb-0 text-[0.82rem] text-white/50">{t("follow")}</p>
            <ul className="m-0 flex list-none gap-2 p-0">
              {footerSocial.map((network) => (
                <li key={network.key}>
                  <a
                    aria-label={t(`social.${network.key}`)}
                    className="grid size-10 place-items-center rounded-full text-white/80 transition-colors duration-150 hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    href={network.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FacebookIcon />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="mb-0 max-w-sm text-[0.82rem] leading-6 text-white/45 sm:text-end">{t("tagline")}</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-[0.78rem] text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p className="mb-0">{t("copyright", { year: new Date().getFullYear() })}</p>
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
            <li>
              <Link className="min-h-10 inline-flex items-center hover:text-white" href={routes.contact}>
                {t("contact")}
              </Link>
            </li>
            <li>
              <Link className="min-h-10 inline-flex items-center hover:text-white" href={routes.about}>
                {t("about")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function footerHash(item: object) {
  if ("hash" in item && typeof item.hash === "string") return item.hash;
  return undefined;
}

function FooterLink({
  children,
  hash,
  href,
}: {
  children: ReactNode;
  hash?: string;
  href: AppRoute;
}) {
  return (
    <Link className={linkClass} href={(hash ? { pathname: href, hash } : href) as never}>
      {children}
    </Link>
  );
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M14.5 8.5V6.8c0-.7.5-1.3 1.6-1.3h1.4V3h-2.3C12.4 3 11 4.6 11 6.7v1.8H9v2.6h2V21h3.5v-9.9h2.3l.4-2.6z" />
    </svg>
  );
}
