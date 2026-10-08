import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { normalizeLocationText } from "../../lib/geography/location-text";
import { usesStructuredProjectLocation } from "../../lib/geography/project-location";
import {
  isValidRegion,
  validateAdministrativePair,
} from "../../lib/geography/morocco";

export type StructuredProjectLocationInput = {
  regionCode: string | null;
  provinceCode: string | null;
  communeName: string | null;
  localityName: string | null;
};

export { PROJECT_LOCATION_TEXT_MAX_LENGTH } from "../../lib/geography/location-text";

function optionalLocationText(value: string | null, errorCode: string) {
  const normalized = normalizeLocationText(value);
  if (!normalized.ok) throw new ConvexError(errorCode);
  return normalized.value;
}

/**
 * Complete draft snapshot: all four keys are required; null/blank text clears optional storage.
 * Codes are exact catalogue strings; blank/unknown values and surrounding whitespace are rejected.
 * Region/province may be incomplete, but a province requires its valid parent region.
 * Text may be saved without administrative selections; this is not publication readiness.
 * Errors contain machine codes only, never submitted location values. No DB access or side effects.
 */
export function normalizeStructuredProjectLocation(
  input: StructuredProjectLocationInput,
) {
  if (input.regionCode !== null && !isValidRegion(input.regionCode)) {
    throw new ConvexError("INVALID_PROJECT_REGION");
  }
  if (input.provinceCode !== null) {
    if (input.regionCode === null)
      throw new ConvexError("PROJECT_REGION_REQUIRED");
    const pair = validateAdministrativePair(
      input.regionCode,
      input.provinceCode,
    );
    if (!pair.valid) {
      throw new ConvexError(
        pair.error === "PROVINCE_REGION_MISMATCH"
          ? "PROJECT_PROVINCE_REGION_MISMATCH"
          : "INVALID_PROJECT_PROVINCE",
      );
    }
  }
  return {
    regionCode: input.regionCode ?? undefined,
    provinceCode: input.provinceCode ?? undefined,
    communeName: optionalLocationText(
      input.communeName,
      "INVALID_PROJECT_COMMUNE",
    ),
    localityName: optionalLocationText(
      input.localityName,
      "INVALID_PROJECT_LOCALITY",
    ),
  };
}

/** Validate submission/approval without rewriting recorded location fields. */
export function assertProjectLocationReady(
  project: Pick<
    Doc<"projects">,
    | "countryCode"
    | "city"
    | "locationMode"
    | "regionCode"
    | "provinceCode"
    | "communeName"
    | "localityName"
  >,
) {
  if (project.countryCode !== "MA")
    throw new ConvexError("PROJECT_INCOMPLETE");

  if (!usesStructuredProjectLocation(project)) {
    if (!project.city) throw new ConvexError("PROJECT_INCOMPLETE");
    return;
  }

  const location = normalizeStructuredProjectLocation({
    regionCode: project.regionCode ?? null,
    provinceCode: project.provinceCode ?? null,
    communeName: project.communeName ?? null,
    localityName: project.localityName ?? null,
  });
  if (!location.regionCode || !location.provinceCode || !location.localityName)
    throw new ConvexError("PROJECT_INCOMPLETE");
}
