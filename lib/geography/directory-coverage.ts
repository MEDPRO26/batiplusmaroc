import { validateCompanyCoverageScopes } from "./company-coverage";
import { getProvince, getProvincesByRegion, getRegion, isProvinceInRegion } from "./morocco";

export type DirectoryCoverageQueryError =
  | "INVALID_COMPANY_DIRECTORY_REGION"
  | "COMPANY_DIRECTORY_REGION_REQUIRED"
  | "INVALID_COMPANY_DIRECTORY_PROVINCE"
  | "COMPANY_DIRECTORY_PROVINCE_REGION_MISMATCH";

export type DirectoryCoverageQuery =
  | { readonly ok: true; readonly active: false }
  | { readonly ok: true; readonly active: true; readonly scopes: readonly string[] }
  | { readonly ok: false; readonly code: DirectoryCoverageQueryError };

/**
 * Explicit scopes that can cover a catalogue area.
 * A region needs the country, that region, and each province declared on its own.
 * A province needs the country, its parent region, and that province only.
 */
export function resolveDirectoryCoverageQuery(
  regionCode: string | undefined,
  provinceCode: string | undefined,
): DirectoryCoverageQuery {
  if (regionCode === undefined && provinceCode === undefined) return { ok: true, active: false };
  if (regionCode === undefined) return { ok: false, code: "COMPANY_DIRECTORY_REGION_REQUIRED" };
  const region = getRegion(regionCode);
  if (!region) return { ok: false, code: "INVALID_COMPANY_DIRECTORY_REGION" };
  if (provinceCode === undefined) {
    return {
      ok: true,
      active: true,
      scopes: [
        "MA",
        `R:${region.code}`,
        ...getProvincesByRegion(region.code).map((province) => `P:${province.code}`),
      ],
    };
  }
  const province = getProvince(provinceCode);
  if (!province || !isProvinceInRegion(provinceCode, region.code)) {
    return {
      ok: false,
      code: province ? "COMPANY_DIRECTORY_PROVINCE_REGION_MISMATCH" : "INVALID_COMPANY_DIRECTORY_PROVINCE",
    };
  }
  return { ok: true, active: true, scopes: ["MA", `R:${region.code}`, `P:${province.code}`] };
}

/**
 * Directory order is Company creation time, then Company id.
 * Company id order is not a substitute for creation time.
 */
export function compareCompaniesByDirectoryOrder(
  left: { readonly _creationTime: number; readonly _id: string },
  right: { readonly _creationTime: number; readonly _id: string },
  direction: "asc" | "desc",
): number {
  if (left._creationTime !== right._creationTime) {
    const ascending = left._creationTime < right._creationTime ? -1 : 1;
    return direction === "asc" ? ascending : -ascending;
  }
  if (left._id === right._id) return 0;
  const ascending = left._id < right._id ? -1 : 1;
  return direction === "asc" ? ascending : -ascending;
}

/** Validated explicit keys only. Missing and malformed declarations match nothing. */
export function explicitCoverageMatches(
  keys: readonly string[] | undefined,
  scopes: ReadonlySet<string>,
): boolean {
  const selected = validateCompanyCoverageScopes(keys ?? []);
  if (!selected.valid) return false;
  return selected.coverageScopeKeys.some((key) => scopes.has(key));
}

/** Public projection. Malformed stored keys become an empty declaration. */
export function publicCoverageScopeKeys(keys: readonly string[] | undefined): string[] {
  if (keys === undefined || keys.length === 0) return [];
  const selected = validateCompanyCoverageScopes(keys);
  return selected.valid ? [...selected.coverageScopeKeys] : [];
}

export function directoryCoverageFingerprint(input: {
  regionCode: string;
  provinceCode: string;
  search: string;
  city: string;
  service: string;
  verifiedOnly: boolean;
  sort: string;
}): string {
  return JSON.stringify([
    input.regionCode,
    input.provinceCode,
    input.search,
    input.city,
    input.service,
    input.verifiedOnly,
    input.sort,
  ]);
}
