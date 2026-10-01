export const legacyServiceKeys = ["houseConstruction", "renovation", "structural", "finishing", "architecture", "interior", "electrical", "plumbing", "joinery", "pool"] as const;
export type LegacyServiceKey = (typeof legacyServiceKeys)[number];
export function isLegacyServiceKey(value: string): value is LegacyServiceKey {
  return (legacyServiceKeys as readonly string[]).includes(value);
}
export function catalogServiceName(row: { nameFr: string; nameEn: string }, locale: string) {
  return locale === "fr" ? row.nameFr : row.nameEn;
}
export function serviceName(
  slug: string,
  catalog: readonly { slug: string; nameFr: string; nameEn: string }[],
  locale: string,
  legacyLabel: (key: LegacyServiceKey) => string,
) {
  const row = Array.isArray(catalog) ? catalog.find(item => item.slug === slug) : undefined;
  return row ? catalogServiceName(row, locale) : isLegacyServiceKey(slug) ? legacyLabel(slug) : slug;
}
