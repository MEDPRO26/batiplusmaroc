import { describe, expect, test } from "vitest";
import reference from "./fixtures/hcp-rgph-2024.json";
import { MOROCCO_PROVINCES, MOROCCO_REGIONS, type ProvinceDefinition, type RegionDefinition } from "./morocco-data";
import {
  MOROCCO_CATALOGUE,
  assertAdministrativeCatalogueIntegrity,
  getProvince,
  getProvincesByRegion,
  getRegion,
  getRegions,
  isProvinceInRegion,
  isValidProvince,
  isValidRegion,
  validateAdministrativePair,
} from "./morocco";

// Expected membership comes from the HCP workbook, not the production catalogue.
function properName(label: string): string {
  return label.replace(/^(?:Région|Province|Préfecture) (?:de l'|de |d')/u, "");
}

describe("HCP RGPH 2024 administrative completeness", () => {
  test("pins the authoritative reference and exact counts", () => {
    expect(MOROCCO_CATALOGUE).toMatchObject({
      countryCode: "MA",
      version: "hcp-rgph-2024-v1",
      sourceUrl: reference.sourceUrl,
      workbookUrl: reference.workbookUrl,
      workbookSha256: reference.workbookSha256,
      worksheet: reference.worksheet,
    });
    expect(reference.counts).toEqual({ regions: 12, provinces: 62, prefectures: 13 });
    expect(reference.regions).toHaveLength(12);
    expect(reference.provinces).toHaveLength(75);
    expect(getRegions()).toHaveLength(12);
    expect(MOROCCO_PROVINCES).toHaveLength(75);
    expect(MOROCCO_PROVINCES.filter((province) => province.kind === "province")).toHaveLength(62);
    expect(MOROCCO_PROVINCES.filter((province) => province.kind === "prefecture")).toHaveLength(13);
    expect(new Set(MOROCCO_REGIONS.map((region) => region.code)).size).toBe(12);
    expect(new Set(MOROCCO_PROVINCES.map((province) => province.code)).size).toBe(75);
  });

  test("matches complete code sets and deterministic source order", () => {
    expect(getRegions().map((region) => region.code)).toEqual(reference.regions.map((region) => region.code));
    expect(MOROCCO_PROVINCES.map((province) => province.code)).toEqual(reference.provinces.map((province) => province.code));
    expect(getRegions().map((region) => region.code)).toEqual([
      "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
    ]);
  });

  test.each(reference.regions)("resolves authoritative region $code", (expected) => {
    expect(getRegion(expected.code)).toEqual({
      code: expected.code,
      nameFr: properName(expected.label),
      nameEn: properName(expected.label),
    });
    expect(isValidRegion(expected.code)).toBe(true);
    const expectedChildren = reference.provinces.filter((province) => province.regionCode === expected.code);
    const children = getProvincesByRegion(expected.code);
    expect(children.map((province) => province.code)).toEqual(expectedChildren.map((province) => province.code));
    expect(getProvincesByRegion(expected.code)).toEqual(children);
    expect(children.every((province) => province.regionCode === expected.code)).toBe(true);
  });

  test.each(reference.provinces)("resolves authoritative $kind $code", (expected) => {
    const province = getProvince(expected.code);
    expect(province).toEqual({
      code: expected.code,
      regionCode: expected.regionCode,
      kind: expected.kind,
      nameFr: properName(expected.label),
      nameEn: properName(expected.label),
    });
    expect(isValidProvince(expected.code)).toBe(true);
    expect(getProvincesByRegion(expected.regionCode)).toContain(province);
    expect(validateAdministrativePair(expected.regionCode, expected.code)).toEqual({
      valid: true,
      region: getRegion(expected.regionCode),
      province,
    });

    // Exactly one of all authoritative regions can be this province's parent.
    const matchingParents = reference.regions.filter((region) => isProvinceInRegion(expected.code, region.code));
    expect(matchingParents.map((region) => region.code)).toEqual([expected.regionCode]);
    for (const other of reference.regions) {
      if (other.code !== expected.regionCode) {
        expect(validateAdministrativePair(other.code, expected.code)).toEqual({
          valid: false, error: "PROVINCE_REGION_MISMATCH",
        });
      }
    }
  });
});

describe("untrusted administrative codes", () => {
  const invalidCodes: readonly unknown[] = [
    undefined, null, false, 1, NaN, {}, [], Symbol("code"),
    "", " ", "1", "99", "00", "99.999", "00.000", " 01", "01 ", "01\n",
    "01.51", "01.511 ", "01511", "01-511", "01.511.01", "٠١", "０１",
    "٠١.٥١١", "Tanger-Assilah", "Tanger-Tétouan-Al Hoceima", "__proto__", "constructor",
    "1".repeat(10_000),
    { toString: () => { throw new Error("MUST_NOT_COERCE_INPUT"); } },
  ];

  test.each(invalidCodes.map((value) => ({ value })))("rejects unknown or malformed input %# without coercion", ({ value }) => {
    expect(getRegion(value)).toBeNull();
    expect(getProvince(value)).toBeNull();
    expect(isValidRegion(value)).toBe(false);
    expect(isValidProvince(value)).toBe(false);
    expect(getProvincesByRegion(value)).toEqual([]);
    expect(isProvinceInRegion(value, "01")).toBe(false);
    expect(isProvinceInRegion("01.511", value)).toBe(false);
    expect(validateAdministrativePair(value, "01.511").valid).toBe(false);
    expect(validateAdministrativePair("01", value).valid).toBe(false);
  });

  test.each([
    [undefined, "01.511", "INVALID_REGION_CODE"],
    ["1", "01.511", "INVALID_REGION_CODE"],
    ["99", "01.511", "UNKNOWN_REGION_CODE"],
    ["01", undefined, "INVALID_PROVINCE_CODE"],
    ["01", "01511", "INVALID_PROVINCE_CODE"],
    ["01", "01.999", "UNKNOWN_PROVINCE_CODE"],
    ["01", "02.411", "PROVINCE_REGION_MISMATCH"],
  ])("returns a machine error for pair %#", (region, province, error) => {
    expect(validateAdministrativePair(region, province)).toEqual({ valid: false, error });
  });

  test("does not treat a valid code for one level as a code for another", () => {
    expect(getRegion("01.511")).toBeNull();
    expect(getProvince("01")).toBeNull();
    expect(isProvinceInRegion("01", "01.511")).toBe(false);
  });
});

describe("catalogue integrity validation", () => {
  const region: RegionDefinition = { code: "01", nameFr: "Tanger-Tétouan-Al Hoceima", nameEn: "Tanger-Tétouan-Al Hoceima" };
  const province: ProvinceDefinition = { code: "01.511", regionCode: "01", kind: "prefecture", nameFr: "Tanger-Assilah", nameEn: "Tanger-Assilah" };
  const cases: { name: string; regions: readonly RegionDefinition[]; provinces: readonly ProvinceDefinition[]; error: string }[] = [
    { name: "duplicate region", regions: [region, region], provinces: [province], error: "DUPLICATE_REGION_CODE" },
    { name: "duplicate province", regions: [region], provinces: [province, province], error: "DUPLICATE_PROVINCE_CODE" },
    { name: "blank region code", regions: [{ ...region, code: " " }], provinces: [], error: "INVALID_REGION_CODE" },
    { name: "malformed region code", regions: [{ ...region, code: "1" }], provinces: [], error: "INVALID_REGION_CODE" },
    { name: "blank province code", regions: [region], provinces: [{ ...province, code: "" }], error: "INVALID_PROVINCE_CODE" },
    { name: "malformed province code", regions: [region], provinces: [{ ...province, code: "01511" }], error: "INVALID_PROVINCE_CODE" },
    { name: "empty French region name", regions: [{ ...region, nameFr: " " }], provinces: [], error: "INVALID_REGION_NAME" },
    { name: "empty English region name", regions: [{ ...region, nameEn: "" }], provinces: [], error: "INVALID_REGION_NAME" },
    { name: "empty French province name", regions: [region], provinces: [{ ...province, nameFr: "" }], error: "INVALID_PROVINCE_NAME" },
    { name: "empty English province name", regions: [region], provinces: [{ ...province, nameEn: "\t" }], error: "INVALID_PROVINCE_NAME" },
    { name: "missing parent", regions: [], provinces: [province], error: "INVALID_PROVINCE_PARENT" },
    { name: "unknown parent", regions: [region], provinces: [{ ...province, regionCode: "99" }], error: "INVALID_PROVINCE_PARENT" },
    { name: "blank parent", regions: [region], provinces: [{ ...province, regionCode: "" }], error: "INVALID_PROVINCE_PARENT" },
    { name: "malformed parent", regions: [region], provinces: [{ ...province, regionCode: "1" }], error: "INVALID_PROVINCE_PARENT" },
    { name: "wrong parent", regions: [region, { ...region, code: "02" }], provinces: [{ ...province, regionCode: "02" }], error: "PROVINCE_REGION_MISMATCH" },
    { name: "missing parent field", regions: [region], provinces: [{ ...province, regionCode: undefined } as unknown as ProvinceDefinition], error: "INVALID_PROVINCE_PARENT" },
    { name: "invalid administrative type", regions: [region], provinces: [{ ...province, kind: "district" } as unknown as ProvinceDefinition], error: "INVALID_PROVINCE_KIND" },
  ];

  test("accepts intact definitions", () => {
    expect(() => assertAdministrativeCatalogueIntegrity(MOROCCO_REGIONS, MOROCCO_PROVINCES)).not.toThrow();
    expect(() => assertAdministrativeCatalogueIntegrity([region], [province])).not.toThrow();
  });

  test.each(cases)("rejects $name", ({ regions, provinces, error }) => {
    expect(() => assertAdministrativeCatalogueIntegrity(regions, provinces)).toThrow(error);
  });
});

describe("immutable catalogue access", () => {
  test("prevents array and record mutations through every access path", () => {
    const regions = getRegions();
    const region = getRegion("01")!;
    const province = getProvince("01.511")!;
    const children = getProvincesByRegion("01");
    const empty = getProvincesByRegion("99");

    for (const value of [MOROCCO_CATALOGUE, MOROCCO_REGIONS, MOROCCO_PROVINCES, regions, region, province, children, empty]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => Array.prototype.pop.call(regions)).toThrow(TypeError);
    expect(() => Array.prototype.pop.call(children)).toThrow(TypeError);
    expect(() => Array.prototype.pop.call(MOROCCO_PROVINCES)).toThrow(TypeError);
    expect(() => Object.assign(region, { code: "99", nameFr: "Changed" })).toThrow(TypeError);
    expect(() => Object.assign(province, { regionCode: "02", nameEn: "Changed" })).toThrow(TypeError);
    expect(Reflect.set(children, "0", province)).toBe(false);
    expect(Reflect.deleteProperty(province, "code")).toBe(false);
    expect(Reflect.set(empty, "0", province)).toBe(false);

    const pair = validateAdministrativePair("01", "01.511");
    expect(pair.valid).toBe(true);
    if (pair.valid) {
      expect(pair.region).toBe(region);
      expect(pair.province).toBe(province);
      expect(() => Object.assign(pair.province, { nameFr: "Changed" })).toThrow(TypeError);
    }
    expect(getRegion("01")?.code).toBe("01");
    expect(getProvince("01.511")?.regionCode).toBe("01");
    expect(getProvincesByRegion("01").map((value) => value.code)).toEqual(
      reference.provinces.filter((value) => value.regionCode === "01").map((value) => value.code),
    );
    expect(getRegions()).toHaveLength(12);
    expect(MOROCCO_PROVINCES).toHaveLength(75);
  });
});
