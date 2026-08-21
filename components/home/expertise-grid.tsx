import Image from "next/image";
import { expertise } from "@/content/expertise";
import { ExpertiseScroller } from "@/components/home/expertise-scroller";

export function ExpertiseGrid() {
  return (
    <section className="overflow-hidden bg-[#101f33] py-20 md:py-24 lg:py-28" aria-labelledby="expertise-title">
      <header className="mx-auto max-w-[1280px] px-[18px] text-center sm:px-6 lg:px-8">
        <p className="mb-4 text-xs font-bold tracking-[0.16em] text-sky-300 uppercase">Nos expertises</p>
        <h2 id="expertise-title" className="mx-auto max-w-[850px] text-3xl leading-tight font-semibold tracking-[-0.04em] text-white! md:text-4xl lg:text-5xl">
          Nous vous accompagnons dans 10 grands domaines d’expertises
        </h2>
      </header>

      <ExpertiseScroller>
        <ol className="flex w-max list-none flex-nowrap gap-5 py-0 pr-[calc((100vw-var(--expertise-card-width))/2)] pl-[calc((100vw-var(--expertise-card-width))/2)]">
          {expertise.map((item) => (
            <li
              className="group relative aspect-[0.72/1] w-[var(--expertise-card-width)] shrink-0 snap-start overflow-hidden rounded-[22px] bg-[#17324d] transition-transform duration-300 motion-safe:hover:-translate-y-1"
              data-expertise-card
              key={item.title}
            >
              <Image
                className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.03]"
                src={item.image}
                alt={item.alt}
                fill
                sizes="(max-width: 639px) 78vw, (max-width: 1023px) 300px, (max-width: 1279px) 260px, 280px"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent" aria-hidden="true" />
              <span className="absolute top-5 left-5 rounded-full bg-black/20 px-3 py-1.5 text-xs font-semibold tracking-wider text-white backdrop-blur-sm" aria-hidden="true">
                {item.number}
              </span>
              <h3 className="absolute right-5 bottom-5 left-5 text-xl leading-tight font-semibold text-white!">{item.title}</h3>
            </li>
          ))}
        </ol>
      </ExpertiseScroller>
    </section>
  );
}
