import { describe, expect, test } from "vitest";
import { getProvincesByRegion } from "./morocco";
import {
  compareCompaniesByDirectoryOrder,
  directoryCoverageFingerprint,
  explicitCoverageMatches,
  publicCoverageScopeKeys,
  resolveDirectoryCoverageQuery,
} from "./directory-coverage";

describe("directory coverage scope resolution", () => {
  test("leaves an unfiltered directory query unchanged", () => {
    expect(resolveDirectoryCoverageQuery(undefined, undefined)).toEqual({ ok: true, active: false });
  });

  test("builds a Souss-Massa region from explicit country, region and province scopes", () => {
    const resolved = resolveDirectoryCoverageQuery("09", undefined);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok || !resolved.active) return;
    const provinces = getProvincesByRegion("09").map((province) => `P:${province.code}`);
    expect(resolved.scopes).toEqual(["MA", "R:09", ...provinces]);
    expect(resolved.scopes).toContain("P:09.541");
    expect(resolved.scopes).toContain("P:09.001");
    expect(resolved.scopes).not.toContain("P:01.511");
  });

  test("builds a Taroudannt query from country, parent region and that province only", () => {
    expect(resolveDirectoryCoverageQuery("09", "09.541")).toEqual({
      ok: true,
      active: true,
      scopes: ["MA", "R:09", "P:09.541"],
    });
  });

  test.each([
    [undefined, "09.541", "COMPANY_DIRECTORY_REGION_REQUIRED"],
    ["99", undefined, "INVALID_COMPANY_DIRECTORY_REGION"],
    ["9", undefined, "INVALID_COMPANY_DIRECTORY_REGION"],
    ["", undefined, "INVALID_COMPANY_DIRECTORY_REGION"],
    ["09", "09.999", "INVALID_COMPANY_DIRECTORY_PROVINCE"],
    ["09", "09541", "INVALID_COMPANY_DIRECTORY_PROVINCE"],
    ["09", "01.511", "COMPANY_DIRECTORY_PROVINCE_REGION_MISMATCH"],
  ] as const)("rejects region %s province %s", (regionCode, provinceCode, code) => {
    expect(resolveDirectoryCoverageQuery(regionCode, provinceCode)).toEqual({ ok: false, code });
  });

  test("orders by creation time when company ids run the other way", () => {
    const older = { _creationTime: 10, _id: "zzzz-later-id" };
    const newer = { _creationTime: 20, _id: "aaaa-earlier-id" };
    const byCreation = [newer, older].sort((left, right) => compareCompaniesByDirectoryOrder(left, right, "desc"));
    const byId = [newer, older].sort((left, right) => left._id < right._id ? 1 : -1);
    expect(byCreation.map((company) => company._id)).toEqual(["aaaa-earlier-id", "zzzz-later-id"]);
    expect(byId.map((company) => company._id)).toEqual(["zzzz-later-id", "aaaa-earlier-id"]);
    expect(byCreation.map((company) => company._id)).not.toEqual(byId.map((company) => company._id));
  });

  test("matches only explicit validated keys and publishes an empty declaration when keys are malformed", () => {
    const souss = new Set(["MA", "R:09", "P:09.541", "P:09.001"]);
    expect(explicitCoverageMatches(undefined, souss)).toBe(false);
    expect(explicitCoverageMatches([], souss)).toBe(false);
    expect(explicitCoverageMatches(["P:09.541"], souss)).toBe(true);
    expect(explicitCoverageMatches(["P:01.511"], souss)).toBe(false);
    expect(explicitCoverageMatches(["MA", "NOT-A-SCOPE"], souss)).toBe(false);
    expect(explicitCoverageMatches(["MA", "MA"], souss)).toBe(false);
    expect(publicCoverageScopeKeys(undefined)).toEqual([]);
    expect(publicCoverageScopeKeys(["P:09.541", "MA"])).toEqual(["P:09.541", "MA"]);
    expect(publicCoverageScopeKeys(["MA", "NOT-A-SCOPE"])).toEqual([]);
    expect(directoryCoverageFingerprint({
      regionCode: "09", provinceCode: "", search: "", city: "", service: "", verifiedOnly: false, sort: "newest",
    })).not.toBe(directoryCoverageFingerprint({
      regionCode: "09", provinceCode: "09.541", search: "", city: "", service: "", verifiedOnly: false, sort: "newest",
    }));
  });
});
