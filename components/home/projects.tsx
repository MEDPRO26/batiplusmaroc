import Image from "next/image";
import Link from "next/link";
import { projects } from "@/content/projects";
import { routes } from "@/lib/routes";

export function Projects() {
  return (
    <section className="bg-[#f8f9fa] py-20 md:py-24 lg:py-30" aria-labelledby="projects-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col items-start justify-between gap-7 border-b border-slate-200 pb-9 md:mb-14 md:flex-row md:items-end lg:mb-16">
          <div className="max-w-[900px]">
            <div className="mb-5 flex items-center gap-3">
              <span className="h-px w-8 bg-[#d8a832]" aria-hidden="true" />
              <p className="text-xs font-semibold tracking-[0.16em] text-[#12345a] uppercase">Nos réalisations</p>
            </div>
            <h2
              id="projects-title"
              className="max-w-[820px] text-[clamp(2.2rem,5vw,4.4rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-[#15191f]"
            >
              Des projets qui témoignent de notre savoir-faire.
            </h2>
          </div>

          <Link
            className="group inline-flex shrink-0 items-center gap-3 border-b border-slate-300 pb-1.5 text-sm font-semibold text-[#15191f] transition-colors hover:border-[#12345a] hover:text-[#12345a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#12345a] sm:text-base"
            href={routes.projects}
          >
            Voir toutes les réalisations
            <span className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
          </Link>
        </header>

        <div className="grid gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-12 lg:gap-7">
          {projects.map((project, index) => {
            const isFeatured = project.size === "featured";

            if (isFeatured) {
              return (
                <article
                  className="group relative min-h-[560px] overflow-hidden rounded-[28px] bg-[#10213a] shadow-[0_24px_70px_-34px_rgba(15,31,53,0.45)] md:col-span-2 lg:col-span-7 lg:row-span-2 lg:min-h-[780px]"
                  key={project.id}
                >
                  <div className="absolute inset-0 grid grid-cols-[1.65fr_1fr] grid-rows-2 gap-1.5 bg-[#10213a]">
                    {project.images.map((image, imageIndex) => (
                      <div className={`relative overflow-hidden ${imageIndex === 0 ? "row-span-2" : ""}`} key={image.src}>
                        <Image
                          className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.025]"
                          src={image.src}
                          alt={image.alt}
                          fill
                          sizes={imageIndex === 0 ? "(max-width: 1023px) 65vw, 38vw" : "(max-width: 1023px) 35vw, 20vw"}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-linear-to-t from-[#07111f]/95 via-[#07111f]/20 to-transparent" aria-hidden="true" />
                  <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8 lg:p-10">
                    <div className="mb-5 flex items-center gap-3">
                      <span className="text-xs font-bold tracking-[0.18em] text-[#f0bd42]">{project.id}</span>
                      <span className="h-px w-10 bg-[#f0bd42]/70" aria-hidden="true" />
                      <span className="text-xs font-medium tracking-[0.12em] text-white/65 uppercase">Projet sélectionné</span>
                    </div>
                    <h3 className="max-w-[560px] text-3xl leading-[1.05] font-semibold tracking-[-0.035em] text-white! sm:text-4xl lg:text-5xl">
                      {project.title}
                    </h3>
                    <p className="mt-4 max-w-[560px] text-sm leading-relaxed text-white/80 sm:text-base">{project.subtitle}</p>
                  </div>
                </article>
              );
            }

            return (
              <article
                className={`group overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_18px_55px_-38px_rgba(15,31,53,0.35)] transition-shadow duration-300 hover:shadow-[0_24px_65px_-34px_rgba(15,31,53,0.4)] ${index < 3 ? "lg:col-span-5" : "lg:col-span-6"}`}
                key={project.id}
              >
                <div className="grid aspect-[16/11] grid-cols-[1.55fr_1fr] grid-rows-2 gap-1.5 overflow-hidden bg-slate-100">
                  {project.images.map((image, imageIndex) => (
                    <div className={`relative overflow-hidden ${imageIndex === 0 ? "row-span-2" : ""}`} key={image.src}>
                      <Image
                        className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.035]"
                        src={image.src}
                        alt={image.alt}
                        fill
                        sizes={imageIndex === 0 ? "(max-width: 767px) 65vw, 32vw" : "(max-width: 767px) 35vw, 18vw"}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-5 p-5 sm:p-6 lg:p-7">
                  <span className="pt-1 text-xs font-bold tracking-[0.18em] text-[#12345a]">{project.id}</span>
                  <div>
                    <h3 className="text-xl leading-tight font-semibold tracking-[-0.025em] text-[#15191f] sm:text-2xl">{project.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">{project.subtitle}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
