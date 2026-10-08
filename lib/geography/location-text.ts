/** GEO4.1 location text contract shared by the wizard and Convex. */
export const PROJECT_LOCATION_TEXT_MAX_LENGTH = 100;

const unsafeControls = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;

export type LocationTextNormalization =
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false };

/**
 * Allow pasted whitespace. Reject other C0/C1 and bidi embedding controls.
 * Blank text clears storage. Spelling, case and Unicode are preserved.
 */
export function normalizeLocationText(value: string | null): LocationTextNormalization {
  if (value === null) return { ok: true, value: undefined };
  const whitespace = value.replace(/[\t\n\r]/g, " ");
  if (unsafeControls.test(whitespace)) return { ok: false };
  const normalized = whitespace.trim().replace(/\s+/g, " ");
  if (normalized.length > PROJECT_LOCATION_TEXT_MAX_LENGTH) return { ok: false };
  return { ok: true, value: normalized || undefined };
}
