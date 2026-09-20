import Link from "next/link";
import { routes } from "@/lib/routes";

const quickLinks = [
  { number: "01", label: "Nos services", href: routes.services },
  { number: "02", label: "Nos réalisations", href: routes.projects },
] as const;

export default function NotFound() {
  return (
    <section className="relative isolate flex min-h-[70vh] overflow-hidden bg-[#edf3f7] px-[18px] py-16 sm:px-6 md:py-24 lg:px-8 lg:py-28">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-45 [background-image:linear-gradient(#9eb6c7_1px,transparent_1px),linear-gradient(90deg,#9eb6c7_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-0 right-[9%] -z-10 h-full w-px bg-brand/15"
        aria-hidden="true"
      />

      <div className="mx-auto grid w-full max-w-[1280px] items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="relative border-l-2 border-[#e7b63f] pl-5 sm:pl-8">
          <p className="mb-6 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">
            Erreur de navigation · Plan introuvable
          </p>
          <h1 className="m-0 text-[clamp(6.5rem,22vw,15rem)] leading-[0.72] font-bold tracking-[-0.08em] text-[#173d63]! select-none">
            404
          </h1>
          <p className="mt-8 text-[0.68rem] font-semibold tracking-[0.16em] text-[#7890a2] uppercase">
            Référence S2MBOU / Agadir
          </p>
        </div>

        <div className="max-w-[660px] lg:py-8">
          <p className="eyebrow">Page non trouvée</p>
          <h2 className="max-w-[620px] text-[clamp(2.15rem,5vw,4.3rem)] leading-[0.98]">
            Cette page n’est pas sur le plan.
          </h2>
          <p className="mt-6 max-w-[570px] text-[1.02rem] leading-7 text-muted sm:text-[1.1rem] sm:leading-8">
            L’adresse est peut-être incorrecte ou la page a été déplacée. Revenez à l’accueil ou poursuivez votre visite parmi nos projets de construction et d’aménagement.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link className="button button-primary" href={routes.home}>
              Retour à l’accueil <span aria-hidden="true">→</span>
            </Link>
            <Link
              className="button border border-brand-border bg-white text-ink shadow-[0_8px_24px_rgb(23_61_99_/_0.06)] hover:border-brand hover:text-brand"
              href={routes.contact}
            >
              Nous contacter
            </Link>
          </div>

          <nav className="mt-12 grid border-t border-[#b8c9d5] sm:grid-cols-2" aria-label="Liens utiles">
            {quickLinks.map((item) => (
              <Link
                className="group flex items-center justify-between gap-5 border-b border-[#b8c9d5] py-5 sm:odd:mr-5 sm:even:ml-5"
                href={item.href}
                key={item.href}
              >
                <span className="flex items-center gap-4">
                  <span className="text-[0.65rem] font-bold tracking-[0.12em] text-brand">{item.number}</span>
                  <span className="font-semibold text-ink transition-colors group-hover:text-brand">{item.label}</span>
                </span>
                <span className="text-brand transition-transform group-hover:translate-x-1" aria-hidden="true">↗</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
