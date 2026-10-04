export const marketplaceCategories = [
  "houseConstruction",
  "renovation",
  "structural",
  "finishing",
  "architecture",
  "interior",
  "electrical",
  "plumbing",
  "joinery",
  "pool",
] as const;

export type MarketplaceCategory = (typeof marketplaceCategories)[number];

export type MarketplaceOpenProject = {
  id: string;
  category: MarketplaceCategory;
  city: string;
  postedDays: number;
  proposals: number;
  verifiedClient: boolean;
};

export const marketplaceOpenProjects: readonly MarketplaceOpenProject[] = [
  { id: "0", category: "houseConstruction", city: "Agadir", postedDays: 1, proposals: 8, verifiedClient: true },
  { id: "1", category: "renovation", city: "Casablanca", postedDays: 2, proposals: 12, verifiedClient: true },
  { id: "2", category: "structural", city: "Rabat", postedDays: 3, proposals: 5, verifiedClient: true },
  { id: "3", category: "electrical", city: "Marrakech", postedDays: 4, proposals: 6, verifiedClient: false },
  { id: "4", category: "pool", city: "Agadir", postedDays: 5, proposals: 9, verifiedClient: true },
  { id: "5", category: "interior", city: "Tanger", postedDays: 6, proposals: 4, verifiedClient: true },
];

export function companyPath(slug: string) {
  return {
    pathname: "/entreprises/[slug]" as const,
    params: { slug },
  };
}
