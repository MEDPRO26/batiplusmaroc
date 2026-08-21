import Image from "next/image";

export function VillaFountyProject() {
  return (
    <section className="bg-[#eaf2f7] px-[18px] py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-12 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
          <div><p className="text-xs font-bold tracking-[0.2em] text-[#a88232] uppercase">03 · Projet</p><h2 className="mt-4 text-[clamp(3rem,6vw,6.2rem)] leading-[0.9] font-semibold tracking-[-0.065em] text-ink">Villa Founty</h2></div>
          <p className="max-w-xl text-lg leading-8 text-muted lg:justify-self-end">Une lecture directe du projet pendant les travaux puis dans son état final.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <figure><div className="relative aspect-[1.12/1] overflow-hidden rounded-[22px]"><Image src="/images/portfolio-2026/projects/villa-founty-construction.webp" alt="Villa Founty pendant les travaux de construction" fill sizes="(max-width: 767px) 100vw, 50vw" className="object-cover" /></div><figcaption className="mt-5 flex items-center gap-4 text-sm font-semibold text-ink"><span className="h-px w-8 bg-[#a88232]" aria-hidden="true" />Pendant les travaux</figcaption></figure>
          <figure className="md:pt-20"><div className="relative aspect-[1.12/1] overflow-hidden rounded-[22px]"><Image src="/images/portfolio-2026/projects/villa-founty-02.webp" alt="Villa Founty après réalisation" fill sizes="(max-width: 767px) 100vw, 50vw" className="object-cover" /></div><figcaption className="mt-5 flex items-center gap-4 text-sm font-semibold text-ink"><span className="h-px w-8 bg-[#a88232]" aria-hidden="true" />État final</figcaption></figure>
        </div>
      </div>
    </section>
  );
}
