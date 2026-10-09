import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { CompanyOnboardingHeadquarters } from "./components/company-onboarding-headquarters";
import { onboardingHeadquarters } from "./lib/onboarding-headquarters";
import { describeAppError } from "@/lib/errors/map-app-error";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";
import type { CompanyHeadquartersInput } from "@/lib/geography/company-headquarters";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const empty = { regionCode: null, provinceCode: null, communeName: null };
const saved = { regionCode: "09", provinceCode: "09.001", communeName: "Agadir Centre" };
function render(locale: "fr" | "en", options: { snapshot?: CompanyHeadquartersInput; required?: boolean; supported?: boolean; fieldError?: { name: string; message: string } } = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}>
      <CompanyOnboardingHeadquarters id="hq" snapshot={options.snapshot ?? empty} required={options.required ?? true} supported={options.supported ?? true} fieldClass="field" fieldError={options.fieldError ?? null} />
    </NextIntlClientProvider>,
  );
}
function form(values: Partial<Record<"regionCode" | "provinceCode" | "communeName", string>> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("HQ2 localized native headquarters controls", () => {
  for (const locale of ["fr", "en"] as const) {
    const messages = locale === "fr" ? fr : en;
    test(`${locale}: country is fixed, all 12 localized regions are selectable, commune is optional`, () => {
      const html = render(locale);
      expect(html).toContain(`value="${messages.auth.companyOnboarding.headquarters.morocco}"`);
      expect(html).toContain('readOnly=""'); expect(html).not.toContain('name="country"');
      expect(html.match(/<select/g)).toHaveLength(2); expect(html.match(/required=""/g)).toHaveLength(2);
      expect(getRegions()).toHaveLength(12);
      for (const region of getRegions()) {
        expect(html).toContain(`<option value="${region.code}">${locale === "fr" ? region.nameFr : region.nameEn}</option>`);
      }
      expect(html).toContain(messages.auth.companyOnboarding.headquarters.commune);
      expect(html).toMatch(/<input[^>]*maxLength="100"[^>]*name="communeName"/);
    });
    test(`${locale}: province is disabled until a region, existing values preload only its children`, () => {
      expect(render(locale)).toMatch(/<select[^>]*disabled=""[^>]*name="provinceCode"/);
      const html = render(locale, { snapshot: saved });
      expect(html).toContain('value="09" selected=""'); expect(html).toContain('value="09.001" selected=""');
      expect(html).toContain('value="Agadir Centre"');
      for (const province of getProvincesByRegion("09")) expect(html).toContain(`value="${province.code}"`);
      expect(html).not.toContain(`value="${getProvincesByRegion("06")[0].code}"`);
      expect(html).not.toMatch(/<select[^>]*disabled=""/);
    });
    test(`${locale}: legacy controls are optional and old backend controls cannot submit unsupported arguments`, () => {
      expect(render(locale, { required: false })).not.toContain('required=""');
      const html = render(locale, { required: false, supported: false });
      expect(html.match(/disabled=""/g)).toHaveLength(3);
      expect(html).toContain(messages.auth.companyOnboarding.headquarters.unavailable);
      expect(onboardingHeadquarters(form(saved), false, false)).toEqual({ ok: true, headquarters: undefined });
    });
    test(`${locale}: field-level errors have accessible labels, invalid state, description and live feedback`, () => {
      const error = messages.ux.error.codes.COMPANY_HEADQUARTERS_PROVINCE_REQUIRED;
      const html = render(locale, { snapshot: saved, fieldError: { name: "provinceCode", message: error } });
      expect(html).toContain('for="hq-provinceCode"');
      expect(html).toContain('aria-describedby="hq-provinceCode-hint hq-provinceCode-error" aria-invalid="true"');
      expect(html).toContain('id="hq-provinceCode-error" role="alert"'); expect(html).toContain(error);
    });
  }
  test("both locale contracts contain every headquarters label and domain error", () => {
    expect(Object.keys(fr.auth.companyOnboarding.headquarters).sort()).toEqual(Object.keys(en.auth.companyOnboarding.headquarters).sort());
    for (const code of ["COMPANY_HEADQUARTERS_REGION_REQUIRED", "COMPANY_HEADQUARTERS_PROVINCE_REQUIRED", "INVALID_COMPANY_HEADQUARTERS_REGION", "INVALID_COMPANY_HEADQUARTERS_PROVINCE", "COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH", "INVALID_COMPANY_HEADQUARTERS_COMMUNE", "COMPANY_HEADQUARTERS_POLICY_UNAVAILABLE"] as const) {
      expect(fr.ux.error.codes[code]).not.toBe(""); expect(en.ux.error.codes[code]).not.toBe("");
      expect(describeAppError(new Error(code))).toMatchObject({ code, messageKey: `error.codes.${code}` });
    }
  });
});

describe("HQ2 submission snapshots", () => {
  test("legacy blank snapshot is valid, new Company blank snapshot requires a region", () => {
    expect(onboardingHeadquarters(form(), true, false)).toEqual({ ok: true, headquarters: empty });
    expect(onboardingHeadquarters(form(), true, true)).toEqual({ ok: false, error: "COMPANY_HEADQUARTERS_REGION_REQUIRED" });
    expect(onboardingHeadquarters(form(), false, true)).toEqual({ ok: false, error: "COMPANY_HEADQUARTERS_POLICY_UNAVAILABLE" });
  });
  test.each([true, false])("required=%s rejects incomplete pairs before mutation", required => {
    expect(onboardingHeadquarters(form({ regionCode: "09" }), true, required)).toEqual({ ok: false, error: "COMPANY_HEADQUARTERS_PROVINCE_REQUIRED" });
    expect(onboardingHeadquarters(form({ provinceCode: "09.001" }), true, required)).toEqual({ ok: false, error: "COMPANY_HEADQUARTERS_REGION_REQUIRED" });
    expect(onboardingHeadquarters(form({ communeName: "Agadir" }), true, required)).toEqual({ ok: false, error: "COMPANY_HEADQUARTERS_REGION_REQUIRED" });
  });
  test.each([
    [{ regionCode: "99", provinceCode: "09.001" }, "INVALID_COMPANY_HEADQUARTERS_REGION"],
    [{ regionCode: "09", provinceCode: "09.999" }, "INVALID_COMPANY_HEADQUARTERS_PROVINCE"],
    [{ regionCode: "09", provinceCode: getProvincesByRegion("06")[0].code }, "COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH"],
    [{ ...saved, communeName: "a".repeat(101) }, "INVALID_COMPANY_HEADQUARTERS_COMMUNE"],
    [{ ...saved, communeName: "Agadir\t" }, "INVALID_COMPANY_HEADQUARTERS_COMMUNE"],
  ] as const)("invalid %j maps to %s without a malformed partial payload", (values, code) => {
    expect(onboardingHeadquarters(form(values), true, true)).toEqual({ ok: false, error: code });
    expect(describeAppError(new Error(code)).field).toMatch(/regionCode|provinceCode|communeName/);
  });
  test("optional commune normalizes exactly as HQ1 and no coverage or policy data enters the payload", () => {
    expect(onboardingHeadquarters(form({ regionCode: "09", provinceCode: "09.001" }), true, true)).toEqual({ ok: true, headquarters: { ...saved, communeName: null } });
    const data = form({ ...saved, communeName: "  Agadir\u00a0 Centre  " });
    data.set("coverageScopeKeys", "MA"); data.set("headquartersPolicyVersion", "legacy"); data.set("country", "FR");
    expect(onboardingHeadquarters(data, true, true)).toEqual({ ok: true, headquarters: saved });
  });
});
