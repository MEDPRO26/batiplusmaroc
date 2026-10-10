"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import { isProvinceInRegion } from "@/lib/geography/morocco";
import {
  formatProjectLocation,
  LEGACY_CITY_CODES,
  toGeneralProjectLocation,
  type ProjectLocation,
} from "@/lib/geography/project-location";

type LocationCarrier = { location?: ProjectLocation; city?: string | null };

/** Display only the Admin DTO; incomplete records never acquire inferred geography. */
export function useAdminProjectLocationLabel() {
  const locale = useLocale() === "fr" ? "fr" : "en";
  const t = useTranslations("adminProjectLocation");
  const tWizard = useTranslations("projectWizard");

  return useCallback((project: LocationCarrier) => {
    const location = project.location ?? toGeneralProjectLocation({ city: project.city });
    const localityName = "localityName" in location ? location.localityName : null;
    const hasStructuredFields = [
      location.regionCode, location.provinceCode, location.communeName, localityName,
    ].some((value) => value !== null);
    const completeLegacy = !hasStructuredFields && LEGACY_CITY_CODES.some(
      (code) => code === location.legacyCity,
    );
    const completeStructured = isProvinceInRegion(location.provinceCode, location.regionCode)
      && Boolean(localityName?.trim());
    const incomplete = t("incomplete");
    const label = formatProjectLocation(location, locale, {
      unspecified: incomplete,
      legacyCity: (code) => tWizard(`cityOptions.${code}`),
    });

    return completeLegacy || completeStructured || label === incomplete
      ? label
      : t("incompleteWithDetails", { location: label });
  }, [locale, t, tWizard]);
}
