"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { COMPANY_HEADQUARTERS_COMMUNE_MAX_LENGTH, type CompanyHeadquartersInput } from "@/lib/geography/company-headquarters";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";
import { joinClassNames } from "@/lib/utils";

export function CompanyOnboardingHeadquarters({
  id, snapshot, required, supported, fieldClass, fieldError,
}: {
  id: string;
  snapshot: CompanyHeadquartersInput | undefined;
  required: boolean;
  supported: boolean;
  fieldClass: string;
  fieldError: { name: string; message: string } | null;
}) {
  const t = useTranslations("auth.companyOnboarding");
  const locale = useLocale();
  const [regionCode, setRegionCode] = useState(snapshot?.regionCode ?? "");
  const [provinceCode, setProvinceCode] = useState(snapshot?.provinceCode ?? "");
  const provinces = getProvincesByRegion(regionCode);
  const message = (name: string) => fieldError?.name === name ? fieldError.message : null;
  const describedBy = (name: string) => `${id}-${name}-hint${message(name) ? ` ${id}-${name}-error` : ""}`;
  const error = (name: string) => message(name) ? (
    <span className="mt-1 block text-[0.8rem] font-normal text-red-700" id={`${id}-${name}-error`} role="alert">{message(name)}</span>
  ) : null;
  const className = (name: string) => joinClassNames(fieldClass, message(name) && "border-red-400");
  const adminName = (item: { nameFr: string; nameEn: string }) => locale === "fr" ? item.nameFr : item.nameEn;

  return (
    <div className="mt-5 space-y-4">
      <label className="block text-[0.88rem] font-medium text-ink" htmlFor={`${id}-country`}>
        {t("headquarters.country")}
        <input className={fieldClass} id={`${id}-country`} readOnly value={t("headquarters.morocco")} />
      </label>
      {!supported ? <p className="m-0 text-sm leading-5 text-muted" role="status">{t("headquarters.unavailable")}</p> : null}
      <div className="text-[0.88rem] font-medium text-ink">
        <label className="block" htmlFor={`${id}-regionCode`}>{t("headquarters.region")}</label>
        <select
          aria-describedby={describedBy("regionCode")} aria-invalid={Boolean(message("regionCode"))}
          className={className("regionCode")} disabled={!supported} id={`${id}-regionCode`} name="regionCode"
          onChange={event => { setRegionCode(event.target.value); setProvinceCode(""); }} required={required} value={regionCode}
        >
          <option value="">{t("headquarters.selectRegion")}</option>
          {getRegions().map(region => <option key={region.code} value={region.code}>{adminName(region)}</option>)}
        </select>
        <span className="mt-1.5 block text-[0.8rem] font-normal leading-5 text-muted" id={`${id}-regionCode-hint`}>
          {t(required ? "headquarters.required" : "headquarters.legacyOptional")}
        </span>
        {error("regionCode")}
      </div>
      <div className="text-[0.88rem] font-medium text-ink">
        <label className="block" htmlFor={`${id}-provinceCode`}>{t("headquarters.province")}</label>
        <select
          aria-describedby={describedBy("provinceCode")} aria-invalid={Boolean(message("provinceCode"))}
          className={className("provinceCode")} disabled={!supported || provinces.length === 0} id={`${id}-provinceCode`} name="provinceCode"
          onChange={event => setProvinceCode(event.target.value)} required={required} value={provinceCode}
        >
          <option value="">{t("headquarters.selectProvince")}</option>
          {provinces.map(province => <option key={province.code} value={province.code}>{adminName(province)}</option>)}
        </select>
        <span className="mt-1.5 block text-[0.8rem] font-normal leading-5 text-muted" id={`${id}-provinceCode-hint`}>{t("headquarters.provinceHint")}</span>
        {error("provinceCode")}
      </div>
      <div className="text-[0.88rem] font-medium text-ink">
        <label className="block" htmlFor={`${id}-communeName`}>{t("headquarters.commune")}</label>
        <input
          aria-describedby={describedBy("communeName")} aria-invalid={Boolean(message("communeName"))}
          className={className("communeName")} defaultValue={snapshot?.communeName ?? ""} disabled={!supported}
          id={`${id}-communeName`} maxLength={COMPANY_HEADQUARTERS_COMMUNE_MAX_LENGTH} name="communeName" type="text"
        />
        <span className="mt-1.5 block text-[0.8rem] font-normal leading-5 text-muted" id={`${id}-communeName-hint`}>
          {t("headquarters.communeHint", { max: COMPANY_HEADQUARTERS_COMMUNE_MAX_LENGTH })}
        </span>
        {error("communeName")}
      </div>
    </div>
  );
}
