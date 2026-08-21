import Image from "next/image";

export function ExteriorPortfolio() {
  return (
    <section className="bg-white px-[18px] py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-12 max-w-4xl"><p className="mb-5 text-[0.68rem] font-bold tracking-[0.2em] text-brand uppercase">Extérieurs</p><h2 className="text-[clamp(2.8rem,5.6vw,5.8rem)] leading-[0.92] font-semibold tracking-[-0.06em] text-ink">Des finitions qui se prolongent à l’extérieur.</h2></div>
        <div className="grid gap-5 lg:grid-cols-[1.55fr_0.75fr_0.75fr]">
          <figure className="relative min-h-[620px] overflow-hidden rounded-[22px]"><Image src="/images/portfolio-2026/exteriors/exterieur-piscine.webp" alt="Aménagement extérieur avec piscine, terrasse et jardin" fill sizes="(max-width: 1023px) 100vw, 58vw" className="object-cover" /><figcaption className="absolute right-5 bottom-5 left-5 border-t border-white/50 pt-4"><h3 className="m-0 text-xl font-semibold text-white!">Extérieur & piscine</h3></figcaption></figure>
          <figure className="group"><div className="relative min-h-[460px] overflow-hidden rounded-[18px] lg:min-h-[620px]"><Image src="/images/portfolio-2026/exteriors/facades-travaux-exterieurs-02.webp" alt="Façade de villa et travaux extérieurs près d’une piscine" fill sizes="(max-width: 1023px) 50vw, 22vw" className="object-cover" /></div><figcaption className="mt-4"><h3 className="m-0 text-lg font-semibold text-ink">Façades & travaux extérieurs</h3></figcaption></figure>
          <figure className="group lg:pt-24"><div className="relative min-h-[460px] overflow-hidden rounded-[18px] lg:min-h-[596px]"><Image src="/images/portfolio-2026/exteriors/facades-travaux-exterieurs-01.webp" alt="Équipe réalisant des travaux de finition extérieure" fill sizes="(max-width: 1023px) 50vw, 22vw" className="object-cover" /></div><figcaption className="mt-4"><h3 className="m-0 text-lg font-semibold text-ink">Travaux de finition</h3></figcaption></figure>
        </div>
      </div>
    </section>
  );
}
