import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { HeroSearch } from "./hero-search";
import { outfit } from "@/components/shared/outfit";

export async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section className={`${outfit.className} home-hero bg-white relative mx-auto mt-3.5 mb-7 flex min-h-[620px] w-[min(2000px,calc(100%-1.75rem))] items-center overflow-hidden rounded-3xl  py-8 md:mt-6 md:min-h-[740px] md:w-[min(2000px,calc(100%-3rem))] md:rounded-[30px] md:py-10 lg:mt-7 lg:min-h-[960px] lg:w-[min(2000px,calc(100%-4rem))] lg:rounded-[36px] xl:w-[min(2000px,calc(100%-5rem))] 2xl:w-[min(2000px,calc(100%-6rem))]`}>
      <Image alt={t("imageAlt")} className="z-0 object-cover object-[56%_center]" fill priority sizes="(max-width: 767px) calc(100vw - 28px), (max-width: 1800px) calc(100vw - 64px), 1700px" src="/images/service-construction.png" />
      <div aria-hidden="true" className="absolute inset-0 z-1 bg-[linear-gradient(180deg,rgba(10,20,30,0.74),rgba(10,35,60,0.52))] md:bg-[linear-gradient(90deg,rgba(10,20,30,0.60),rgba(10,35,60,0.42))]" />
      <div className="relative z-2 mt-16 w-full min-w-0 max-w-full px-4 md:mt-[82px] md:px-10 lg:px-16">
        <HeroSearch />
      </div>
    </section>
  );
}
