import { describe, expect, test, vi } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { projectCities } from "../../convex/projects/constants";
import {
  formatProjectLocation, LEGACY_CITY_CODES, toDetailedProjectLocation, toGeneralProjectLocation,
  type LegacyCityCode, type RecordedProjectLocation,
} from "./project-location";

const rural = Object.freeze({
  regionCode: "05", provinceCode: "05.081", communeName: " Aït   Tamlil — آيت تامليل ",
  localityName: "PRIVATE_DOUAR_ⵜⴰⵎⵍⵉⵍ", neighborhood: "PRIVATE_NEIGHBORHOOD", exactAddress: "PRIVATE_ADDRESS",
});
function labels(locale: "fr" | "en") {
  const messages = locale === "fr" ? fr : en;
  return {
    unspecified: messages.projectLocation.unspecified,
    legacyCity: (code: LegacyCityCode) => messages.projectWizard.cityOptions[code],
  };
}

describe("pure project location projections", () => {
  test("legacy display keys match the historical city validator without administrative inference", () => {
    expect(LEGACY_CITY_CODES).toEqual(projectCities);
    expect(toGeneralProjectLocation({ city: "agadir" })).toEqual({
      regionCode: null, provinceCode: null, communeName: null, legacyCity: "agadir",
    });
  });

  test("general rural and mixed projections explicitly omit every private field", () => {
    for (const record of [rural, { ...rural, city: "rabat" }]) {
      const location = toGeneralProjectLocation(record);
      expect(Object.keys(location).sort()).toEqual(["communeName", "legacyCity", "provinceCode", "regionCode"]);
      expect(location).toMatchObject({ regionCode: "05", provinceCode: "05.081", communeName: rural.communeName });
      expect(JSON.stringify(location)).not.toContain("PRIVATE_");
    }
  });

  test("detailed projections preserve recorded spelling, codes and legacy values without addresses", () => {
    expect(toDetailedProjectLocation({ ...rural, city: "rabat" })).toEqual({
      regionCode: "05", provinceCode: "05.081", communeName: rural.communeName, legacyCity: "rabat",
      localityName: rural.localityName, neighborhood: rural.neighborhood,
    });
    expect(rural.communeName).toBe(" Aït   Tamlil — آيت تامليل ");
  });

  test.each([
    {}, { regionCode: "99", provinceCode: "99.999", city: "unknown historical city" },
    { regionCode: "constructor", provinceCode: "__proto__", city: "constructor" },
    { regionCode: 5, provinceCode: 5.081, communeName: null, city: null } as unknown as RecordedProjectLocation,
  ])("handles missing or unknown historical fields without coercion: %j", (record) => {
    expect(toGeneralProjectLocation(record)).toEqual({
      regionCode: null, provinceCode: null, communeName: null, legacyCity: null,
    });
  });

  test("does not present an inconsistent parent pair or derive a missing region", () => {
    expect(toGeneralProjectLocation({ regionCode: "05", provinceCode: "01.511" })).toMatchObject({ regionCode: "05", provinceCode: null });
    expect(toGeneralProjectLocation({ provinceCode: "05.081" })).toMatchObject({ regionCode: null, provinceCode: "05.081" });
    expect(toDetailedProjectLocation({ regionCode: "05", provinceCode: "01.511" })).toMatchObject({ regionCode: "05", provinceCode: "01.511" });
  });
});

describe.each(["fr", "en"] as const)("%s location formatting", (locale) => {
  test("formats structured-only and mixed records with catalogue proper names and Unicode", () => {
    for (const record of [rural, { ...rural, city: "rabat" }]) {
      expect(formatProjectLocation(toGeneralProjectLocation(record), locale, labels(locale)))
        .toBe("Béni Mellal-Khénifra · Azilal · Aït Tamlil — آيت تامليل");
    }
  });

  test.each(LEGACY_CITY_CODES)("formats only the known legacy %s key", (city) => {
    expect(formatProjectLocation(toGeneralProjectLocation({ city }), locale, labels(locale)))
      .toBe(labels(locale).legacyCity(city));
  });

  test("detailed formatting retains locality and historical neighborhood when supplied by an authorized projection", () => {
    expect(formatProjectLocation(toDetailedProjectLocation({ city: "rabat", neighborhood: "Agdal" }), locale, labels(locale)))
      .toBe("Rabat · Agdal");
    expect(formatProjectLocation(toDetailedProjectLocation(rural), locale, labels(locale))).toContain(rural.localityName);
  });

  test("unknown codes use translated fallback labels without becoming translation keys or raw display text", () => {
    const legacyCity = vi.fn(() => { throw new Error("Unknown historical text must not reach a translation key"); });
    const location = toDetailedProjectLocation({ regionCode: "PRIVATE_REGION", provinceCode: "PRIVATE_PROVINCE", city: "PRIVATE_CITY" });
    expect(formatProjectLocation(location, locale, { ...labels(locale), legacyCity })).toBe(labels(locale).unspecified);
    expect(legacyCity).not.toHaveBeenCalled();
  });

  test("free text is displayed directly and never translated as a key", () => {
    const legacyCity = vi.fn(labels(locale).legacyCity);
    const location = toGeneralProjectLocation({ communeName: "cityOptions.آيت ⵜⴰⵎⵍⵉⵍ" });
    expect(formatProjectLocation(location, locale, { ...labels(locale), legacyCity })).toBe("cityOptions.آيت ⵜⴰⵎⵍⵉⵍ");
    expect(legacyCity).not.toHaveBeenCalled();
  });

  test("incomplete/mismatched records remain readable with safe administrative labels", () => {
    expect(formatProjectLocation(toDetailedProjectLocation({ regionCode: "05", provinceCode: "01.511" }), locale, labels(locale)))
      .toBe("Béni Mellal-Khénifra");
    expect(formatProjectLocation(toGeneralProjectLocation({ provinceCode: "05.081" }), locale, labels(locale))).toBe("Azilal");
    expect(formatProjectLocation(toGeneralProjectLocation({}), locale, labels(locale))).toBe(labels(locale).unspecified);
  });
});
