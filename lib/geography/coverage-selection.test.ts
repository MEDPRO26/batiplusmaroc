import { describe, expect, test, vi } from "vitest";
import { getProvincesByRegion, getRegions } from "./morocco";
import {
  commitGeographicCoverage,
  coverageKind,
  coverageOverlap,
  coveragePlaceName,
  coverageSelectionsEqual,
  filterProvincesByName,
  provincesForBrowse,
  reconcileCoverageDraft,
  setCoverageSelection,
} from "./coverage-selection";

const souss = "R:09";
const rabatRegion = "R:04";
const taroudannt = "P:09.541";
const rabatPrefecture = "P:04.421";
const tanger = "P:01.511";

describe("GEO8.1 coverage selection", () => {
  test("keeps caller order and blocks duplicate keys with a Set", () => {
    expect(setCoverageSelection([], "MA", true)).toEqual(["MA"]);
    expect(setCoverageSelection(["MA"], "MA", false)).toEqual([]);
    expect(setCoverageSelection(["MA"], "MA", true)).toEqual(["MA"]);
    expect(setCoverageSelection([souss, taroudannt], souss, true)).toEqual([souss, taroudannt]);
    expect(setCoverageSelection(["MA", souss, "MA", taroudannt], "P:09.999", false)).toEqual(["MA", souss, taroudannt]);
  });

  test("selects several entire regions without adding their provinces", () => {
    const next = setCoverageSelection(setCoverageSelection([], souss, true), rabatRegion, true);
    expect(next).toEqual([souss, rabatRegion]);
    expect(next.some((key) => key.startsWith("P:"))).toBe(false);
  });

  test("selects provinces in different regions without implying the parent region", () => {
    const next = setCoverageSelection(setCoverageSelection([], taroudannt, true), rabatPrefecture, true);
    expect(next).toEqual([taroudannt, rabatPrefecture]);
    expect(next).not.toContain(souss);
    expect(next).not.toContain(rabatRegion);
    expect(coverageKind(taroudannt)).toBe("province");
    expect(coverageKind(rabatPrefecture)).toBe("prefecture");
    expect(coverageKind(souss)).toBe("region");
    expect(coverageKind("MA")).toBe("country");
  });

  test("preserves untouched keys when one selection is removed", () => {
    const start = ["MA", souss, taroudannt, rabatPrefecture];
    expect(setCoverageSelection(start, souss, false)).toEqual(["MA", taroudannt, rabatPrefecture]);
  });

  test("keeps valid overlaps and explains national or regional inclusion", () => {
    const overlapped = ["MA", souss, taroudannt];
    expect(setCoverageSelection(overlapped, rabatRegion, true)).toEqual([...overlapped, rabatRegion]);
    expect(coverageOverlap(overlapped)).toBe("national");
    expect(coverageOverlap(["MA"])).toBeNull();
    expect(coverageOverlap([souss, taroudannt])).toBe("regional");
    expect(coverageOverlap([taroudannt, tanger])).toBeNull();
    expect(coverageOverlap([])).toBeNull();
  });

  test("adopts a server snapshot only while the draft is clean", () => {
    const dirty = reconcileCoverageDraft([souss, taroudannt], [souss], ["MA"]);
    expect(dirty).toEqual({ draft: [souss, taroudannt], baseline: [souss] });
    const clean = reconcileCoverageDraft([souss], [souss], ["MA", rabatPrefecture]);
    expect(clean).toEqual({ draft: ["MA", rabatPrefecture], baseline: ["MA", rabatPrefecture] });
    expect(coverageSelectionsEqual(["MA", souss], ["MA", souss])).toBe(true);
    expect(coverageSelectionsEqual(["MA", souss], [souss, "MA"])).toBe(false);
  });

  test("browsing a region lists only that region's provinces", () => {
    expect(provincesForBrowse("")).toEqual([]);
    const soussProvinces = provincesForBrowse("09");
    expect(soussProvinces.length).toBeGreaterThan(0);
    expect(soussProvinces.every((province) => province.regionCode === "09")).toBe(true);
    expect(soussProvinces.some((province) => province.code === "09.541")).toBe(true);
    expect(provincesForBrowse("09").some((province) => province.regionCode === "04")).toBe(false);
    const filtered = filterProvincesByName(getProvincesByRegion("09"), "taroud", "en");
    expect(filtered.map((province) => province.code)).toEqual(["09.541"]);
    expect(filterProvincesByName(getProvincesByRegion("01"), "", "fr")).toHaveLength(getProvincesByRegion("01").length);
  });

  test("uses GEO1 codes and localized catalogue names", () => {
    expect(getRegions()).toHaveLength(12);
    expect(coveragePlaceName(souss, "fr")).toBe("Souss-Massa");
    expect(coveragePlaceName(taroudannt, "en")).toBe("Taroudannt");
    expect(coveragePlaceName("R:99", "en")).toBeNull();
    expect(coveragePlaceName("MA", "fr")).toBeNull();
  });

  test("sends the complete ordered replacement and can clear coverage", async () => {
    const update = vi.fn(async () => null);
    const keys = ["P:04.421", "R:09", "MA"];
    await expect(commitGeographicCoverage(keys, update)).resolves.toEqual({ ok: true, coverageScopeKeys: keys });
    expect(update).toHaveBeenCalledWith({ coverageScopeKeys: ["P:04.421", "R:09", "MA"] });
    update.mockClear();
    await expect(commitGeographicCoverage([], update)).resolves.toEqual({ ok: true, coverageScopeKeys: [] });
    expect(update).toHaveBeenCalledWith({ coverageScopeKeys: [] });
  });

  test("rejects duplicate or unknown keys before calling the mutation", async () => {
    const update = vi.fn(async () => null);
    const duplicate = ["R:09", "R:09"];
    const invalid = await commitGeographicCoverage(duplicate, update);
    expect(invalid).toEqual({ ok: false, reason: "invalid", error: "DUPLICATE_COMPANY_COVERAGE_SCOPE", coverageScopeKeys: duplicate });
    const unknown = await commitGeographicCoverage(["city:rabat"], update);
    expect(unknown).toMatchObject({ ok: false, reason: "invalid", error: "INVALID_COMPANY_COVERAGE_SCOPE" });
    expect(update).not.toHaveBeenCalled();
  });

  test("keeps the draft when the mutation fails", async () => {
    const draft = [souss, tanger];
    const cause = new Error("network down");
    const update = vi.fn(async () => {
      throw cause;
    });
    const result = await commitGeographicCoverage(draft, update);
    expect(result).toEqual({ ok: false, reason: "failed", cause, coverageScopeKeys: draft });
    expect(draft).toEqual([souss, tanger]);
  });
});
