import Image from "next/image";
import Link from "next/link";
import { routes } from "@/lib/routes";

const advantages = [
  {
    number: "01",
    title: "Bureau d’étude intégré",
    image: "/images/hero-amenagement.png",
    alt: "Équipe examinant les plans d’un projet de construction",
    position: "object-center",
  },
  {
    number: "02",
    title: "Matériaux durables",
    image: "/images/about-project.jpg",
    alt: "Matériel de chantier et documents techniques de construction",
    position: "object-[58%_center]",
  },
  {
    number: "03",
    title: "Respect des délais et des normes",
    image: "/images/service-construction.png",
    alt: "Responsable coordonnant les travaux sur un chantier",
    position: "object-center",
  },
  {
    number: "04",
    title: "Maîtrise complète du projet",
    image: "/images/project-alhouda.jpg",
    alt: "Structure d’un bâtiment en cours de réalisation",
    position: "object-center",
  },
] as const;

export function TrustStrip() {
  return (
    <section className="relative overflow-hidden bg-[#edf5f9] py-16 sm:py-20 lg:py-28" aria-labelledby="advantages-title">
      <svg
        className="pointer-events-none absolute -top-16 -right-28 h-[430px] w-[620px] text-brand opacity-[0.065] sm:-right-20 sm:h-[520px] sm:w-[760px] lg:-top-24 lg:right-0 lg:h-[650px] lg:w-[900px]"
        viewBox="0 0 900 650"
        fill="none"
        aria-hidden="true"
      >
        <g stroke="currentColor" strokeWidth="1.5">
          <path d="M112 52h620v456H112zM166 104h512v348H166z" />
          <path d="M112 180h620M112 336h620M288 52v456M514 52v456" />
          <path d="m166 104 122 76-122 156 122 116 226-116 164 116M288 180l226 156 164-156" />
          <circle cx="401" cy="259" r="104" />
          <circle cx="401" cy="259" r="72" />
          <path d="M401 155v208M297 259h208M754 105v347M734 105h40M734 452h40" />
          <path d="m748 123 6-18 6 18M748 434l6 18 6-18" />
          <path d="M166 534h512M166 520v28M678 520v28" />
          <path d="m184 528-18 6 18 6M660 528l18 6-18 6" />
        </g>
      </svg>

      <div className="relative z-1 mx-auto w-[calc(100%-36px)] max-w-[1280px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-64px)]">
        <header className="mx-auto max-w-[930px] text-center">
          <p className="mb-4 text-xs font-bold tracking-[0.18em] text-brand uppercase sm:text-sm">Pourquoi S2MBOU</p>
          <h2 id="advantages-title" className="mx-auto text-[clamp(2.15rem,5vw,3.75rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink!">
            Collaborer avec S2MBOU, c’est l’assurance de multiples avantages
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            De l’étude à la réalisation, S2MBOU réunit les compétences, les matériaux et le suivi nécessaires pour accompagner chaque projet avec cohérence.
          </p>
        </header>

        <ul className="mt-12 grid list-none grid-cols-1 gap-5 p-0 sm:mt-14 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4 lg:gap-6">
          {advantages.map((advantage) => (
            <li className="group relative aspect-[4/5] min-h-[360px] overflow-hidden rounded-[26px] bg-brand-dark shadow-[0_18px_45px_rgb(23_61_99_/_0.11)] sm:aspect-[0.82/1] lg:aspect-[0.76/1] lg:min-h-[420px]" key={advantage.title}>
              <Image
                className={`object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${advantage.position}`}
                src={advantage.image}
                alt={advantage.alt}
                fill
                sizes="(max-width: 639px) calc(100vw - 36px), (max-width: 1023px) calc(50vw - 34px), 302px"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/15 via-55% to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
                <span className="text-xs font-bold tracking-[0.2em] text-sky-300" aria-hidden="true">{advantage.number}</span>
                <h3 className="mt-3 text-xl leading-tight font-semibold tracking-[-0.025em] text-white! lg:text-[22px]">{advantage.title}</h3>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex justify-center sm:mt-12">
          <Link
            className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-brand px-7 py-4 font-semibold text-white! transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            href={routes.about}
          >
            Découvrir l’entreprise <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
