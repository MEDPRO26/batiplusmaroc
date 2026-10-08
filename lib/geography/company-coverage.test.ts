import { describe, expect, test } from "vitest";
import {
  companyCoverageIncludesProjectArea,
  isCompanyCoverageScopeKey,
  MAX_COMPANY_COVERAGE_SCOPES,
  validateCompanyCoverageScopes,
} from "./company-coverage";
import { getProvincesByRegion, getRegions } from "./morocco";

const regions = getRegions();
const provinces = regions.flatMap((region) => [...getProvincesByRegion(region.code)]);
const allScopes = ["MA", ...regions.map((region) => `R:${region.code}`), ...provinces.map((province) => `P:${province.code}`)];
const taroudannt = { regionCode: "09", provinceCode: "09.541" };

describe("GEO7 canonical Company declarations", () => {
  test.each([
    { label: "national", keys: ["MA"] },
    { label: "one region", keys: ["R:09"] },
    { label: "multiple regions", keys: ["R:01", "R:09"] },
    { label: "one province", keys: ["P:09.541"] },
    { label: "multiple provinces", keys: ["P:01.511", "P:09.541"] },
    { label: "mixed, overlapping scopes", keys: ["P:09.541", "R:09", "MA", "R:01"] },
    { label: "unconfigured", keys: [] },
  ])("accepts $label without inference or reordering", ({ keys }) => {
    const input = Object.freeze([...keys]);
    const result = validateCompanyCoverageScopes(input);
    expect(result).toEqual({ valid: true, coverageScopeKeys: keys });
    if (result.valid) expect(result.coverageScopeKeys).not.toBe(input);
    expect(input).toEqual(keys);
  });

  test("derives the bound from all HCP codes and accepts every distinct canonical scope", () => {
    expect(MAX_COMPANY_COVERAGE_SCOPES).toBe(1 + regions.length + provinces.length);
    expect(MAX_COMPANY_COVERAGE_SCOPES).toBe(88);
    expect(new Set(allScopes).size).toBe(MAX_COMPANY_COVERAGE_SCOPES);
    expect(allScopes.every(isCompanyCoverageScopeKey)).toBe(true);
    expect(validateCompanyCoverageScopes(allScopes)).toEqual({ valid: true, coverageScopeKeys: allScopes });
  });

  test.each([
    "", "ma", "MA ", "MA:", "R:9", "R:00", "R:99", "R: 09", "r:09", "region:09",
    "R:０９", "R:09\n", "P:9.541", "P:09.54", "P:09-541", "P:09.000", "P:99.999",
    "P:09.541 ", "p:09.541", "P:Taroudannt", "Souss-Massa", "agadir", "P:09.541\u0000",
  ])("rejects noncanonical or unknown scope %j", (key) => {
    expect(isCompanyCoverageScopeKey(key)).toBe(false);
    expect(validateCompanyCoverageScopes([key])).toEqual({ valid: false, error: "INVALID_COMPANY_COVERAGE_SCOPE" });
  });

  test.each([null, undefined, 9, {}, ["MA"]])("rejects a nonstring identifier %j", (key) => {
    expect(isCompanyCoverageScopeKey(key)).toBe(false);
  });

  test.each(["MA", "R:09", "P:09.541"])("rejects duplicate %s even among valid overlaps", (key) => {
    expect(validateCompanyCoverageScopes([key, key])).toEqual({ valid: false, error: "DUPLICATE_COMPANY_COVERAGE_SCOPE" });
  });

  test("checks array length before reading identifiers", () => {
    const oversized = new Proxy(new Array<string>(MAX_COMPANY_COVERAGE_SCOPES + 1), {
      get(target, property, receiver) {
        if (property !== "length") throw new Error("Identifiers must not be processed");
        return Reflect.get(target, property, receiver);
      },
    });
    expect(validateCompanyCoverageScopes(oversized)).toEqual({ valid: false, error: "COMPANY_COVERAGE_LIMIT_EXCEEDED" });
    expect(validateCompanyCoverageScopes([...allScopes, "MA"])).toEqual({ valid: false, error: "COMPANY_COVERAGE_LIMIT_EXCEEDED" });
  });
});

describe("GEO7 pure project-area matching", () => {
  test("national coverage matches every valid Moroccan province", () => {
    const coverage = new Set(["MA"]);
    for (const province of provinces) {
      expect(companyCoverageIncludesProjectArea(coverage, { regionCode: province.regionCode, provinceCode: province.code })).toBe(true);
    }
  });

  test("a complete region matches all its provinces and excludes other regions", () => {
    const coverage = new Set(["R:09"]);
    for (const province of provinces) {
      expect(companyCoverageIncludesProjectArea(coverage, { regionCode: province.regionCode, provinceCode: province.code }))
        .toBe(province.regionCode === "09");
    }
  });

  test("one province does not imply its siblings or the whole region", () => {
    const coverage = new Set(["P:09.541"]);
    for (const province of provinces) {
      expect(companyCoverageIncludesProjectArea(coverage, { regionCode: province.regionCode, provinceCode: province.code }))
        .toBe(province.code === "09.541");
    }
  });

  test("mixed scopes match the union of explicit declarations", () => {
    const coverage = new Set(["R:01", "P:09.541"]);
    for (const province of provinces) {
      expect(companyCoverageIncludesProjectArea(coverage, { regionCode: province.regionCode, provinceCode: province.code }))
        .toBe(province.regionCode === "01" || province.code === "09.541");
    }
  });

  test("empty declarations do not match even the headquarters province", () => {
    expect(companyCoverageIncludesProjectArea(new Set(), taroudannt)).toBe(false);
  });

  test.each([
    {}, { regionCode: "09" }, { provinceCode: "09.541" },
    { regionCode: "01", provinceCode: "09.541" },
    { regionCode: "99", provinceCode: "09.541" },
    { regionCode: "09", provinceCode: "09.000" },
    { regionCode: null, provinceCode: null },
    { regionCode: "9", provinceCode: "9.541" },
  ])("fails closed for an incomplete or invalid structured pair %j", (project) => {
    expect(companyCoverageIncludesProjectArea(new Set(["MA", "R:09", "P:09.541"]), project)).toBe(false);
  });

  test("never uses stale city labels or legacy service-area keys", () => {
    const legacyProject = { city: "agadir", regionCode: undefined, provinceCode: undefined };
    expect(companyCoverageIncludesProjectArea(new Set(["MA"]), legacyProject)).toBe(false);
    const structuredProject = { ...taroudannt, city: "rabat" };
    expect(companyCoverageIncludesProjectArea(new Set(["R:04", "agadir"]), structuredProject)).toBe(false);
    expect(companyCoverageIncludesProjectArea(new Set(["P:09.541"]), structuredProject)).toBe(true);
  });
});
