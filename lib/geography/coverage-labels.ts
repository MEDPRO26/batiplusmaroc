import { getProvince, getRegion } from "./morocco";

export type CoverageScopePresentation = {
  readonly key: string;
  readonly kind: "national" | "region" | "province" | "prefecture";
  readonly name?: string;
};

/** Explicit declarations only. Invalid keys are skipped and never shown as codes. */
export function presentCoverageScopes(
  keys: readonly string[] | undefined,
  locale: "fr" | "en",
): CoverageScopePresentation[] {
  if (!keys) return [];
  const seen = new Set<string>();
  const labels: CoverageScopePresentation[] = [];
  for (const key of keys) {
    if (typeof key !== "string" || seen.has(key)) continue;
    if (key === "MA") {
      seen.add(key);
      labels.push({ key, kind: "national" });
      continue;
    }
    if (key.startsWith("R:")) {
      const region = getRegion(key.slice(2));
      if (!region) continue;
      seen.add(key);
      labels.push({ key, kind: "region", name: locale === "fr" ? region.nameFr : region.nameEn });
      continue;
    }
    if (key.startsWith("P:")) {
      const province = getProvince(key.slice(2));
      if (!province) continue;
      seen.add(key);
      labels.push({
        key,
        kind: province.kind,
        name: locale === "fr" ? province.nameFr : province.nameEn,
      });
    }
  }
  return labels;
}
