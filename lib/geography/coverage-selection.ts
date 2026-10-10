import {
  validateCompanyCoverageScopes,
  type CoverageScopeKey,
} from "./company-coverage";
import { getProvince, getProvincesByRegion, getRegion, type Province } from "./morocco";

export type CoverageLocale = "fr" | "en";

export type CoverageOverlap = "national" | "regional";

export type CoverageReplacement = { coverageScopeKeys: string[] };

export type CommitCoverageResult =
  | { ok: true; coverageScopeKeys: CoverageScopeKey[] }
  | {
      ok: false;
      reason: "invalid";
      error: "COMPANY_COVERAGE_LIMIT_EXCEEDED" | "INVALID_COMPANY_COVERAGE_SCOPE" | "DUPLICATE_COMPANY_COVERAGE_SCOPE";
      coverageScopeKeys: readonly string[];
    }
  | { ok: false; reason: "failed"; cause: unknown; coverageScopeKeys: readonly string[] };

/** Ordered equality. Overlapping but distinct keys stay different. */
export function coverageSelectionsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

/**
 * Toggle one canonical key. A Set blocks duplicates; the array keeps the
 * first-seen order and appends a newly enabled key at the end.
 */
export function setCoverageSelection(keys: readonly string[], key: string, enabled: boolean): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of keys) {
    if (seen.has(item)) continue;
    seen.add(item);
    if (!enabled && item === key) continue;
    ordered.push(item);
  }
  if (enabled && !seen.has(key)) ordered.push(key);
  return ordered;
}

/**
 * Adopt a reactive server snapshot only while the draft still matches the
 * last saved baseline. Unsaved edits stay in place.
 */
export function reconcileCoverageDraft(
  draft: readonly string[],
  baseline: readonly string[],
  incoming: readonly string[],
): { draft: string[]; baseline: string[] } {
  if (coverageSelectionsEqual(draft, baseline)) {
    return { draft: [...incoming], baseline: [...incoming] };
  }
  return { draft: [...draft], baseline: [...baseline] };
}

/** National coverage plus any other key, or a province inside a selected region. */
export function coverageOverlap(keys: readonly string[]): CoverageOverlap | null {
  const seen = new Set(keys);
  if (seen.has("MA")) {
    for (const key of seen) {
      if (key !== "MA") return "national";
    }
  }
  for (const key of keys) {
    if (!key.startsWith("P:")) continue;
    const province = getProvince(key.slice(2));
    if (province && seen.has(`R:${province.regionCode}`)) return "regional";
  }
  return null;
}

/** O(K) name filter for the provinces of one browsed region. */
export function filterProvincesByName(
  provinces: readonly Province[],
  query: string,
  locale: CoverageLocale,
): Province[] {
  const needle = query.trim().toLocaleLowerCase(locale === "fr" ? "fr" : "en");
  if (!needle) return [...provinces];
  return provinces.filter((province) => {
    const name = locale === "fr" ? province.nameFr : province.nameEn;
    return name.toLocaleLowerCase(locale === "fr" ? "fr" : "en").includes(needle);
  });
}

export function provincesForBrowse(regionCode: string): readonly Province[] {
  return getProvincesByRegion(regionCode);
}

export function coveragePlaceName(key: string, locale: CoverageLocale): string | null {
  if (key === "MA") return null;
  if (key.startsWith("R:")) {
    const region = getRegion(key.slice(2));
    return region ? (locale === "fr" ? region.nameFr : region.nameEn) : null;
  }
  if (key.startsWith("P:")) {
    const province = getProvince(key.slice(2));
    if (!province) return null;
    return locale === "fr" ? province.nameFr : province.nameEn;
  }
  return null;
}

export function coverageKind(key: string): "country" | "region" | "province" | "prefecture" | null {
  if (key === "MA") return "country";
  if (key.startsWith("R:") && getRegion(key.slice(2))) return "region";
  if (key.startsWith("P:")) {
    const province = getProvince(key.slice(2));
    return province ? province.kind : null;
  }
  return null;
}

/**
 * Validate the complete ordered replacement, then send it. Invalid drafts and
 * failed mutations leave the caller's array unchanged.
 */
export async function commitGeographicCoverage(
  draft: readonly string[],
  update: (replacement: CoverageReplacement) => Promise<unknown>,
): Promise<CommitCoverageResult> {
  const selected = validateCompanyCoverageScopes(draft);
  if (!selected.valid) {
    return { ok: false, reason: "invalid", error: selected.error, coverageScopeKeys: draft };
  }
  const coverageScopeKeys = [...selected.coverageScopeKeys];
  try {
    await update({ coverageScopeKeys });
    return { ok: true, coverageScopeKeys: selected.coverageScopeKeys };
  } catch (cause) {
    return { ok: false, reason: "failed", cause, coverageScopeKeys: draft };
  }
}
