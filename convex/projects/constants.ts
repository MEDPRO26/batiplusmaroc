import { v } from "convex/values";

export const projectCategories = ["houseConstruction", "buildingConstruction", "renovation", "interior", "structural", "finishing", "architecture", "pool", "electrical", "plumbing", "painting", "other"] as const;
export const projectCities = ["agadir", "casablanca", "fes", "marrakech", "meknes", "oujda", "rabat", "sale", "tangier", "tetouan"] as const;
export const projectPropertyTypes = ["house", "apartment", "building", "office", "shop", "land", "other"] as const;
export const projectBudgetRanges = ["under_50000", "50000_100000", "100000_250000", "250000_500000", "500000_1000000", "1000000_plus", "unknown"] as const;
export const projectTimelines = ["asap", "within_1_month", "one_to_three_months", "three_to_six_months", "six_plus_months", "flexible"] as const;
export const projectStatuses = ["draft", "pending_review", "published", "in_discussion", "company_selected", "in_progress", "completed", "cancelled", "archived"] as const;

export const projectCategoryValidator = v.union(...projectCategories.map((value) => v.literal(value)));
export const projectCityValidator = v.union(...projectCities.map((value) => v.literal(value)));
export const projectPropertyTypeValidator = v.union(...projectPropertyTypes.map((value) => v.literal(value)));
export const projectBudgetRangeValidator = v.union(...projectBudgetRanges.map((value) => v.literal(value)));
export const projectTimelineValidator = v.union(...projectTimelines.map((value) => v.literal(value)));
export const projectStatusValidator = v.union(...projectStatuses.map((value) => v.literal(value)));

export type ProjectStatus = (typeof projectStatuses)[number];
export const PROJECT_MAX_IMAGES = 8;
export const PROJECT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PROJECT_MAX_DOCUMENTS = 6;
export const PROJECT_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const PROJECT_UPLOAD_TTL_MS = 10 * 60 * 1000;

export const budgetValues = {
  under_50000: { min: 0, max: 50_000, unknown: false },
  "50000_100000": { min: 50_000, max: 100_000, unknown: false },
  "100000_250000": { min: 100_000, max: 250_000, unknown: false },
  "250000_500000": { min: 250_000, max: 500_000, unknown: false },
  "500000_1000000": { min: 500_000, max: 1_000_000, unknown: false },
  "1000000_plus": { min: 1_000_000, max: undefined, unknown: false },
  unknown: { min: undefined, max: undefined, unknown: true },
} as const;
