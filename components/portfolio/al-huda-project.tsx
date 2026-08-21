import Image from "next/image";

export function AlHudaProject() {
  return (
    <section className="bg-[#0b223b] px-[18px] py-20 text-white sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[1.55fr_0.75fr] lg:items-end lg:gap-16">
        <figure className="relative min-h-[560px] overflow-hidden rounded-[22px] sm:min-h-[720px] lg:min-h-[860px]">
          <Image src="/images/portfolio-2026/projects/al-huda-03.webp" alt="État final et façade de l’immeuble R+5 à Al-Huda, Agadir" fill sizes="(max-width: 1023px) 100vw, 68vw" className="object-cover" />
          <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-6 pt-20 pb-6 text-sm text-white sm:px-8 sm:pb-8">État final / façade</figcaption>
        </figure>
        <div className="pb-2 lg:pb-10">
          <p className="text-xs font-bold tracking-[0.2em] text-[#e7b63f] uppercase">01 · Projet à la une</p>
          <p className="mt-8 text-[0.7rem] font-bold tracking-[0.18em] text-[#8eb9d6] uppercase">Construction & gros œuvre</p>
          <h2 className="mt-4 text-[clamp(2.7rem,5vw,5.25rem)] leading-[0.94] font-semibold tracking-[-0.055em] text-white!">Immeuble R+5 — Al-Huda, Agadir</h2>
          <p className="mt-7 max-w-md text-lg leading-8 text-[#b8c7d4]">Suivi des phases de construction et gros œuvre, du démarrage des travaux à l’état final.</p>
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/15 pt-6 text-[0.66rem] font-bold tracking-[0.12em] text-white/65 uppercase">
            <span>Démarrage</span><span>Gros œuvre</span><span>Façade</span>
          </div>
        </div>
      </div>
    </section>
  );
}
