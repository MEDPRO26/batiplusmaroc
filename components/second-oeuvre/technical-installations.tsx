const installations = [
  ["01", "Électricité", "Des installations organisées selon les besoins du bâtiment et de ses occupants."],
  ["02", "Plomberie", "Des réseaux intégrés avec attention aux usages et à l’accessibilité technique."],
  ["03", "Sanitaires", "Des équipements posés avec précision dans des espaces prêts à l’usage."],
] as const;

export function TechnicalInstallations() {
  return (
    <section className="border-y border-brand-border bg-[#f5f7f8] py-20 sm:py-24 lg:py-28" aria-labelledby="technical-installations-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Installations techniques</p>
            <h2 id="technical-installations-title" className="mb-6! text-[clamp(2.6rem,5vw,4.8rem)] leading-[0.95] tracking-[-0.06em]">Des réseaux pensés pour fonctionner durablement.</h2>
            <p className="m-0 max-w-lg text-base leading-7 text-muted">La coordination des installations techniques est essentielle pour rendre chaque bâtiment fonctionnel et confortable.</p>
          </div>
          <div className="grid border-t border-[#c8d5dd] sm:grid-cols-3 sm:border-l">
            {installations.map(([number, name, copy]) => (
              <article key={number} className="border-r border-b border-[#c8d5dd] p-6 sm:min-h-[320px] sm:p-7 lg:p-8">
                <p className="mb-16 text-[0.66rem] font-bold tracking-[0.16em] text-[#a87e16] sm:mb-24">{number}</p>
                <h3 className="mb-4 text-2xl tracking-[-0.035em]">{name}</h3>
                <p className="m-0 text-sm leading-6 text-muted">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
