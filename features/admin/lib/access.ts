import type { AppRoute } from "@/lib/routes";
import { routes } from "@/lib/routes";
import { workspaceRouteForUser, type WorkspaceUser } from "@/lib/auth/workspace-route";

export type AdminGateUser = WorkspaceUser | null;

/**
 * Returns the safe localized-app destination for anyone who is not an admin.
 * A null result means the caller may render the admin page.
 */
export function adminAccessRedirect(user: AdminGateUser): AppRoute | null {
  if (!user) return routes.signIn;
  if (user.accountType === "admin") return null;
  return workspaceRouteForUser(user);
}
