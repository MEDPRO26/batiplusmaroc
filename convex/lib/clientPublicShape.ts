import type { Doc } from "../_generated/dataModel";

export type PublicClientProfile = {
  firstName: string;
  lastInitial: string;
  displayName: string;
  city: string | null;
  joinedAt: number;
  projectsPostedCount: number;
  projectsCompletedCount: number;
};

/**
 * Safe public client shape for company-facing project pages later.
 * Never includes phone, email, exact address, private files, or full last name.
 */
export function toPublicClientProfile(args: {
  user: Doc<"users">;
  profile: Doc<"clientProfiles"> | null;
  projectsPostedCount: number;
  projectsCompletedCount: number;
}): PublicClientProfile | null {
  const firstName = args.user.firstName?.trim() ?? "";
  const lastName = args.user.lastName?.trim() ?? "";
  if (!firstName || !lastName) return null;

  const lastInitial = lastName.charAt(0).toLocaleUpperCase("fr-MA");
  const joinedAt = args.profile?.createdAt ?? args.user.createdAt ?? args.user._creationTime;

  return {
    firstName,
    lastInitial,
    displayName: `${firstName} ${lastInitial}.`,
    city: args.profile?.city?.trim() || null,
    joinedAt,
    projectsPostedCount: Math.max(0, args.projectsPostedCount),
    projectsCompletedCount: Math.max(0, args.projectsCompletedCount),
  };
}

export function clientInitials(firstName: string, lastName: string) {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toLocaleUpperCase("fr-MA") || "?";
}
