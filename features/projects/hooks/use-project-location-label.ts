"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import { formatProjectLocation, toGeneralProjectLocation, type ProjectLocation } from "@/lib/geography/project-location";

type LocationCarrier = { location?: ProjectLocation; city?: string | null };

/** Format only the server's audience projection. Older DTOs fall back to their legacy city. */
export function useProjectLocationLabel() {
  const locale = useLocale() === "fr" ? "fr" : "en";
  const t = useTranslations("projectLocation");
  const tWizard = useTranslations("projectWizard");
  return useCallback((project: LocationCarrier) => formatProjectLocation(
    project.location ?? toGeneralProjectLocation({ city: project.city }),
    locale,
    { unspecified: t("unspecified"), legacyCity: (code) => tWizard(`cityOptions.${code}`) },
  ), [locale, t, tWizard]);
}
