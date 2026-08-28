import { ContactForm } from "@/components/contact/contact-form";
import Link from "next/link";
import { routes } from "@/lib/routes";

export function ContactPanel() {
  return (
    <section className="bg-[#eef3f6] px-[18px] py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-[1280px] overflow-hidden bg-white shadow-[0_30px_80px_rgba(10,33,56,0.09)] lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.65fr)]">
        <div className="p-6 sm:p-10 lg:p-14 xl:p-16">
          <div className="mb-12 grid gap-5 border-b border-[#d9e2e7] pb-9 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="mb-4 text-[0.68rem] font-bold tracking-[0.18em] text-[#07598e] uppercase">Votre demande</p>
              <h2 className="m-0 max-w-2xl text-[clamp(2rem,4vw,3.7rem)] leading-[1.02] text-[#111820]!">Quelques informations pour mieux comprendre votre projet.</h2>
            </div>
            <span className="text-[0.65rem] font-bold tracking-[0.15em] text-[#8997a0] uppercase">Les champs marqués * sont obligatoires</span>
          </div>
          <ContactForm />
        </div>

        <aside className="relative overflow-hidden bg-[#0b223a] p-7 text-white sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute -right-40 -bottom-32 size-[430px] rounded-full border border-white/8" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-24 -bottom-16 size-[270px] rounded-full border border-white/8" aria-hidden="true" />
          <div className="relative flex h-full flex-col">
            <p className="mb-10 text-[0.68rem] font-bold tracking-[0.18em] text-[#e5b43c] uppercase">Contact direct</p>
            <div className="grid gap-8">
              <a className="group border-t border-white/15 pt-5" href="tel:+212766018650">
                <span className="block text-[0.65rem] font-bold tracking-[0.15em] text-white/45 uppercase">Téléphone</span>
                <span className="mt-2 block text-xl font-semibold text-white transition-colors group-hover:text-[#83cef3]">+212 766-018650</span>
              </a>
              <a className="group border-t border-white/15 pt-5" href="mailto:sgta.btp@gmail.com">
                <span className="block text-[0.65rem] font-bold tracking-[0.15em] text-white/45 uppercase">E-mail</span>
                <span className="mt-2 block break-all text-lg font-semibold text-white transition-colors group-hover:text-[#83cef3]">sgta.btp@gmail.com</span>
              </a>
              <div className="border-t border-white/15 pt-5">
                <span className="block text-[0.65rem] font-bold tracking-[0.15em] text-white/45 uppercase">Adresse</span>
                <span className="mt-2 block text-lg font-semibold text-white">Hay Dakhla, Agadir</span>
              </div>
            </div>
            <div className="mt-16 border-l-2 border-[#e5b43c] pl-5 lg:mt-auto">
              <p className="m-0 text-sm leading-7 text-white/65">S2MBOU Construction — votre partenaire dans la réalisation de projets de construction durables et sur mesure.</p>
            </div>
            <nav className="relative mt-8 grid gap-2" aria-label="Découvrir S2MBOU">
              <Link className="flex min-h-12 items-center justify-between border-t border-white/15 py-3 text-sm font-semibold text-white transition-colors hover:text-[#83cef3]" href={routes.services}>Découvrir nos services <span aria-hidden="true">→</span></Link>
              <Link className="flex min-h-12 items-center justify-between border-t border-white/15 py-3 text-sm font-semibold text-white transition-colors hover:text-[#83cef3]" href={routes.projects}>Voir nos réalisations <span aria-hidden="true">→</span></Link>
            </nav>
          </div>
        </aside>
      </div>
    </section>
  );
}
