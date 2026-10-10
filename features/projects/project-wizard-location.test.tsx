import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import { describeAppError } from "@/lib/errors";
import { getRegions } from "@/lib/geography/morocco";
import {
  applyProvinceChange,
  applyRegionChange,
  isWizardLocationComplete,
  locationFormFromDraft,
  locationStepTransition,
  prepareStructuredLocationSave,
  wizardReviewLocation,
  type LocationFormState,
} from "@/lib/geography/wizard-location";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }));
vi.mock("@/features/auth/components/onboarding-chrome", () => ({
  OnboardingChrome: () => null,
}));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "outfit" }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { ProjectLocationFields, wizardResumeStep } from "./components/project-wizard";

const souss: LocationFormState = {
  regionCode: "09",
  provinceCode: "09.541",
  communeName: "Commune rurale d’Aoulouz",
  localityName: "Douar Aït ⵜⴰⵎⵍⵉⵍ",
};

function labels(locale: "fr" | "en") {
  const messages = locale === "fr" ? fr : en;
  return {
    unspecified: messages.projectWizard.notProvided,
    incomplete: messages.projectWizard.review.locationIncomplete,
    unsaved: messages.projectWizard.review.locationUnsaved,
    legacyCity: (code: keyof typeof messages.projectWizard.cityOptions) =>
      messages.projectWizard.cityOptions[code],
  };
}

function translator(locale: "fr" | "en") {
  const root = (locale === "fr" ? fr : en).projectWizard;
  return (key: string, values?: Record<string, string | number>) => {
    const value = key.split(".").reduce<unknown>((node, part) => {
      if (!node || typeof node !== "object") return undefined;
      return (node as Record<string, unknown>)[part];
    }, root);
    if (typeof value !== "string") throw new Error(`Missing ${locale} projectWizard.${key}`);
    return value.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""));
  };
}

function renderLocation(locale: "fr" | "en", form: LocationFormState, legacyCityName: string | null = null) {
  const onError = vi.fn();
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} onError={onError}>
      <ProjectLocationFields
        fieldError={null}
        form={form}
        legacyCityName={legacyCityName}
        onCommuneChange={() => undefined}
        onLocalityChange={() => undefined}
        onProvinceChange={() => undefined}
        onRegionChange={() => undefined}
        t={translator(locale)}
      />
    </NextIntlClientProvider>,
  );
  expect(onError).not.toHaveBeenCalled();
  return html;
}

const details = {
  primaryCategory: "renovation" as const,
  customCategoryText: null,
  city: null,
  title: "Apartment renovation",
  propertyType: "apartment" as const,
  surface: null,
  surfaceUnknown: true,
  description: "Complete apartment renovation.",
  timeline: "flexible" as const,
};

describe("GEO5 location step", () => {
  test("offers all 12 regions as stable codes with localized names", () => {
    const html = renderLocation("fr", { regionCode: "", provinceCode: "", communeName: "", localityName: "" });
    expect(getRegions()).toHaveLength(12);
    for (const region of getRegions()) {
      expect(html).toContain(`value="${region.code}"`);
      expect(html).toContain(region.nameFr);
    }
    expect(html).toContain(fr.projectWizard.fields.regionPlaceholder);
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('name="regionCode"');
    expect(html).not.toContain('name="city"');
    expect(html).not.toContain('name="neighborhood"');
  });

  test("limits provinces to the selected region and explains a disabled province field", () => {
    const empty = renderLocation("en", { regionCode: "", provinceCode: "", communeName: "", localityName: "" });
    expect(empty).toContain("disabled");
    expect(empty).toContain('id="project-province-hint"');
    expect(empty).toContain(en.projectWizard.fields.provinceDisabled);
    expect(empty).not.toContain("Taroudannt");

    const html = renderLocation("en", { ...souss, provinceCode: "", communeName: "", localityName: "" });
    expect(html).toContain('value="09.541"');
    expect(html).toContain("Taroudannt");
    expect(html).toContain("Agadir-Ida-Ou-Tanane");
    expect(html).not.toContain('value="05.081"');
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("w-full");
    expect(html).toContain("focus:ring-brand");
    expect(html).toContain(en.projectWizard.locationPrivacy);
    expect(html).toContain(en.projectWizard.fields.communePlaceholder);
    expect(html).toContain(en.projectWizard.fields.locality);
  });

  test("shows a legacy city without turning it into a selectable catalogue", () => {
    const html = renderLocation("fr", { regionCode: "", provinceCode: "", communeName: "", localityName: "" }, "Agadir");
    expect(html).toContain("Agadir");
    expect(html).toContain(fr.projectWizard.locationPrivacy);
    expect(html).not.toContain('value="agadir"');
  });

  test("region and province changes drop dependent place names and reject a mismatched province", () => {
    const current = { ...souss };
    expect(applyRegionChange(current, "09")).toEqual(current);
    expect(applyRegionChange(current, "05")).toEqual({
      regionCode: "05",
      provinceCode: "",
      communeName: "",
      localityName: "",
    });
    expect(applyProvinceChange(current, "09.001")).toEqual({
      ...current,
      provinceCode: "09.001",
      communeName: "",
      localityName: "",
    });
    expect(applyProvinceChange(current, "05.081").provinceCode).toBe("");
    expect(locationFormFromDraft({
      regionCode: "09",
      provinceCode: "05.081",
      communeName: "Commune X",
      localityName: "Douar Y",
    })).toEqual({
      regionCode: "09",
      provinceCode: "",
      communeName: "Commune X",
      localityName: "Douar Y",
    });
  });

  test("submits HCP codes and Unicode locality text, with commune optional", () => {
    const saved = prepareStructuredLocationSave(souss, "continue");
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.payload).toEqual({
      regionCode: "09",
      provinceCode: "09.541",
      communeName: souss.communeName,
      localityName: "Douar Aït ⵜⴰⵎⵍⵉⵍ",
    });
    expect(saved.payload).not.toHaveProperty("city");
    const withoutCommune = prepareStructuredLocationSave({ ...souss, communeName: "  " }, "continue");
    expect(withoutCommune.ok && withoutCommune.payload.communeName).toBe(null);
    const arabic = prepareStructuredLocationSave({ ...souss, localityName: "  آيت\nتامليل  " }, "continue");
    expect(arabic.ok && arabic.payload.localityName).toBe("آيت تامليل");
  });

  test("requires region, province and locality to continue, and allows an incomplete draft", () => {
    const partial = { regionCode: "09", provinceCode: "09.541", communeName: "", localityName: "" };
    const blocked = prepareStructuredLocationSave(partial, "continue");
    expect(blocked).toMatchObject({ ok: false, field: "localityName", messageKey: "validation.locality" });
    const draft = prepareStructuredLocationSave(partial, "draft");
    expect(draft.ok && draft.payload).toEqual({
      regionCode: "09",
      provinceCode: "09.541",
      communeName: null,
      localityName: null,
    });
    expect(prepareStructuredLocationSave({ ...partial, regionCode: "", provinceCode: "" }, "continue")).toMatchObject({
      field: "regionCode",
    });
    expect(prepareStructuredLocationSave({ ...souss, localityName: "x".repeat(101) }, "draft")).toMatchObject({
      field: "localityName",
      messageKey: "validation.localityInvalid",
    });
  });

  test("a failed save stays on the step and a successful save can advance", () => {
    expect(locationStepTransition({ saveSucceeded: false, mode: "continue", returnToReview: false })).toBe("stay");
    expect(locationStepTransition({ saveSucceeded: true, mode: "continue", returnToReview: false })).toBe("next");
    expect(locationStepTransition({ saveSucceeded: true, mode: "draft", returnToReview: false })).toBe("exit");
    expect(describeAppError({ data: "PROJECT_PROVINCE_REGION_MISMATCH" }).field).toBe("provinceCode");
    expect(describeAppError({ data: "INVALID_PROJECT_LOCALITY" }).field).toBe("localityName");
  });
});

describe("GEO5 draft resume and review", () => {
  test("resumes from structured, legacy and mixed location drafts", () => {
    expect(wizardResumeStep({ ...details, title: null, description: null, propertyType: null, timeline: null })).toBe(3);
    expect(wizardResumeStep({ ...details, location: { regionCode: "09", provinceCode: null, communeName: null, localityName: null, legacyCity: null, neighborhood: null } })).toBe(2);
    expect(wizardResumeStep({ ...details, location: { regionCode: "09", provinceCode: "09.541", communeName: null, localityName: null, legacyCity: null, neighborhood: null } })).toBe(2);
    expect(isWizardLocationComplete({ ...souss, communeName: "Commune X" })).toBe(true);
    expect(wizardResumeStep({
      ...details,
      location: { regionCode: "09", provinceCode: "09.541", communeName: "Commune X", localityName: "Douar Y", legacyCity: null, neighborhood: null },
    })).toBe(5);
    expect(wizardResumeStep({ ...details, city: "rabat", primaryCategory: "renovation" })).toBe(5);
    expect(wizardResumeStep({
      ...details,
      city: "rabat",
      location: { regionCode: "09", provinceCode: null, communeName: null, localityName: null, legacyCity: "rabat", neighborhood: null },
    })).toBe(2);
    expect(isWizardLocationComplete({ city: "rabat", regionCode: null, provinceCode: null, communeName: null, localityName: null })).toBe(true);
    expect(isWizardLocationComplete({ city: "rabat", regionCode: "09" })).toBe(false);
  });

  test.each(["fr", "en"] as const)("formats the owner review in %s without using free text as a translation key", (locale) => {
    const messages = locale === "fr" ? fr : en;
    const structured = wizardReviewLocation({
      regionCode: "09",
      provinceCode: "09.541",
      communeName: "Commune X",
      localityName: "Douar آيت ⵜⴰⵎⵍⵉⵍ",
    }, locale, labels(locale));
    expect(structured).toBe(`Souss-Massa · Taroudannt · Commune X · Douar آيت ⵜⴰⵎⵍⵉⵍ`);
    expect(structured).not.toContain("cityOptions.");
    expect(wizardReviewLocation({ city: "rabat" }, locale, labels(locale))).toBe(messages.projectWizard.cityOptions.rabat);
    const partial = wizardReviewLocation({ regionCode: "09", city: "agadir" }, locale, labels(locale));
    expect(partial).toContain("Souss-Massa");
    expect(partial).toContain(messages.projectWizard.review.locationIncomplete);
    expect(partial).not.toContain(messages.projectWizard.cityOptions.agadir);
    expect(wizardReviewLocation({ city: "rabat" }, locale, labels(locale), true)).toBe(messages.projectWizard.review.locationUnsaved);
    expect(messages.projectWizard.fields.region).toBeTruthy();
    expect(messages.projectWizard.validation.provinceMismatch).toBeTruthy();
    expect(Object.keys(fr.projectWizard.fields).sort()).toEqual(Object.keys(en.projectWizard.fields).sort());
    expect(Object.keys(fr.projectWizard.validation).sort()).toEqual(Object.keys(en.projectWizard.validation).sort());
    expect(Object.keys(fr.projectWizard.review).sort()).toEqual(Object.keys(en.projectWizard.review).sort());
    expect(Object.keys(fr.ux.error.codes).sort()).toEqual(Object.keys(en.ux.error.codes).sort());
  });
});

describe("GEO5.1 persisted location mode", () => {
  const cleared = {
    ...details,
    city: "agadir" as const,
    neighborhood: "Founty",
    locationMode: "structured" as const,
    location: {
      regionCode: null, provinceCode: null, communeName: null, localityName: null,
      legacyCity: null, neighborhood: "Founty",
    },
  };

  test("reopened cleared geography resumes at Location and cannot Continue using the old city", () => {
    expect(wizardResumeStep(cleared)).toBe(2);
    expect(wizardResumeStep({ ...cleared, title: null })).toBe(3);
    expect(isWizardLocationComplete(cleared)).toBe(false);
    const form = locationFormFromDraft(cleared);
    expect(form).toEqual({ regionCode: "", provinceCode: "", communeName: "", localityName: "" });
    expect(prepareStructuredLocationSave(form, "continue")).toMatchObject({ ok: false, field: "regionCode" });
    expect(prepareStructuredLocationSave(form, "draft")).toMatchObject({
      ok: true, payload: { regionCode: null, provinceCode: null, communeName: null, localityName: null },
    });
    expect(wizardResumeStep({ ...details, city: "agadir", locationMode: null })).toBe(5);
  });

  test("optional commune validation agrees with Continue and cannot restore legacy completion", () => {
    const invalid = { ...souss, communeName: "x".repeat(101), city: "agadir", locationMode: "structured" as const };
    expect(isWizardLocationComplete(invalid)).toBe(false);
    expect(wizardResumeStep({ ...details, city: "agadir", locationMode: "structured", location: {
      ...invalid, legacyCity: null, neighborhood: null,
    } })).toBe(2);
    expect(prepareStructuredLocationSave(invalid, "continue")).toMatchObject({ ok: false, field: "communeName" });
  });

  test.each(["fr", "en"] as const)("%s review keeps the historical city inactive after clearing and completing geography", (locale) => {
    const messages = locale === "fr" ? fr : en;
    expect(wizardReviewLocation(cleared, locale, labels(locale))).toBe(messages.projectWizard.review.locationIncomplete);
    const completed = { ...cleared, location: { ...souss, legacyCity: null, neighborhood: "Founty" } };
    expect(wizardResumeStep(completed)).toBe(5);
    const review = wizardReviewLocation(completed, locale, labels(locale));
    expect(review).toContain("Taroudannt");
    expect(review).toContain(souss.localityName);
    expect(review).not.toContain(messages.projectWizard.cityOptions.agadir);
    expect(review).not.toContain("Founty");
    expect(wizardReviewLocation(cleared, locale, labels(locale), true)).toBe(messages.projectWizard.review.locationUnsaved);
  });

  test("an old session receives a recognized error with FR and EN instructions", () => {
    expect(describeAppError({ data: "PROJECT_STRUCTURED_LOCATION_REQUIRED" })).toEqual({
      code: "PROJECT_STRUCTURED_LOCATION_REQUIRED", field: undefined, messageKey: "error.codes.PROJECT_STRUCTURED_LOCATION_REQUIRED",
    });
    expect(fr.ux.error.codes.PROJECT_STRUCTURED_LOCATION_REQUIRED).toContain("Actualisez");
    expect(en.ux.error.codes.PROJECT_STRUCTURED_LOCATION_REQUIRED).toContain("Reload");
  });
});
