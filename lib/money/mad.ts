/**
 * MAD amounts in Batiplus are stored as whole-dirham numbers (e.g. 300000 = 300,000 MAD).
 * Parsing must never silently truncate thousand separators (e.g. "300,000" → 300).
 */

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
