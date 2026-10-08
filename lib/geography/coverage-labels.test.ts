import { describe, expect, test } from "vitest";
import { presentCoverageScopes } from "./coverage-labels";
import { getProvincesByRegion, getRegions } from "./morocco";

describe("coverage labels", () => {
  test("formats national, full-region and province declarations in French and English", () => {
    const keys = ["MA", "R:09", "P:09.541", "P:09.001"];
    const english = presentCoverageScopes(keys, "en");
    const french = presentCoverageScopes(keys, "fr");

    expect(english).toEqual([
      { key: "MA", kind: "national" },
      { key: "R:09", kind: "region", name: "Souss-Massa" },
      { key: "P:09.541", kind: "province", name: "Taroudannt" },
      { key: "P:09.001", kind: "prefecture", name: "Agadir-Ida-Ou-Tanane" },
    ]);
    expect(french[1]).toMatchObject({ kind: "region", name: "Souss-Massa" });
    expect(french[2]).toMatchObject({ kind: "province", name: "Taroudannt" });
    expect(english.map((label) => label.name).join(" ")).not.toMatch(/P:|R:/);
    expect(french.map((label) => label.name ?? "").join(" ")).not.toMatch(/P:|R:/);
  });

  test("keeps a province declaration distinct from its parent region", () => {
    const labels = presentCoverageScopes(["P:09.541"], "en");
    expect(labels).toEqual([{ key: "P:09.541", kind: "province", name: "Taroudannt" }]);
    expect(labels.some((label) => label.kind === "region")).toBe(false);
  });

  test("preserves explicit overlaps and drops malformed keys without throwing", () => {
    const labels = presentCoverageScopes(
      ["MA", "R:09", "R:09", "P:09.541", "P:99.999", "not-a-scope", "R:Souss"],
      "en",
    );
    expect(labels.map((label) => label.key)).toEqual(["MA", "R:09", "P:09.541"]);
  });

  test("treats missing and empty coverage as undeclared", () => {
    expect(presentCoverageScopes(undefined, "en")).toEqual([]);
    expect(presentCoverageScopes([], "fr")).toEqual([]);
    expect(presentCoverageScopes(["MA-wide"], "en")).toEqual([]);
  });

  test("can name every GEO1 region and its provinces", () => {
    expect(getRegions()).toHaveLength(12);
    for (const region of getRegions()) {
      const provinces = getProvincesByRegion(region.code);
      expect(provinces.length).toBeGreaterThan(0);
      const labels = presentCoverageScopes([`R:${region.code}`, ...provinces.map((province) => `P:${province.code}`)], "fr");
      expect(labels[0]).toMatchObject({ kind: "region", name: region.nameFr });
      expect(labels).toHaveLength(provinces.length + 1);
    }
  });
});
