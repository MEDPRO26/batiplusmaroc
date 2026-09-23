import type { UserRole } from "@/lib/auth/roles";

/** High-level capability checks. Enforce the same rules in Convex modules. */
export type Permission =
  | "project:create"
  | "project:view"
  | "proposal:create"
  | "proposal:view"
  | "company:manage"
  | "admin:access"
  | "seo:access";

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  client: ["project:create", "project:view", "proposal:view"],
  company: ["project:view", "proposal:create", "proposal:view", "company:manage"],
  admin: ["project:create", "project:view", "proposal:create", "proposal:view", "company:manage", "admin:access"],
  seo_team: ["seo:access"],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
