/** Admin → Companies list filters, shared by the server page (URL parsing) and the client panel. */

export type AdminVerificationFilter = "draft" | "pending" | "verified" | "rejected";
export type AdminOnboardingFilter = "pending" | "completed";
export type AdminOperationalFilter = "normal" | "needs_attention" | "suspended";

export type AdminCompanyFilters = {
  search: string;
  verification: AdminVerificationFilter | null;
  onboarding: AdminOnboardingFilter | null;
  operational: AdminOperationalFilter | null;
};

export const VERIFICATIONS: AdminVerificationFilter[] = ["draft", "pending", "verified", "rejected"];
export const ONBOARDINGS: AdminOnboardingFilter[] = ["pending", "completed"];
export const OPERATIONALS: AdminOperationalFilter[] = ["normal", "needs_attention", "suspended"];

/** Session key the company detail page reads to return to the same filtered list. */
export const COMPANIES_RETURN_KEY = "batiplus.admin.companies.query";

export function parseCompanyFilters(params: Record<string, string | string[] | undefined>): AdminCompanyFilters {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) =>
    allowed.includes(value as T) ? (value as T) : null;
  return {
    search: (one("q") ?? "").slice(0, 120),
    verification: pick(one("verification"), VERIFICATIONS),
    onboarding: pick(one("onboarding"), ONBOARDINGS),
    operational: pick(one("operational"), OPERATIONALS),
  };
}

export function toQuery(filters: AdminCompanyFilters) {
  const query: Record<string, string> = {};
  if (filters.search.trim()) query.q = filters.search.trim();
  if (filters.verification) query.verification = filters.verification;
  if (filters.onboarding) query.onboarding = filters.onboarding;
  if (filters.operational) query.operational = filters.operational;
  return query;
}
