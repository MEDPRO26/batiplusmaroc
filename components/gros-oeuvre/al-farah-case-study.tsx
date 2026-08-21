import Image from "next/image";

export function AlFarahCaseStudy() {
  return (
    <section className="bg-white py-20 sm:py-28 lg:py-36" aria-labelledby="al-farah-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-6 border-b border-brand-border pb-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <p className="text-[0.7rem] font-bold tracking-[0.2em] text-[#ae8420] uppercase">Autre référence</p>
          <div>
            <h2 id="al-farah-title" className="mb-5! max-w-[850px] text-[clamp(2.7rem,5.5vw,5.4rem)] leading-[0.94] tracking-[-0.065em]">
              Immeuble R+5 — Al Farah
            </h2>
            <p className="m-0 text-lg text-muted">Quartier Al Farah, Agadir · Gros œuvre et état final.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.22fr_0.78fr] lg:gap-8">
          <figure className="group m-0">
            <div className="relative min-h-[560px] overflow-hidden rounded-[22px] bg-brand-soft sm:min-h-[760px]">
              <Image src="/images/portfolio-2026/projects/al-farah-02.webp" alt="État final d’un immeuble R+5 à Al Farah, Agadir" fill sizes="(max-width: 1023px) calc(100vw - 36px), 58vw" className="object-cover" />
            </div>
            <figcaption className="mt-4 flex items-center justify-between gap-4 border-b border-brand-border pb-4 text-sm font-semibold text-brand-dark">
              <span>État final</span><span className="text-[#ae8420]">02</span>
            </figcaption>
          </figure>

          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-1">
            <figure className="m-0">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-brand-soft lg:aspect-[16/10]">
                <Image src="/images/portfolio-2026/projects/al-farah-01.webp" alt="Immeuble R+5 à Al Farah à la fin du gros œuvre" fill sizes="(max-width: 639px) calc(100vw - 36px), (max-width: 1023px) 48vw, 35vw" className="object-cover object-[center_60%]" />
              </div>
              <figcaption className="mt-4 flex items-center justify-between gap-4 border-b border-brand-border pb-4 text-sm font-semibold text-brand-dark">
                <span>Fin gros œuvre</span><span className="text-[#ae8420]">01</span>
              </figcaption>
            </figure>
            <figure className="m-0">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-brand-soft lg:aspect-[16/10]">
                <Image src="/images/portfolio-2026/projects/al-farah-03.webp" alt="Façade et volumes d’un immeuble R+5 à Al Farah" fill sizes="(max-width: 639px) calc(100vw - 36px), (max-width: 1023px) 48vw, 35vw" className="object-cover object-[center_55%]" />
              </div>
              <figcaption className="mt-4 flex items-center justify-between gap-4 border-b border-brand-border pb-4 text-sm font-semibold text-brand-dark">
                <span>Façade et volumes</span><span className="text-[#ae8420]">03</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
