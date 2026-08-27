import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/seo/json-ld";
import { getProjectBySlug, projects, projectPath } from "@/content/projects";
import { routes } from "@/lib/routes";
import { SITE_URL } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/nos-realisations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return {};

  const url = `${SITE_URL}${projectPath(project.slug)}`;
  const title = `${project.title} | Réalisation S2MBOU`;
  const description = project.story.intro;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images: [{ url: project.images[0].src, alt: project.images[0].alt }] },
    twitter: { card: "summary_large_image", title, description, images: [project.images[0].src] },
  };
}

export default async function ProjectPage({ params }: PageProps<"/nos-realisations/[slug]">) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  const url = `${SITE_URL}${projectPath(project.slug)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: project.story.intro,
    url,
    image: project.images.map(({ src }) => `${SITE_URL}${src}`),
    creator: { "@type": "Organization", name: "S2MBOU Construction", url: SITE_URL },
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <main>
        <section className="relative min-h-[72vh] overflow-hidden bg-[#091a2d] text-white">
          <Image className="object-cover opacity-60" src={project.images[0].src} alt={project.images[0].alt} fill priority sizes="100vw" />
          <div className="absolute inset-0 bg-linear-to-t from-[#07111f] via-[#07111f]/55 to-[#07111f]/15" aria-hidden="true" />
          <div className="relative mx-auto flex min-h-[72vh] max-w-[1280px] flex-col justify-end px-[18px] py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
            <nav className="mb-10 flex flex-wrap items-center gap-3 text-xs font-semibold tracking-[0.12em] text-white/65 uppercase" aria-label="Fil d’Ariane">
              <Link className="hover:text-white" href={routes.home}>Accueil</Link><span aria-hidden="true">/</span>
              <Link className="hover:text-white" href={routes.projects}>Réalisations</Link><span aria-hidden="true">/</span>
              <span className="text-white">{project.title}</span>
            </nav>
            <div className="mb-5 flex items-center gap-3"><span className="text-xs font-bold tracking-[0.18em] text-[#f0bd42]">{project.id}</span><span className="h-px w-10 bg-[#f0bd42]" aria-hidden="true" /><span className="text-xs font-semibold tracking-[0.14em] text-white/70 uppercase">Réalisation S2MBOU</span></div>
            <h1 className="m-0 max-w-5xl text-[clamp(3rem,8vw,7.5rem)] leading-[0.9] font-semibold tracking-[-0.065em] text-white!">{project.title}</h1>
            <p className="mt-7 max-w-3xl text-base leading-7 text-white/80 sm:text-xl sm:leading-8">{project.subtitle}</p>
          </div>
        </section>

        <section className="bg-white px-[18px] py-18 sm:px-6 sm:py-24 lg:px-8 lg:py-30">
          <div className="mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <aside className="grid content-start gap-7 border-t border-brand-border pt-6 sm:grid-cols-2 lg:grid-cols-1">
              <div><p className="text-[0.65rem] font-bold tracking-[0.16em] text-muted uppercase">Localisation / secteur</p><p className="mt-2 text-lg font-semibold text-ink">{project.story.location}</p></div>
              <div><p className="text-[0.65rem] font-bold tracking-[0.16em] text-muted uppercase">Nature des travaux</p><p className="mt-2 text-lg font-semibold text-ink">{project.story.category}</p></div>
            </aside>
            <div>
              <p className="mb-5 text-[0.68rem] font-bold tracking-[0.2em] text-brand uppercase">Le projet</p>
              <h2 className="max-w-3xl text-[clamp(2.4rem,5vw,4.6rem)] leading-[1] tracking-[-0.055em]">{project.story.headline}</h2>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-muted">{project.story.intro}</p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden bg-[#0b223a] px-[18px] py-18 text-white sm:px-6 sm:py-24 lg:px-8 lg:py-30" aria-labelledby="project-intervention-title">
          <div className="mx-auto grid max-w-[1280px] gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-24">
            <div>
              <div className="mb-7 flex items-center gap-4">
                <span className="text-[0.68rem] font-bold tracking-[0.18em] text-[#e5b43c] uppercase">Notre intervention</span>
                <span className="h-px flex-1 bg-white/15" aria-hidden="true" />
              </div>
              <h2 id="project-intervention-title" className="max-w-2xl text-[clamp(2.35rem,4.8vw,4.5rem)] leading-[0.98] tracking-[-0.055em] text-white!">Une méthode adaptée au projet et à ses contraintes.</h2>
              <p className="mt-8 max-w-2xl text-base leading-8 text-white/70 sm:text-lg">{project.story.approach}</p>
            </div>

            <ol className="grid content-start border-t border-white/15 sm:grid-cols-2 lg:grid-cols-1">
              {project.story.services.map((service, index) => (
                <li className="grid min-h-24 grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-white/15 py-5 sm:odd:border-r sm:odd:pr-5 sm:even:pl-5 lg:odd:border-r-0 lg:odd:pr-0 lg:even:pl-0" key={service}>
                  <span className="text-[0.65rem] font-bold tracking-[0.16em] text-[#e5b43c]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="text-base font-semibold text-white sm:text-lg">{service}</span>
                  <span className="text-white/35" aria-hidden="true">↗</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-[#edf3f7] px-[18px] py-18 sm:px-6 sm:py-24 lg:px-8 lg:py-30" aria-label={`Galerie de ${project.title}`}>
          <div className="mx-auto max-w-[1280px]">
            <header className="mb-10 flex flex-col gap-5 border-b border-[#cad7df] pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="mb-4 text-[0.68rem] font-bold tracking-[0.18em] text-brand uppercase">Regards sur le chantier</p><h2 className="m-0 text-[clamp(2.3rem,4vw,4rem)] leading-none">Le projet en images.</h2></div>
              <p className="m-0 max-w-md text-sm leading-6 text-muted">Trois vues pour lire les matières, les volumes et la qualité d’exécution.</p>
            </header>
            <div className="grid gap-5 lg:grid-cols-12 lg:gap-7">
              {project.images.map((image, index) => (
                <figure className={`relative overflow-hidden rounded-[20px] bg-white ${index === 0 ? "aspect-[4/3] lg:col-span-7 lg:row-span-2 lg:aspect-auto lg:min-h-[760px]" : "aspect-[4/3] lg:col-span-5"}`} key={image.src}>
                  <Image className="object-cover transition-transform duration-700 hover:scale-[1.02]" src={image.src} alt={image.alt} fill sizes={index === 0 ? "(max-width: 1023px) 100vw, 58vw" : "(max-width: 1023px) 100vw, 42vw"} />
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-[18px] py-18 sm:px-6 sm:py-24 lg:px-8 lg:py-30">
          <div className="mx-auto grid max-w-[1280px] gap-10 lg:grid-cols-[0.42fr_1fr] lg:gap-20">
            <div className="flex items-start gap-4"><span className="mt-2 h-px w-10 bg-[#d8a832]" aria-hidden="true" /><p className="m-0 text-[0.68rem] font-bold tracking-[0.18em] text-brand uppercase">Le résultat</p></div>
            <div>
              <p className="m-0 max-w-4xl text-[clamp(1.75rem,3.5vw,3.4rem)] leading-[1.18] font-medium tracking-[-0.045em] text-ink">{project.story.result}</p>
              <Link className="mt-10 inline-flex items-center gap-3 border-b border-brand-border pb-2 text-sm font-semibold text-brand transition hover:border-brand" href={routes.projects}>Découvrir toutes nos réalisations <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <section className="bg-[#0b223a] px-[18px] py-18 text-white sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-9 lg:flex-row lg:items-end">
            <div><p className="mb-4 text-[0.68rem] font-bold tracking-[0.18em] text-[#e5b43c] uppercase">Votre projet</p><h2 className="m-0 max-w-3xl text-[clamp(2.4rem,5vw,4.8rem)] leading-[0.98] text-white!">Construisons votre prochaine réalisation.</h2></div>
            <Link className="inline-flex min-h-14 shrink-0 items-center gap-4 rounded-[8px] bg-white px-7 text-sm font-semibold text-[#0b223a] transition hover:-translate-y-1" href={routes.contact}>Parler de mon projet <span aria-hidden="true">→</span></Link>
          </div>
        </section>
      </main>
    </>
  );
}
