import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { services } from "@/content/services";

export function Services() {
  return (
    <section className="bg-[#f8fbfd] py-16 sm:py-20 lg:py-28" aria-labelledby="services-title">
      <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-[930px] text-center">
          <p className="mb-4 text-xs font-bold tracking-[0.16em] text-brand uppercase sm:text-sm">Nos services</p>
          <h2 id="services-title" className="mx-auto max-w-[900px] text-[clamp(2.25rem,5vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-ink!">
            Des solutions complètes pour chaque étape de votre projet.
          </h2>
          <p className="mx-auto mt-6 max-w-[760px] text-base leading-relaxed text-muted sm:text-lg">
            De la structure aux finitions, S2MBOU réunit les savoir-faire nécessaires pour construire et aménager avec cohérence.
          </p>
        </header>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:mt-14 md:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-6">
          {services.map((service) => (
            <Fragment key={service.title}>
              <article className="flex min-h-[360px] flex-col rounded-[28px] border border-slate-200/80 bg-white p-7 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:min-h-[380px] md:p-8 lg:p-9">
                <span className="text-xs font-bold tracking-[0.18em] text-brand uppercase" aria-hidden="true">{service.number}</span>
                <h3 className="mt-6 text-2xl leading-tight font-semibold tracking-[-0.035em] text-ink! md:text-[30px]">{service.title}</h3>
                <p className="mt-5 text-base leading-8 text-muted">{service.description}</p>
                <div className="mt-auto mb-5 h-px bg-slate-200" aria-hidden="true" />
                <Link className="group/link inline-flex items-center justify-between gap-4 font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" href={service.href}>
                  <span>{service.cta}</span>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-border text-lg transition-[background-color,color,transform] group-hover/link:translate-x-0.5 group-hover/link:bg-brand group-hover/link:text-white" aria-hidden="true">↗</span>
                </Link>
              </article>

              <figure className="group relative min-h-[360px] overflow-hidden rounded-[28px] bg-slate-200 sm:min-h-[380px]">
                <Image
                  className={`object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${service.imagePosition}`}
                  src={service.image}
                  alt={service.alt}
                  fill
                  sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1023px) calc(50vw - 36px), 420px"
                />
                <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/50 to-transparent" aria-hidden="true" />
                <figcaption className="absolute bottom-6 left-6 text-sm font-medium tracking-wide text-white/90!">{service.caption}</figcaption>
              </figure>
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
