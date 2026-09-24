import type { AppRoute } from "@/lib/routes";
import { routes } from "@/lib/routes";
import { workspaceRouteForUser, type WorkspaceUser } from "@/lib/auth/workspace-route";

export type SeoGateUser = WorkspaceUser | null;

/** A null result means the exact seo_team role may render the SEO workspace. */
export function seoAccessRedirect(user: SeoGateUser): AppRoute | null {
  if (!user) return routes.signIn;
  if (user.accountType === "seo_team") return null;
  return workspaceRouteForUser(user);
}
