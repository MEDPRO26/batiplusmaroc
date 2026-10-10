import { normalizeLocationText, PROJECT_LOCATION_TEXT_MAX_LENGTH } from "./location-text";
import { validateAdministrativePair } from "./morocco";

export const COMPANY_HEADQUARTERS_COMMUNE_MAX_LENGTH = PROJECT_LOCATION_TEXT_MAX_LENGTH;
export const COMPANY_HEADQUARTERS_POLICY_VERSION = "structured_v1";

/** Complete snapshot; omission preserves storage and an all-null snapshot clears it. */
export type CompanyHeadquartersInput = {
  regionCode: string | null;
  provinceCode: string | null;
  communeName: string | null;
};

export type CompanyHeadquartersFields = {
  headquartersRegionCode?: string;
  headquartersProvinceCode?: string;
  headquartersCommune?: string;
};

type HeadquartersValidation =
  | { readonly ok: true; readonly fields: CompanyHeadquartersFields }
  | { readonly ok: false; readonly error:
    | "COMPANY_HEADQUARTERS_REGION_REQUIRED"
    | "COMPANY_HEADQUARTERS_PROVINCE_REQUIRED"
    | "INVALID_COMPANY_HEADQUARTERS_REGION"
    | "INVALID_COMPANY_HEADQUARTERS_PROVINCE"
    | "COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH"
    | "INVALID_COMPANY_HEADQUARTERS_COMMUNE" };

/** No city/coverage inference, database access or legal-address fallback. */
export function normalizeCompanyHeadquarters(input: CompanyHeadquartersInput | undefined, required = false): HeadquartersValidation {
  if (required && (input === undefined || input.regionCode === null)) {
    return { ok: false, error: "COMPANY_HEADQUARTERS_REGION_REQUIRED" };
  }
  if (input === undefined) return { ok: true, fields: {} };
  if (input.regionCode === null && input.provinceCode === null && input.communeName === null) {
    return { ok: true, fields: {
      headquartersRegionCode: undefined, headquartersProvinceCode: undefined, headquartersCommune: undefined,
    } };
  }
  if (input.regionCode === null) return { ok: false, error: "COMPANY_HEADQUARTERS_REGION_REQUIRED" };
  if (input.provinceCode === null) return { ok: false, error: "COMPANY_HEADQUARTERS_PROVINCE_REQUIRED" };
  const pair = validateAdministrativePair(input.regionCode, input.provinceCode);
  if (!pair.valid) {
    const error = pair.error === "PROVINCE_REGION_MISMATCH" ? "COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH"
      : pair.error === "INVALID_REGION_CODE" || pair.error === "UNKNOWN_REGION_CODE" ? "INVALID_COMPANY_HEADQUARTERS_REGION"
        : "INVALID_COMPANY_HEADQUARTERS_PROVINCE";
    return { ok: false, error };
  }
  // HQ1 rejects all control characters, including tabs/newlines. Other Unicode whitespace is normalized.
  if (input.communeName !== null && /\p{Cc}/u.test(input.communeName)) {
    return { ok: false, error: "INVALID_COMPANY_HEADQUARTERS_COMMUNE" };
  }
  const commune = normalizeLocationText(input.communeName);
  if (!commune.ok) return { ok: false, error: "INVALID_COMPANY_HEADQUARTERS_COMMUNE" };
  return { ok: true, fields: {
    headquartersRegionCode: pair.region.code, headquartersProvinceCode: pair.province.code, headquartersCommune: commune.value,
  } };
}

/** Owner-private preload only; the three fields come exclusively from the Company. */
export function companyHeadquartersSnapshot(company: CompanyHeadquartersFields): CompanyHeadquartersInput {
  return {
    regionCode: company.headquartersRegionCode ?? null,
    provinceCode: company.headquartersProvinceCode ?? null,
    communeName: company.headquartersCommune ?? null,
  };
}
