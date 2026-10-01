/** Stable legacy keys and bilingual names shared by the Admin seed and rollout fallback. */
export const defaultServiceCatalog = [
  { slug: "houseConstruction", nameFr: "Construction maison / villa", nameEn: "House / villa construction", sortOrder: 0 },
  { slug: "renovation", nameFr: "Rénovation", nameEn: "Renovation", sortOrder: 10 },
  { slug: "structural", nameFr: "Gros œuvre", nameEn: "Structural work", sortOrder: 20 },
  { slug: "finishing", nameFr: "Second œuvre", nameEn: "Finishing work", sortOrder: 30 },
  { slug: "architecture", nameFr: "Architecture", nameEn: "Architecture", sortOrder: 40 },
  { slug: "interior", nameFr: "Aménagement intérieur", nameEn: "Interior fit-out", sortOrder: 50 },
  { slug: "electrical", nameFr: "Électricité", nameEn: "Electrical work", sortOrder: 60 },
  { slug: "plumbing", nameFr: "Plomberie", nameEn: "Plumbing", sortOrder: 70 },
  { slug: "joinery", nameFr: "Menuiserie", nameEn: "Joinery", sortOrder: 80 },
  { slug: "pool", nameFr: "Piscine", nameEn: "Swimming pools", sortOrder: 90 },
] as const;
