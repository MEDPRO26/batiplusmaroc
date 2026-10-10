"use client";

import { useLocale, useTranslations } from "next-intl";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";

export type ProjectGeographicSelection = { regionCode: string; provinceCode: string };

/** One state update clears the dependent province before either feed changes its query arguments. */
export function changeProjectGeography(
  current: ProjectGeographicSelection,
  field: "regionCode" | "provinceCode",
  code: string,
): ProjectGeographicSelection {
  return field === "regionCode"
    ? { regionCode: code, provinceCode: "" }
    : { ...current, provinceCode: code };
}

export function ProjectGeographicFilters({
  value, onChange, idPrefix, className = "grid gap-3 sm:grid-cols-2",
}: {
  value: ProjectGeographicSelection;
  onChange: (value: ProjectGeographicSelection) => void;
  idPrefix: string;
  className?: string;
}) {
  const t = useTranslations("companyProjects");
  const locale = useLocale() === "fr" ? "fr" : "en";
  const provinces = getProvincesByRegion(value.regionCode);
  const selectClass = "min-h-11 w-full min-w-0 rounded-sm border border-[#c5c8cb] bg-white px-3 text-sm font-normal text-ink outline-none focus:border-brand focus-visible:ring-3 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:bg-[#f4f7fa] disabled:text-muted";
  return (
    <div className={className}>
      <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-muted" htmlFor={`${idPrefix}-region`}>
        {t("filters.region")}
        <select className={selectClass} id={`${idPrefix}-region`} name="regionCode" value={value.regionCode}
          onChange={(event) => onChange(changeProjectGeography(value, "regionCode", event.target.value))}>
          <option value="">{t("filters.allMorocco")}</option>
          {getRegions().map((region) => <option key={region.code} value={region.code}>
            {locale === "fr" ? region.nameFr : region.nameEn}
          </option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-muted" htmlFor={`${idPrefix}-province`}>
        {t("filters.province")}
        <select aria-describedby={!value.regionCode ? `${idPrefix}-province-hint` : undefined}
          className={selectClass} disabled={!value.regionCode} id={`${idPrefix}-province`} name="provinceCode" value={value.provinceCode}
          onChange={(event) => onChange(changeProjectGeography(value, "provinceCode", event.target.value))}>
          <option value="">{t("filters.allProvinces")}</option>
          {provinces.map((province) => <option key={province.code} value={province.code}>
            {locale === "fr" ? province.nameFr : province.nameEn}
          </option>)}
        </select>
        {!value.regionCode ? <span className="text-xs font-normal leading-5" id={`${idPrefix}-province-hint`}>
          {t("filters.provinceDisabled")}
        </span> : null}
      </label>
    </div>
  );
}
