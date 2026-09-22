/** Shared backend constants for the marketplace modular monolith. */

export const USER_ROLES = ["client", "company", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PUBLIC_ACCOUNT_TYPES = ["client", "company"] as const;
export type PublicAccountType = (typeof PUBLIC_ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPES = ["client", "company", "admin"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isPublicAccountType(value: unknown): value is PublicAccountType {
  return value === "client" || value === "company";
}

export const COMPANY_VERIFICATION_STATUSES = [
  "draft",
  "pending",
  "verified",
  "rejected",
] as const;
export type CompanyVerificationStatus = (typeof COMPANY_VERIFICATION_STATUSES)[number];

export const PROJECT_STATUSES = [
  "draft",
  "published",
  "matching",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
