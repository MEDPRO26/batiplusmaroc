import Image from "next/image";

export function AlFarahProject() {
  return (
    <section className="bg-white px-[18px] py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-12 grid gap-8 lg:grid-cols-[0.55fr_1fr] lg:items-end">
          <div><p className="text-xs font-bold tracking-[0.2em] text-[#a88232] uppercase">02 · Projet</p><p className="mt-3 text-[0.7rem] font-bold tracking-[0.16em] text-brand uppercase">Gros œuvre et état final</p></div>
          <div><h2 className="max-w-4xl text-[clamp(2.8rem,5.4vw,5.7rem)] leading-[0.93] font-semibold tracking-[-0.06em] text-ink">Immeuble R+5 — Al Farah, Agadir</h2><p className="mt-6 max-w-2xl text-lg leading-8 text-muted">Fin du gros œuvre, lecture des volumes et état final du bâtiment.</p></div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-1">
            <figure><div className="relative aspect-[4/5] overflow-hidden rounded-[18px]"><Image src="/images/portfolio-2026/projects/al-farah-01.webp" alt="Immeuble R+5 à Al Farah en fin de gros œuvre" fill sizes="(max-width: 1023px) 50vw, 30vw" className="object-cover" /></div><figcaption className="mt-3 text-sm font-medium text-muted">Fin gros œuvre</figcaption></figure>
            <figure><div className="relative aspect-[4/5] overflow-hidden rounded-[18px]"><Image src="/images/portfolio-2026/projects/al-farah-03.webp" alt="Façade et volumes de l’immeuble R+5 à Al Farah" fill sizes="(max-width: 1023px) 50vw, 30vw" className="object-cover" /></div><figcaption className="mt-3 text-sm font-medium text-muted">Façade et volumes</figcaption></figure>
          </div>
          <figure className="relative min-h-[620px] overflow-hidden rounded-[22px] lg:min-h-full">
            <Image src="/images/portfolio-2026/projects/immeuble-r5-al-farah-etat-final.webp" alt="État final de l’immeuble R+5 à Al Farah, Agadir" fill sizes="(max-width: 1023px) 100vw, 65vw" className="object-cover" />
            <figcaption className="absolute right-5 bottom-5 rounded-full bg-white/95 px-4 py-2 text-xs font-bold tracking-[0.12em] text-ink uppercase">État final</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
