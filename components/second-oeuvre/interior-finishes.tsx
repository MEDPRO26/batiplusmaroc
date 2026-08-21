import Image from "next/image";

const images = [
  ["/images/portfolio-2026/interiors/amenagement-interieur-03.webp", "Pièce achevée avec revêtements de sol et finitions murales", "Revêtements & finitions"],
  ["/images/portfolio-2026/interiors/details-finition-01.webp", "Niche intérieure arrondie avec éclairage indirect", "Détail architectural"],
  ["/images/portfolio-2026/interiors/revetements-decoratifs-02.webp", "Habillage décoratif intérieur effet bois", "Habillage décoratif"],
] as const;

export function InteriorFinishes() {
  return (
    <section className="bg-white py-20 sm:py-28 lg:py-36" aria-labelledby="interior-finishes-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-7 lg:mb-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Finitions intérieures</p>
            <h2 id="interior-finishes-title" className="mb-0! max-w-[800px] text-[clamp(2.7rem,5.5vw,5.5rem)] leading-[0.94] tracking-[-0.065em]">La qualité se lit dans chaque surface.</h2>
          </div>
          <p className="m-0 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8 lg:justify-self-end">Carrelage, peinture, revêtements et détails décoratifs composent une finition cohérente, pensée pour l’usage autant que pour l’esthétique.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr]">
          <FinishingImage image={images[0]} className="min-h-[520px] md:row-span-2 md:min-h-[760px]" />
          <FinishingImage image={images[1]} className="min-h-[360px]" />
          <FinishingImage image={images[2]} className="min-h-[360px]" />
        </div>
      </div>
    </section>
  );
}

function FinishingImage({ image: [src, alt, label], className }: { image: readonly [string, string, string]; className: string }) {
  return (
    <figure className={`group relative m-0 overflow-hidden rounded-[22px] bg-[#dce5e9] ${className}`}>
      <Image src={src} alt={alt} fill sizes="(max-width: 767px) calc(100vw - 36px), (max-width: 1023px) 50vw, 55vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.015]" />
      <div className="absolute inset-0 bg-linear-to-t from-[#071524]/70 via-transparent to-transparent" aria-hidden="true" />
      <figcaption className="absolute right-0 bottom-0 left-0 p-6 text-sm font-semibold text-white sm:p-7">{label}</figcaption>
    </figure>
  );
}
