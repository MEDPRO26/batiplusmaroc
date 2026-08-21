import Image from "next/image";

export function JoineryCirculation() {
  return (
    <section className="bg-white py-20 sm:py-28 lg:py-36" aria-labelledby="joinery-title">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-[18px] sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-20 lg:px-8">
        <div className="grid grid-cols-2 gap-4">
          <figure className="relative m-0 min-h-[560px] overflow-hidden rounded-[22px] bg-[#e4e9eb] sm:min-h-[700px]">
            <Image src="/images/portfolio-2026/interiors/escaliers-circulations-03.webp" alt="Escalier intérieur achevé avec marches sombres" fill sizes="(max-width: 1023px) 50vw, 22vw" className="object-cover" />
          </figure>
          <div className="grid gap-4 pt-16 sm:pt-24">
            <figure className="relative m-0 min-h-[260px] overflow-hidden rounded-[22px] bg-[#e4e9eb] sm:min-h-[330px]">
              <Image src="/images/portfolio-2026/interiors/amenagement-interieur-01.webp" alt="Entrée intérieure avec menuiserie et rangements intégrés" fill sizes="(max-width: 1023px) 50vw, 22vw" className="object-cover" />
            </figure>
            <figure className="relative m-0 min-h-[260px] overflow-hidden rounded-[22px] bg-[#e4e9eb] sm:min-h-[330px]">
              <Image src="/images/portfolio-2026/interiors/escaliers-circulations-02.webp" alt="Escalier intérieur pendant les travaux de finition" fill sizes="(max-width: 1023px) 50vw, 22vw" className="object-cover" />
            </figure>
          </div>
        </div>
        <div>
          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Menuiserie & circulation</p>
          <h2 id="joinery-title" className="mb-7! max-w-[680px] text-[clamp(2.7rem,5.3vw,5.2rem)] leading-[0.94] tracking-[-0.065em]">Relier les espaces avec précision.</h2>
          <p className="mb-8 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">Portes, escaliers et rangements participent directement à la circulation, à l’organisation et au confort quotidien.</p>
          <div className="grid grid-cols-3 border-y border-brand-border py-6 text-[0.68rem] font-bold tracking-[0.12em] text-brand uppercase">
            <span>Portes</span><span>Escaliers</span><span>Rangements</span>
          </div>
        </div>
      </div>
    </section>
  );
}
