import { getProvince, getRegion } from "./morocco";

export type RecordedProjectLocation = {
  locationMode?: "structured" | null;
  regionCode?: string | null;
  provinceCode?: string | null;
  communeName?: string | null;
  localityName?: string | null;
  city?: string | null;
  neighborhood?: string | null;
};

export type GeneralProjectLocation = Readonly<{
  regionCode: string | null;
  provinceCode: string | null;
  communeName: string | null;
  legacyCity: string | null;
}>;

export type DetailedProjectLocation = GeneralProjectLocation & Readonly<{
  localityName: string | null;
  neighborhood: string | null;
}>;
export type ProjectLocation = GeneralProjectLocation | DetailedProjectLocation;

// Historical display keys only. This does not map cities to administrative areas.
export const LEGACY_CITY_CODES = Object.freeze([
  "agadir", "casablanca", "fes", "marrakech", "meknes", "oujda", "rabat", "sale", "tangier", "tetouan",
] as const);
export type LegacyCityCode = (typeof LEGACY_CITY_CODES)[number];
const legacyCities = new Set<string>(LEGACY_CITY_CODES);

function recordedString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Intent is independent of completeness. Null DTO fields represent absent storage. */
export function usesStructuredProjectLocation(project: RecordedProjectLocation): boolean {
  return project.locationMode === "structured" ||
    project.regionCode != null || project.provinceCode != null ||
    project.communeName != null || project.localityName != null;
}

/** Allowlisted general geography; never copies private locality, neighborhood or addresses. */
export function toGeneralProjectLocation(project: RecordedProjectLocation): GeneralProjectLocation {
  const region = getRegion(project.regionCode);
  const province = getProvince(project.provinceCode);
  const compatibleProvince = province && (!project.regionCode || province.regionCode === region?.code);
  const city = usesStructuredProjectLocation(project) ? null : recordedString(project.city);
  return {
    regionCode: region?.code ?? null,
    provinceCode: compatibleProvince ? province.code : null,
    communeName: recordedString(project.communeName),
    legacyCity: city && legacyCities.has(city) ? city : null,
  };
}

/** Authorized geography; inactive historical cities remain stored and available in owner/Admin context. */
export function toDetailedProjectLocation(project: RecordedProjectLocation): DetailedProjectLocation {
  return {
    regionCode: recordedString(project.regionCode),
    provinceCode: recordedString(project.provinceCode),
    communeName: recordedString(project.communeName),
    legacyCity: usesStructuredProjectLocation(project) ? null : recordedString(project.city),
    localityName: recordedString(project.localityName),
    neighborhood: recordedString(project.neighborhood),
  };
}

type LocationLabels = {
  unspecified: string;
  legacyCity: (code: LegacyCityCode) => string;
};

/** Pure display only. Labels come from next-intl; only allowlisted legacy codes reach translation keys. */
export function formatProjectLocation(location: ProjectLocation, locale: "fr" | "en", labels: LocationLabels): string {
  const region = getRegion(location.regionCode);
  const province = getProvince(location.provinceCode);
  const compatibleProvince = province && (!location.regionCode || province.regionCode === region?.code);
  const regionName = region ? (locale === "fr" ? region.nameFr : region.nameEn) : null;
  const provinceName = compatibleProvince ? (locale === "fr" ? province.nameFr : province.nameEn) : null;
  const legacyCity = location.legacyCity && legacyCities.has(location.legacyCity)
    ? labels.legacyCity(location.legacyCity as LegacyCityCode)
    : null;
  const parts = [
    ...(regionName || provinceName ? [regionName, provinceName] : [legacyCity]),
    location.communeName,
    ...("localityName" in location ? [location.localityName, location.neighborhood] : []),
  ];
  // Normalize display whitespace only; retain Unicode, spelling and case in the DTO and storage.
  const displayed = parts.filter((part): part is string => typeof part === "string")
    .map((part) => part.trim().replace(/\s+/g, " ")).filter(Boolean);
  return [...new Set(displayed)].join(" · ") || labels.unspecified;
}
