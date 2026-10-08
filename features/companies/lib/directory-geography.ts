import { getProvincesByRegion, getRegion, getRegions, isProvinceInRegion } from "@/lib/geography/morocco";

export type DirectoryGeography = {
  readonly regionCode: string;
  readonly provinceCode: string;
};

export function initialDirectoryGeography(): DirectoryGeography {
  return { regionCode: "", provinceCode: "" };
}

/** A new region drops the previous province. Unknown codes return All Morocco. */
export function changeDirectoryRegion(regionCode: string): DirectoryGeography {
  return getRegion(regionCode) ? { regionCode, provinceCode: "" } : initialDirectoryGeography();
}

/** A province is kept only when it belongs to the selected region. */
export function changeDirectoryProvince(
  geography: DirectoryGeography,
  provinceCode: string,
): DirectoryGeography {
  if (!provinceCode) return { regionCode: geography.regionCode, provinceCode: "" };
  if (!isProvinceInRegion(provinceCode, geography.regionCode)) return geography;
  return { regionCode: geography.regionCode, provinceCode };
}

/** Only catalogue codes are sent. All Morocco omits both arguments. */
export function directoryCoverageQuery(geography: DirectoryGeography): {
  regionCode?: string;
  provinceCode?: string;
} {
  const region = getRegion(geography.regionCode);
  if (!region) return {};
  if (!geography.provinceCode) return { regionCode: region.code };
  if (!isProvinceInRegion(geography.provinceCode, region.code)) return { regionCode: region.code };
  return { regionCode: region.code, provinceCode: geography.provinceCode };
}

export function directoryRegionOptions() {
  return getRegions();
}

export function directoryProvinceOptions(regionCode: string) {
  return getProvincesByRegion(regionCode);
}
