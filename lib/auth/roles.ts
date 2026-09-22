export const USER_ROLES = ["client", "company", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PUBLIC_ACCOUNT_TYPES = ["client", "company"] as const;
export type PublicAccountType = (typeof PUBLIC_ACCOUNT_TYPES)[number];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function isPublicAccountType(value: unknown): value is PublicAccountType {
  return value === "client" || value === "company";
}
