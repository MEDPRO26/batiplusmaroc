import { ConvexError } from "convex/values";
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

// Match the existing project neighborhood bound, measured in normalized UTF-16 code units.
export const PROJECT_LOCATION_TEXT_MAX_LENGTH = 100;
const unsafeControls = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;

function optionalLocationText(value: string | null, errorCode: string) {
  if (value === null) return undefined;
  // Allow pasted whitespace, but reject other C0/C1 and bidi embedding/override/isolate controls.
  const whitespace = value.replace(/[\t\n\r]/g, " ");
  if (unsafeControls.test(whitespace)) throw new ConvexError(errorCode);
  const normalized = whitespace.trim().replace(/\s+/g, " ");
  if (normalized.length > PROJECT_LOCATION_TEXT_MAX_LENGTH)
    throw new ConvexError(errorCode);
  return normalized || undefined;
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
