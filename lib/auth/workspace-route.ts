import type { AppRoute } from "@/lib/routes";
import { routes } from "@/lib/routes";

export type WorkspaceUser = {
  accountType: "client" | "company" | "admin" | "seo_team" | null;
  onboardingStatus: "pending" | "completed" | null;
};

export function workspaceRouteForUser(user: WorkspaceUser): AppRoute {
  if (user.accountType === "seo_team") return routes.seoDashboard;
  if (user.accountType === "admin") return routes.admin;
  if (user.accountType === "company") {
    return user.onboardingStatus === "completed"
      ? routes.companyDashboard
      : routes.companyOnboarding;
  }
  if (user.accountType === "client") {
    return user.onboardingStatus === "completed"
      ? routes.clientDashboard
      : routes.clientOnboarding;
  }
  return routes.signUp;
}
