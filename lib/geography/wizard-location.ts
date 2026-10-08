import { getProvincesByRegion, isProvinceInRegion, isValidRegion } from "./morocco";
import { LEGACY_CITY_CODES, formatProjectLocation, usesStructuredProjectLocation, type LegacyCityCode, type ProjectLocation } from "./project-location";
import { normalizeLocationText } from "./location-text";

export type LocationFormState = {
  regionCode: string;
  provinceCode: string;
  communeName: string;
  localityName: string;
};

export type StructuredLocationPayload = {
  regionCode: string | null;
  provinceCode: string | null;
  communeName: string | null;
  localityName: string | null;
};

export type WizardLocationRecord = {
  locationMode?: "structured" | null;
  city?: string | null;
  regionCode?: string | null;
  provinceCode?: string | null;
  communeName?: string | null;
  localityName?: string | null;
  neighborhood?: string | null;
  location?: {
    regionCode?: string | null;
    provinceCode?: string | null;
    communeName?: string | null;
    localityName?: string | null;
    legacyCity?: string | null;
    neighborhood?: string | null;
  } | null;
};

const legacyCities = new Set<string>(LEGACY_CITY_CODES);

export const emptyLocationForm = (): LocationFormState => ({
  regionCode: "",
  provinceCode: "",
  communeName: "",
  localityName: "",
});

function recorded(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Flat view of a wizard draft or stored project. Does not invent a legacy city. */
export function readWizardLocation(source: WizardLocationRecord) {
  const nested = source.location;
  return {
    city: recorded(source.city) ?? recorded(nested?.legacyCity),
    regionCode: recorded(nested?.regionCode) ?? recorded(source.regionCode),
    provinceCode: recorded(nested?.provinceCode) ?? recorded(source.provinceCode),
    communeName: recorded(nested?.communeName) ?? recorded(source.communeName),
    localityName: recorded(nested?.localityName) ?? recorded(source.localityName),
    neighborhood: recorded(nested?.neighborhood) ?? recorded(source.neighborhood),
  };
}

export function hasStructuredLocation(source: WizardLocationRecord): boolean {
  return usesStructuredProjectLocation(source) ||
    (source.location != null && usesStructuredProjectLocation(source.location));
}

/** Complete structured geography, or an untouched legacy city when no structured field is stored. */
export function isWizardLocationComplete(source: WizardLocationRecord): boolean {
  const location = readWizardLocation(source);
  if (hasStructuredLocation(source)) {
    const locality = normalizeLocationText(location.localityName);
    const commune = normalizeLocationText(location.communeName);
    return Boolean(
      isValidRegion(location.regionCode) &&
        isProvinceInRegion(location.provinceCode, location.regionCode) &&
        locality.ok &&
        locality.value &&
        commune.ok,
    );
  }
  return location.city !== null && legacyCities.has(location.city);
}

/** Restore a draft once. Invalid pairs leave the province empty and keep typed place names. */
export function locationFormFromDraft(source: WizardLocationRecord): LocationFormState {
  const location = readWizardLocation(source);
  const regionCode = isValidRegion(location.regionCode) ? location.regionCode : "";
  const provinceCode =
    location.provinceCode && isProvinceInRegion(location.provinceCode, regionCode)
      ? location.provinceCode
      : "";
  return {
    regionCode,
    provinceCode,
    communeName: location.communeName ?? "",
    localityName: location.localityName ?? "",
  };
}

/** Region change drops the previous province and place names that belonged to it. */
export function applyRegionChange(form: LocationFormState, regionCode: string): LocationFormState {
  if (regionCode === "") {
    if (!form.regionCode && !form.provinceCode && !form.communeName && !form.localityName) return form;
    return emptyLocationForm();
  }
  if (!isValidRegion(regionCode) || form.regionCode === regionCode) return form;
  return { regionCode, provinceCode: "", communeName: "", localityName: "" };
}

/** Province change keeps the region and drops place names from the previous province. */
export function applyProvinceChange(form: LocationFormState, provinceCode: string): LocationFormState {
  if (provinceCode === "") {
    if (!form.provinceCode && !form.communeName && !form.localityName) return form;
    return { ...form, provinceCode: "", communeName: "", localityName: "" };
  }
  if (!isProvinceInRegion(provinceCode, form.regionCode)) return { ...form, provinceCode: "" };
  if (form.provinceCode === provinceCode) return form;
  return { ...form, provinceCode, communeName: "", localityName: "" };
}

export function provinceOptionsForRegion(regionCode: string) {
  return getProvincesByRegion(regionCode);
}

type LocationField = "regionCode" | "provinceCode" | "communeName" | "localityName";

export type LocationSavePreparation =
  | { ok: true; payload: StructuredLocationPayload; form: LocationFormState }
  | { ok: false; field: LocationField; messageKey: `validation.${string}` };

function textField(
  value: string,
  invalidKey: LocationSavePreparation & { ok: false },
): { ok: true; value: string | null } | { ok: false; field: LocationField; messageKey: `validation.${string}` } {
  const normalized = normalizeLocationText(value);
  if (!normalized.ok) return invalidKey;
  return { ok: true, value: normalized.value ?? null };
}

/**
 * Continue requires a valid region, matching province and locality.
 * Save draft may omit them. Every payload still contains all four keys.
 */
export function prepareStructuredLocationSave(
  form: LocationFormState,
  mode: "continue" | "draft",
): LocationSavePreparation {
  const regionCode = form.regionCode === "" ? null : form.regionCode;
  if (regionCode !== null && !isValidRegion(regionCode)) {
    return { ok: false, field: "regionCode", messageKey: "validation.region" };
  }
  if (form.provinceCode !== "" && !isProvinceInRegion(form.provinceCode, regionCode)) {
    return { ok: false, field: "provinceCode", messageKey: "validation.provinceMismatch" };
  }
  const commune = textField(form.communeName, {
    ok: false,
    field: "communeName",
    messageKey: "validation.communeInvalid",
  });
  if (!commune.ok) return commune;
  const locality = textField(form.localityName, {
    ok: false,
    field: "localityName",
    messageKey: "validation.localityInvalid",
  });
  if (!locality.ok) return locality;
  const provinceCode = form.provinceCode === "" ? null : form.provinceCode;
  if (mode === "continue") {
    if (!regionCode) return { ok: false, field: "regionCode", messageKey: "validation.region" };
    if (!provinceCode) return { ok: false, field: "provinceCode", messageKey: "validation.province" };
    if (!locality.value) return { ok: false, field: "localityName", messageKey: "validation.locality" };
  }
  const next: LocationFormState = {
    regionCode: regionCode ?? "",
    provinceCode: provinceCode ?? "",
    communeName: commune.value ?? "",
    localityName: locality.value ?? "",
  };
  return {
    ok: true,
    form: next,
    payload: {
      regionCode,
      provinceCode,
      communeName: commune.value,
      localityName: locality.value,
    },
  };
}

export function locationFormsMatch(left: LocationFormState, right: LocationFormState): boolean {
  const current = prepareStructuredLocationSave(left, "draft");
  const baseline = prepareStructuredLocationSave(right, "draft");
  if (!current.ok || !baseline.ok) return false;
  return (
    current.form.regionCode === baseline.form.regionCode &&
    current.form.provinceCode === baseline.form.provinceCode &&
    current.form.communeName === baseline.form.communeName &&
    current.form.localityName === baseline.form.localityName
  );
}

export function isLocationFormDirty(form: LocationFormState, saved: WizardLocationRecord): boolean {
  const baseline = locationFormFromDraft(saved);
  const current = prepareStructuredLocationSave(form, "draft");
  if (!current.ok) return true;
  return (
    current.form.regionCode !== baseline.regionCode ||
    current.form.provinceCode !== baseline.provinceCode ||
    current.form.communeName !== baseline.communeName ||
    current.form.localityName !== baseline.localityName
  );
}

export function locationStepTransition(input: {
  saveSucceeded: boolean;
  mode: "continue" | "draft";
  returnToReview: boolean;
}): "stay" | "exit" | "review" | "next" {
  if (!input.saveSucceeded) return "stay";
  if (input.mode === "draft") return "exit";
  if (input.returnToReview) return "review";
  return "next";
}

type ReviewLabels = {
  unspecified: string;
  incomplete: string;
  unsaved: string;
  legacyCity: (code: LegacyCityCode) => string;
};

/** Owner review label. Incomplete structured edits are not presented as a finished location. */
export function wizardReviewLocation(
  source: WizardLocationRecord,
  locale: "fr" | "en",
  labels: ReviewLabels,
  dirty = false,
): string {
  if (dirty) return labels.unsaved;
  const location = readWizardLocation(source);
  const structured = hasStructuredLocation(source);
  const detailed: ProjectLocation = {
    regionCode: location.regionCode,
    provinceCode: location.provinceCode,
    communeName: location.communeName,
    legacyCity: !structured && location.city && legacyCities.has(location.city) ? location.city : null,
    localityName: location.localityName,
    neighborhood: structured ? null : location.neighborhood,
  };
  const formatted = formatProjectLocation(detailed, locale, labels);
  if (isWizardLocationComplete(source)) return formatted;
  if (!formatted || formatted === labels.unspecified) return labels.incomplete;
  return `${formatted} · ${labels.incomplete}`;
}
