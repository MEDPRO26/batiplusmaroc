import { Clock3 } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function SeoModulePlaceholder({ module }: { module: "media" | "pages" | "pillars" | "clusters" | "briefs" }) {
  const t = await getTranslations("seoCms");
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <div>
        <p className="text-[0.72rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">{t("workspaceLabel")}</p>
        <h1 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] sm:text-[2.2rem]">{t(`nav.${module}`)}</h1>
      </div>
      <section className="grid min-h-72 place-items-center rounded-[20px] border border-[#e7eaee] bg-white p-8 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="max-w-md">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef3ff] text-[#2f6bff]"><Clock3 aria-hidden className="size-5" /></span>
          <h2 className="mt-4 text-lg font-semibold">{t("placeholder.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-[#626970]">{t("placeholder.description")}</p>
        </div>
      </section>
    </div>
  );
}
