import { getProvince, getProvincesByRegion, getRegion, getRegions, type ProvinceCode, type RegionCode } from "./morocco";

export type CoverageScopeKey = "MA" | `R:${RegionCode}` | `P:${ProvinceCode}`;

/** Country + all regions + all provinces/prefectures; derived from the GEO1 catalogue. */
export const MAX_COMPANY_COVERAGE_SCOPES = 1 + getRegions().length +
  getRegions().reduce((count, region) => count + getProvincesByRegion(region.code).length, 0);

export type CompanyCoverageValidation =
  | { readonly valid: true; readonly coverageScopeKeys: CoverageScopeKey[] }
  | { readonly valid: false; readonly error:
      "COMPANY_COVERAGE_LIMIT_EXCEEDED" | "INVALID_COMPANY_COVERAGE_SCOPE" | "DUPLICATE_COMPANY_COVERAGE_SCOPE" };

/** Canonical identifiers only. No trimming, aliases, padding or geographic expansion. */
export function isCompanyCoverageScopeKey(value: unknown): value is CoverageScopeKey {
  if (value === "MA") return true;
  if (typeof value !== "string") return false;
  if (value.length === 4 && value.startsWith("R:")) return getRegion(value.slice(2)) !== null;
  if (value.length === 8 && value.startsWith("P:")) return getProvince(value.slice(2)) !== null;
  return false;
}

/** O(S) validation. Keep explicit overlaps and caller order; reject duplicate keys. */
export function validateCompanyCoverageScopes(keys: readonly string[]): CompanyCoverageValidation {
  if (keys.length > MAX_COMPANY_COVERAGE_SCOPES) return { valid: false, error: "COMPANY_COVERAGE_LIMIT_EXCEEDED" };
  const seen = new Set<string>();
  const coverageScopeKeys: CoverageScopeKey[] = [];
  for (const key of keys) {
    if (!isCompanyCoverageScopeKey(key)) return { valid: false, error: "INVALID_COMPANY_COVERAGE_SCOPE" };
    if (seen.has(key)) return { valid: false, error: "DUPLICATE_COMPANY_COVERAGE_SCOPE" };
    seen.add(key);
    coverageScopeKeys.push(key);
  }
  return { valid: true, coverageScopeKeys };
}

/**
 * Structured Moroccan areas only; missing/mismatched parents fail closed.
 * City is deliberately not an input. This helper supplies no authorization.
 * Build the Company's Set once, then check at most three scopes per project.
 */
export function companyCoverageIncludesProjectArea(
  coverage: ReadonlySet<string>,
  project: { regionCode?: string | null; provinceCode?: string | null },
): boolean {
  const region = getRegion(project.regionCode);
  const province = getProvince(project.provinceCode);
  if (!region || !province || province.regionCode !== region.code) return false;
  return coverage.has("MA") || coverage.has(`R:${region.code}`) || coverage.has(`P:${province.code}`);
}
