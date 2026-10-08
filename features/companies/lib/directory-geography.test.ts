import { describe, expect, test } from "vitest";
import {
  changeDirectoryProvince,
  changeDirectoryRegion,
  directoryCoverageQuery,
  directoryProvinceOptions,
  directoryRegionOptions,
  initialDirectoryGeography,
} from "./directory-geography";
import { DIRECTORY_AUTOMATIC_PAGE_LIMIT, directoryAutomaticAdvance } from "./directory-pagination";

describe("directory geography filters", () => {
  test("starts on All Morocco and lists every region", () => {
    expect(directoryCoverageQuery(initialDirectoryGeography())).toEqual({});
    expect(directoryRegionOptions()).toHaveLength(12);
  });

  test("selecting a region clears the province and lists only that region's provinces", () => {
    const withProvince = changeDirectoryProvince(changeDirectoryRegion("09"), "09.541");
    expect(withProvince).toEqual({ regionCode: "09", provinceCode: "09.541" });
    const nextRegion = changeDirectoryRegion("01");
    expect(nextRegion.provinceCode).toBe("");
    expect(directoryProvinceOptions("09").map((province) => province.code)).toContain("09.541");
    expect(directoryProvinceOptions("09").some((province) => province.code === "01.511")).toBe(false);
    expect(directoryProvinceOptions("")).toEqual([]);
  });

  test("keeps a province only inside its parent region and ignores unknown codes", () => {
    const souss = changeDirectoryRegion("09");
    expect(changeDirectoryProvince(souss, "01.511")).toEqual(souss);
    expect(changeDirectoryRegion("not-a-region")).toEqual(initialDirectoryGeography());
    expect(directoryCoverageQuery({ regionCode: "09", provinceCode: "01.511" })).toEqual({ regionCode: "09" });
    expect(directoryCoverageQuery({ regionCode: "09", provinceCode: "09.541" })).toEqual({
      regionCode: "09",
      provinceCode: "09.541",
    });
  });
});

describe("sparse directory continuation", () => {
  test("advances an empty nonterminal page and stops after the bound or when results appear", () => {
    expect(directoryAutomaticAdvance({
      status: "CanLoadMore",
      visibleCount: 0,
      previousVisibleCount: 0,
      automaticAdvances: 0,
    })).toBe(true);
    expect(directoryAutomaticAdvance({
      status: "CanLoadMore",
      visibleCount: 0,
      previousVisibleCount: 0,
      automaticAdvances: DIRECTORY_AUTOMATIC_PAGE_LIMIT,
    })).toBe(false);
    expect(directoryAutomaticAdvance({
      status: "Exhausted",
      visibleCount: 0,
      previousVisibleCount: 0,
      automaticAdvances: 0,
    })).toBe(false);
    expect(directoryAutomaticAdvance({
      status: "CanLoadMore",
      visibleCount: 2,
      previousVisibleCount: 0,
      automaticAdvances: 0,
    })).toBe(false);
    expect(directoryAutomaticAdvance({
      status: "LoadingMore",
      visibleCount: 0,
      previousVisibleCount: 0,
      automaticAdvances: 1,
    })).toBe(false);
  });
});
