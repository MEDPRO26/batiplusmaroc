/**
 * Initial Quote estimates are whole-dirham numbers (e.g. 300000 = 300,000 MAD).
 * Final Quote prices, Deals and commissions carry MAD centimes (two decimals).
 * Parsing must never silently truncate thousand separators (e.g. "300,000" → 300).
 */

/** Shared display options: financial MAD amounts always show exactly two decimals. */
export const MAD_AMOUNT_FORMAT = {
  style: "currency",
  currency: "MAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

export function formatMadAmount(value: number, locale: string) {
  return new Intl.NumberFormat(locale, MAD_AMOUNT_FORMAT).format(value);
}

const SPACE_CHARS = /[\s\u00A0\u202F\u2009]/g;

/**
 * Normalize a human-entered MAD amount to a positive whole-dirham number.
 * Supported: "300000", "300,000", "300 000" (incl. NBSP).
 * Rejects ambiguous or invalid values instead of guessing.
 */
export function parseMadInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(SPACE_CHARS, "");
  if (!compact) return null;

  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");

  if (hasComma && hasDot) return null;

  if (hasComma) {
    // Thousand separators only: 300,000 or 1,234,567
    if (!/^\d{1,3}(,\d{3})+$/.test(compact)) return null;
    return positiveWholeMad(Number(compact.replace(/,/g, "")));
  }

  if (hasDot) {
    // Dot-grouped thousands (300.000) are ambiguous vs decimals — reject.
    if (/^\d{1,3}(\.\d{3})+$/.test(compact)) return null;
    // Explicit decimal MAD (rare); round to whole dirhams.
    if (!/^\d+\.\d{1,2}$/.test(compact)) return null;
    return positiveWholeMad(Math.round(Number(compact)));
  }

  if (!/^\d+$/.test(compact)) return null;
  return positiveWholeMad(Number(compact));
}

function positiveWholeMad(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (!Number.isInteger(value)) return null;
  return value;
}

const MAD_MINOR_UNITS = 100;

/**
 * Strict Final Quote amount parser: a positive MAD amount with at most two
 * decimals, returned as an exact centime-precision number.
 * Supported: "320000", "320000.5", "320000,50", "320 000,50", "320,000",
 * "1,234,567.50", "1.234.567,50".
 * Rejects more than two decimals and ambiguous values (e.g. "300.000")
 * instead of rounding or guessing.
 */
export function parseMadCentimeInput(raw: string): number | null {
  const compact = raw.trim().replace(SPACE_CHARS, "");
  if (!compact) return null;

  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let whole: string;
  let fraction = "";

  if (hasComma && hasDot) {
    const match =
      /^(\d{1,3}(?:,\d{3})+)\.(\d{1,2})$/.exec(compact) ??
      /^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/.exec(compact);
    if (!match) return null;
    whole = match[1].replace(/[.,]/g, "");
    fraction = match[2];
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(compact)) {
      whole = compact.replace(/,/g, "");
    } else {
      const match = /^(\d+),(\d{1,2})$/.exec(compact);
      if (!match) return null;
      whole = match[1];
      fraction = match[2];
    }
  } else if (hasDot) {
    // Dot-grouped thousands (300.000) are ambiguous vs decimals — reject.
    const match = /^(\d+)\.(\d{1,2})$/.exec(compact);
    if (!match) return null;
    whole = match[1];
    fraction = match[2];
  } else {
    if (!/^\d+$/.test(compact)) return null;
    whole = compact;
  }

  const centimes = Number(whole) * MAD_MINOR_UNITS + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(centimes) || centimes <= 0) return null;
  return centimes / MAD_MINOR_UNITS;
}
