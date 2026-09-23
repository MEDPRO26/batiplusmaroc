export type NavbarRole = "public" | "client" | "company" | "loading";

export type AuthSnapshot = {
  isLoading: boolean;
  isAuthenticated: boolean;
  accountType: "client" | "company" | "admin" | null | undefined;
  /** True while authenticated and the Convex user query has not resolved yet. */
  userPending: boolean;
};

/**
 * Maps trusted auth + account data to which navbar to render.
 * Prefer loading over briefly flashing the public navbar for signed-in users.
 */
export function resolveNavbarRole(auth: AuthSnapshot): NavbarRole {
  if (auth.isLoading || (auth.isAuthenticated && auth.userPending)) {
    return "loading";
  }
  if (!auth.isAuthenticated) {
    return "public";
  }
  if (auth.accountType === "client") {
    return "client";
  }
  if (auth.accountType === "company") {
    return "company";
  }
  return "public";
}

export function userInitials(firstName: string | null | undefined, lastName: string | null | undefined) {
  const first = firstName?.trim().charAt(0) ?? "";
  const last = lastName?.trim().charAt(0) ?? "";
  const initials = `${first}${last}`.toLocaleUpperCase("fr-MA");
  return initials || "?";
}
