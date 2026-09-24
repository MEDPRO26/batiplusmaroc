import Image from "next/image";
import { getTranslations } from "next-intl/server";

const items = [
  { key: "0", photo: "/images/testimonials/amina.webp" },
  { key: "1", photo: "/images/testimonials/aziz.webp" },
  { key: "2", photo: "/images/testimonials/nassima.webp" },
  { key: "3", photo: "/images/testimonials/mohamed.webp" },
  { key: "4", photo: "/images/testimonials/karim.webp" },
  { key: "5", photo: "/images/testimonials/leila.webp" },
] as const;

export async function Testimonials() {
  const t = await getTranslations("home.testimonials");

  return (
    <section aria-labelledby="testimonials-title" className="relative overflow-hidden bg-white py-16 sm:py-22 lg:py-30">
      <Image
        alt=""
        aria-hidden="true"
        className="pointer-events-none object-cover object-center"
        fill
        sizes="100vw"
        src="/images/reviews-graphic.webp"
      />

      <div className="relative mx-auto w-[calc(100%-48px)] max-w-[1280px] sm:w-[calc(100%-64px)] lg:w-[calc(100%-80px)]">
        <h2
          className="mx-auto mb-10 max-w-[22ch] text-center text-[clamp(1.85rem,4.4vw,3.15rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink! sm:mb-14"
          id="testimonials-title"
        >
          {t("title")}
        </h2>

        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {items.map((item) => (
            <li key={item.key}>
              <blockquote className="flex h-full min-h-[240px] flex-col rounded-md border border-brand-border/80 bg-white p-5 shadow-[0_10px_30px_rgb(5_79_132_/_0.06)] sm:p-6">
                <p className="m-0 flex-1 text-[0.95rem] leading-6 text-ink/85 sm:text-[1rem] sm:leading-7">
                  {t(`items.${item.key}.quote`)}
                </p>
                <footer className="mt-6 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block text-[0.92rem] font-semibold tracking-[-0.02em] text-ink">
                      {t(`items.${item.key}.name`)}
                    </strong>
                    <span className="mt-0.5 block text-[0.82rem] leading-snug text-muted">
                      {t(`items.${item.key}.role`)}
                    </span>
                  </div>
                  <Image
                    alt={t(`items.${item.key}.name`)}
                    className="size-12 shrink-0 rounded-full object-cover outline-1 outline-black/10 sm:size-[3.25rem]"
                    height={52}
                    src={item.photo}
                    width={52}
                  />
                </footer>
              </blockquote>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
