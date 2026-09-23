import type { Doc } from "../_generated/dataModel";

const categoryTerms: Record<NonNullable<Doc<"projects">["primaryCategory"]>, string> = {
  houseConstruction: "house construction construction maison",
  buildingConstruction: "building construction construction immeuble",
  renovation: "renovation rénovation",
  interior: "interior intérieur amenagement aménagement",
  structural: "structural gros oeuvre œuvre",
  finishing: "finishing second oeuvre œuvre",
  architecture: "architecture architecte",
  pool: "pool piscine",
  electrical: "electrical electricite électricité",
  plumbing: "plumbing plomberie",
  painting: "painting peinture",
  other: "other autre",
};

export function buildProjectMarketplaceSearchText(
  project: Pick<Doc<"projects">, "title" | "primaryCategory" | "customCategoryText" | "city">,
) {
  return [
    project.title,
    project.city,
    project.primaryCategory ? categoryTerms[project.primaryCategory] : null,
    project.customCategoryText,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase();
}

export function normalizeProjectSearch(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase().slice(0, 100) ?? "";
}
