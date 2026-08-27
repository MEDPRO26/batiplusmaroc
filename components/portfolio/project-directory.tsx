import Image from "next/image";
import Link from "next/link";

import { projects, projectPath } from "@/content/projects";

export function ProjectDirectory() {
  return (
    <section className="bg-[#f4f7f9] px-[18px] py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-30" aria-labelledby="project-directory-title">
      <div className="mx-auto max-w-[1280px]">
        <header className="mb-12 max-w-3xl lg:mb-16">
          <p className="mb-4 text-[0.68rem] font-bold tracking-[0.2em] text-brand uppercase">Explorer les réalisations</p>
          <h2 id="project-directory-title" className="text-[clamp(2.5rem,5vw,4.8rem)] leading-[0.98] tracking-[-0.055em]">Chaque projet, en détail.</h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted sm:text-lg">Découvrez les images, le contexte et le savoir-faire mobilisé pour chacune de nos réalisations.</p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link className="group overflow-hidden rounded-[20px] border border-brand-border bg-white shadow-[0_18px_50px_-38px_rgba(15,31,53,0.4)] transition hover:-translate-y-1 hover:shadow-[0_24px_55px_-34px_rgba(15,31,53,0.42)]" href={projectPath(project.slug)} key={project.id}>
              <div className="relative aspect-[4/3] overflow-hidden bg-brand-soft">
                <Image className="object-cover transition duration-700 group-hover:scale-[1.035]" src={project.images[0].src} alt={project.images[0].alt} fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" />
              </div>
              <div className="grid grid-cols-[auto_1fr_auto] items-start gap-4 p-5 sm:p-6">
                <span className="pt-1 text-xs font-bold tracking-[0.16em] text-brand">{project.id}</span>
                <div>
                  <h3 className="m-0 text-xl leading-tight font-semibold text-ink">{project.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{project.subtitle}</p>
                </div>
                <span className="text-xl text-brand transition group-hover:translate-x-1" aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
