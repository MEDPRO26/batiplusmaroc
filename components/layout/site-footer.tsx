import Image from "next/image";
import Link from "next/link";

import { footerNavigation, serviceNavigation } from "@/content/site";
import { routes } from "@/lib/routes";

const footerLinkClass =
  "group flex min-h-10 items-center justify-between gap-4 border-b border-white/8 py-2 text-sm text-[#b6c3cf] transition-colors hover:text-white";

export function SiteFooter() {
  return (
    <footer className="relative mt-auto overflow-hidden bg-[#091728] text-white">
      <div
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[#e7b63f]/75 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-40 -bottom-64 size-[520px] rounded-full bg-[#0b5684]/18 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-[1280px] gap-12 px-[18px] py-14 sm:px-6 sm:py-16 md:grid-cols-2 lg:grid-cols-[1.5fr_0.8fr_0.8fr_1fr] lg:gap-14 lg:px-8 lg:py-20">
        <div>
          <Link
            className="inline-flex rounded-xl bg-white px-5 py-4 shadow-[0_12px_35px_rgba(0,0,0,0.16)] transition-transform duration-200 hover:-translate-y-0.5"
            href={routes.home}
            aria-label="S2MBOU — Accueil"
          >
            <Image
              src="/brand/s2mbou-logo.webp"
              alt="S2MBOU"
              width={153}
              height={40}
            />
          </Link>
          <p className="mt-7 max-w-sm text-sm leading-7 text-[#9babb9] sm:text-[0.95rem]">
            S2MBOU Construction — votre partenaire dans la réalisation de
            projets de construction durables et sur mesure.
          </p>
          <Link
            className="group mt-7 inline-flex items-center gap-3 text-sm font-semibold text-white"
            href={routes.contact}
          >
            Parler de votre projet
            <span
              className="text-[#e7b63f] transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            >
              →
            </span>
          </Link>
        </div>

        <div>
          <p className="mb-4 text-[0.68rem] font-bold tracking-[0.18em] text-[#e7b63f] uppercase">
            Navigation
          </p>
          <nav aria-label="Navigation de pied de page">
            <ul className="m-0 list-none p-0">
              {footerNavigation.map((item) => (
                <li key={item.href}>
                  <Link className={footerLinkClass} href={item.href}>
                    {item.label}
                    <span
                      className="text-[#567086] opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div>
          <p className="mb-4 text-[0.68rem] font-bold tracking-[0.18em] text-[#e7b63f] uppercase">
            Services
          </p>
          <nav aria-label="Services">
            <ul className="m-0 list-none p-0">
              {serviceNavigation.map((item) => (
                <li key={item.href}>
                  <Link className={footerLinkClass} href={item.href}>
                    {item.label}
                    <span
                      className="text-[#567086] opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div>
          <p className="mb-4 text-[0.68rem] font-bold tracking-[0.18em] text-[#e7b63f] uppercase">
            Contact
          </p>
          <address className="grid gap-5 text-sm not-italic">
            <a
              className="group grid gap-1 border-b border-white/8 pb-4"
              href="tel:+212766018650"
            >
              <span className="text-[0.65rem] font-bold tracking-[0.14em] text-[#6f8496] uppercase">
                Téléphone
              </span>
              <span className="font-semibold text-[#d9e1e8] transition-colors group-hover:text-white">
                +212 766-018650
              </span>
            </a>
            <a
              className="group grid gap-1 border-b border-white/8 pb-4"
              href="mailto:sgta.btp@gmail.com"
            >
              <span className="text-[0.65rem] font-bold tracking-[0.14em] text-[#6f8496] uppercase">
                E-mail
              </span>
              <span className="break-all font-semibold text-[#d9e1e8] transition-colors group-hover:text-white">
                sgta.btp@gmail.com
              </span>
            </a>
            <span className="grid gap-1">
              <span className="text-[0.65rem] font-bold tracking-[0.14em] text-[#6f8496] uppercase">
                Adresse
              </span>
              <span className="font-semibold text-[#d9e1e8]">
                Hay Dakhla, Agadir
              </span>
            </span>
          </address>
        </div>
      </div>

      <div className="relative mx-auto flex max-w-[1280px] flex-col gap-3 border-t border-white/10 px-[18px] py-6 text-[0.7rem] tracking-[0.06em] text-[#718496] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span>© {new Date().getFullYear()} S2MBOU</span>
        <span>Construction · Aménagement · Finitions</span>
      </div>
    </footer>
  );
}
