import {
  MOROCCO_PROVINCES,
  MOROCCO_REGIONS,
  type ProvinceCode,
  type ProvinceDefinition,
  type RegionCode,
  type RegionDefinition,
} from "./morocco-data";

export { MOROCCO_CATALOGUE } from "./morocco-data";
export type { ProvinceCode, RegionCode } from "./morocco-data";

export type Region = Readonly<RegionDefinition & { code: RegionCode }>;
export type Province = Readonly<ProvinceDefinition & {
  code: ProvinceCode;
  regionCode: RegionCode;
}>;

export type AdministrativePairValidation =
  | { readonly valid: true; readonly region: Region; readonly province: Province }
  | {
      readonly valid: false;
      readonly error:
        | "INVALID_REGION_CODE"
        | "UNKNOWN_REGION_CODE"
        | "INVALID_PROVINCE_CODE"
        | "UNKNOWN_PROVINCE_CODE"
        | "PROVINCE_REGION_MISMATCH";
    };

function hasRegionCodeFormat(value: unknown): value is string {
  return typeof value === "string" && value.length === 2 && /^[0-9]{2}$/.test(value);
}

function hasProvinceCodeFormat(value: unknown): value is string {
  return typeof value === "string" && value.length === 6 && /^[0-9]{2}\.[0-9]{3}$/.test(value);
}

function hasName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Reference-definition integrity, O(R + P); not a project publication rule. */
export function assertAdministrativeCatalogueIntegrity(
  regions: readonly RegionDefinition[],
  provinces: readonly ProvinceDefinition[],
): void {
  const regionCodes = new Set<string>();
  for (const region of regions) {
    if (!hasRegionCodeFormat(region.code)) throw new Error("INVALID_REGION_CODE");
    if (regionCodes.has(region.code)) throw new Error("DUPLICATE_REGION_CODE");
    if (!hasName(region.nameFr) || !hasName(region.nameEn)) throw new Error("INVALID_REGION_NAME");
    regionCodes.add(region.code);
  }

  const provinceCodes = new Set<string>();
  for (const province of provinces) {
    if (!hasProvinceCodeFormat(province.code)) throw new Error("INVALID_PROVINCE_CODE");
    if (provinceCodes.has(province.code)) throw new Error("DUPLICATE_PROVINCE_CODE");
    if (!hasName(province.nameFr) || !hasName(province.nameEn)) throw new Error("INVALID_PROVINCE_NAME");
    if (province.kind !== "province" && province.kind !== "prefecture") throw new Error("INVALID_PROVINCE_KIND");
    if (!hasRegionCodeFormat(province.regionCode) || !regionCodes.has(province.regionCode)) {
      throw new Error("INVALID_PROVINCE_PARENT");
    }
    if (province.code.slice(0, 2) !== province.regionCode) throw new Error("PROVINCE_REGION_MISMATCH");
    provinceCodes.add(province.code);
  }
}

assertAdministrativeCatalogueIntegrity(MOROCCO_REGIONS, MOROCCO_PROVINCES);

// Never export mutable Maps. All referenced records and child arrays are frozen.
const regionByCode = new Map<RegionCode, Region>(MOROCCO_REGIONS.map((region) => [region.code, region]));
const provinceByCode = new Map<ProvinceCode, Province>(MOROCCO_PROVINCES.map((province) => [province.code, province]));
const provincesByRegion = (() => {
  const grouped = new Map<RegionCode, Province[]>(MOROCCO_REGIONS.map((region) => [region.code, []]));
  for (const province of MOROCCO_PROVINCES) {
    // Parent existence was checked before constructing the lookups.
    grouped.get(province.regionCode)!.push(province);
  }
  return new Map<RegionCode, readonly Province[]>(
    [...grouped].map(([code, provinces]) => [code, Object.freeze(provinces)]),
  );
})();
const emptyProvinces: readonly Province[] = Object.freeze([]);

export function getRegions(): readonly Region[] {
  return MOROCCO_REGIONS;
}

/** Canonical strings only: no padding, numeric coercion, label or alias matching. */
export function getRegion(code: unknown): Region | null {
  return hasRegionCodeFormat(code) ? regionByCode.get(code as RegionCode) ?? null : null;
}

export function getProvince(code: unknown): Province | null {
  return hasProvinceCodeFormat(code) ? provinceByCode.get(code as ProvinceCode) ?? null : null;
}

/** O(1) group retrieval; enumerating the returned K provinces costs O(K). */
export function getProvincesByRegion(regionCode: unknown): readonly Province[] {
  const region = getRegion(regionCode);
  return region ? provincesByRegion.get(region.code)! : emptyProvinces;
}

export function isValidRegion(code: unknown): code is RegionCode {
  return getRegion(code) !== null;
}

export function isValidProvince(code: unknown): code is ProvinceCode {
  return getProvince(code) !== null;
}

export function isProvinceInRegion(provinceCode: unknown, regionCode: unknown): boolean {
  const region = getRegion(regionCode);
  const province = getProvince(provinceCode);
  return region !== null && province !== null && province.regionCode === region.code;
}

/** Geography identity only; publication, privacy and coverage rules are separate. */
export function validateAdministrativePair(
  regionCode: unknown,
  provinceCode: unknown,
): AdministrativePairValidation {
  if (!hasRegionCodeFormat(regionCode)) return { valid: false, error: "INVALID_REGION_CODE" };
  const region = getRegion(regionCode);
  if (!region) return { valid: false, error: "UNKNOWN_REGION_CODE" };
  if (!hasProvinceCodeFormat(provinceCode)) return { valid: false, error: "INVALID_PROVINCE_CODE" };
  const province = getProvince(provinceCode);
  if (!province) return { valid: false, error: "UNKNOWN_PROVINCE_CODE" };
  if (province.regionCode !== region.code) return { valid: false, error: "PROVINCE_REGION_MISMATCH" };
  return { valid: true, region, province };
}
