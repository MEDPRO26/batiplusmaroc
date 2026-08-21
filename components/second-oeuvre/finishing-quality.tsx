const principles = ["Travaux soignés", "Conformité aux normes", "Confort des espaces", "Qualité du bien"] as const;

export function FinishingQuality() {
  return (
    <section className="bg-[#0b2036] py-20 text-white sm:py-28 lg:py-32" aria-labelledby="finishing-quality-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-[#7ec6ef] uppercase">Qualité d’exécution</p>
            <h2 id="finishing-quality-title" className="mb-0! max-w-[820px] text-[clamp(2.8rem,5.7vw,5.7rem)] leading-[0.93] tracking-[-0.065em] text-white!">Une finition réussie ne laisse rien au hasard.</h2>
          </div>
          <div className="lg:pt-14">
            <p className="mb-10 text-lg leading-8 text-[#c5d2dc]">Grâce à notre expertise, nous assurons des travaux soignés, conformes aux normes en vigueur, pour garantir votre confort et la qualité de votre bien.</p>
            <ul className="m-0 grid list-none grid-cols-2 border-t border-white/18 p-0">
              {principles.map((principle, index) => <li key={principle} className="border-r border-b border-white/18 px-3 py-6 text-sm font-semibold sm:px-5 sm:py-7"><span className="mr-3 text-[#e8bd50]">0{index + 1}</span>{principle}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
