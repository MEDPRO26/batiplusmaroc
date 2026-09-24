"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type Role = "client" | "company";

const clientChipKeys = ["villa", "renovation", "structural", "interior"] as const;
const companyChipKeys = ["villas", "buildings", "renovation", "fitout"] as const;

export function HeroSearch() {
  const [role, setRole] = useState<Role>("client");
  const [query, setQuery] = useState("");
  const searchId = useId();
  const t = useTranslations("hero");
  const isClient = role === "client";

  return (
    <div className="w-full min-w-0 max-w-[720px]">
      <div key={role} className="hero-panel-in">
        <h1 className="m-0 w-full max-w-full text-[1.85rem] leading-[1.12] font-semibold tracking-[-0.045em] text-white! wrap-break-word text-shadow-[0_2px_22px_rgb(0_0_0_/_0.18)] sm:text-[2.35rem] md:max-w-[16ch] md:text-[clamp(2.75rem,5.2vw,5.1rem)] md:leading-[0.96]">
          {isClient ? t("clientTitle") : t("companyTitle")}
        </h1>
        <p className="mt-4 w-full max-w-full text-[0.98rem] leading-[1.55] font-normal text-white/86! wrap-break-word md:mt-6 md:max-w-[34rem] md:text-[1.2rem] md:leading-[1.55] md:font-medium">
          {isClient ? t("clientDescription") : t("companyDescription")}
        </p>
      </div>

      <div
        aria-label={t("roleGroup")}
        className="mt-7 flex w-full min-w-0 flex-col rounded-[1.75rem] bg-white/10 p-1 ring-1 ring-white/15 md:mt-9 md:flex-row md:rounded-full"
        role="radiogroup"
      >
        {(["client", "company"] as const).map((item) => {
          const selected = role === item;
          return (
            <button
              aria-checked={selected}
              className={`flex min-h-12 w-full min-w-0 cursor-pointer items-center justify-center rounded-full px-4 text-center text-[0.84rem] leading-tight font-semibold wrap-break-word transition-[background-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97] md:flex-1 md:text-[0.95rem] ${
                selected ? "bg-white text-brand shadow-[0_8px_20px_rgb(0_0_0_/_0.16)]" : "text-white/80 hover:bg-white/8 hover:text-white"
              }`}
              key={item}
              onClick={() => {
                setRole(item);
                setQuery("");
              }}
              role="radio"
              type="button"
            >
              {t(item)}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-5 min-h-[148px] md:mt-6">
        {isClient ? <ClientPanel onQueryChange={setQuery} query={query} searchId={searchId} /> : <CompanyPanel />}
      </div>
    </div>
  );
}

function ClientPanel({
  query,
  searchId,
  onQueryChange,
}: {
  query: string;
  searchId: string;
  onQueryChange: (value: string) => void;
}) {
  const t = useTranslations("hero");

  return (
    <div className="hero-panel-in w-full min-w-0">
      <form
        className="w-full min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="sr-only" htmlFor={searchId}>
          {t("searchLabel")}
        </label>
        <div className="flex w-full min-w-0 items-center gap-1 rounded-full bg-white p-1 pl-4 shadow-[0_12px_32px_rgb(0_0_0_/_0.18)]">
          <input
            autoComplete="off"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-muted md:h-12 md:text-[1.02rem]"
            id={searchId}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("searchProject")}
            type="search"
            value={query}
          />
          <button
            className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-brand px-4 text-[0.8rem] font-semibold text-white! transition-colors duration-150 hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.97] md:h-12 md:px-5 md:text-sm"
            type="submit"
          >
            <SearchIcon />
            {t("searchButton")}
          </button>
        </div>
        <p className="mt-2.5 text-[0.78rem] leading-5 text-white/72 md:text-[0.84rem]">{t("searchExamples")}</p>
      </form>
      <ChipRow chips={clientChipKeys} onSelect={onQueryChange} />
    </div>
  );
}

function CompanyPanel() {
  const t = useTranslations("hero");

  return (
    <div className="hero-panel-in w-full min-w-0">
      <p className="text-[1.05rem] leading-snug font-semibold tracking-[-0.02em] text-white md:text-[1.25rem]">{t("companyHeadline")}</p>
      <Link
        className="mt-4 inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-brand px-6 text-[0.92rem] font-semibold text-white! shadow-[0_10px_24px_rgb(5_79_132_/_0.35)] transition-[background-color,transform] duration-150 hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97] md:min-h-13 md:px-7 md:text-[0.98rem]"
        href={routes.browseProjects}
      >
        {t("exploreProjects")}
      </Link>
      <ChipRow chips={companyChipKeys} />
    </div>
  );
}

function ChipRow({
  chips,
  onSelect,
}: {
  chips: readonly (typeof clientChipKeys)[number][] | readonly (typeof companyChipKeys)[number][];
  onSelect?: (value: string) => void;
}) {
  const t = useTranslations("hero.chips");

  return (
    <div className="mt-5 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-2">
        {chips.map((key) => (
          <button
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/30 bg-white/8 px-3.5 text-[0.8rem] font-medium whitespace-nowrap text-white transition-colors duration-150 hover:bg-white/16 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            key={key}
            onClick={() => onSelect?.(t(key))}
            type="button"
          >
            {t(key)}
            <span aria-hidden="true" className="text-[0.95rem] leading-none text-white/70">
              →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5 shrink-0 md:size-4" fill="none" viewBox="0 0 16 16">
      <circle className="stroke-current" cx="7.2" cy="7.2" r="4.4" strokeWidth="1.6" />
      <path className="stroke-current" d="m10.4 10.4 3 3" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}
