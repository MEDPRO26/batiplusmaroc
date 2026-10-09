import { ConvexError } from "convex/values";
import { env } from "../_generated/server";
import { COMPANY_HEADQUARTERS_POLICY_VERSION } from "../../lib/geography/company-headquarters";

/** Enrollment starts only after the compatible backend and frontend are ready. */
export function companyHeadquartersCreationPolicy() {
  const version = env.COMPANY_HEADQUARTERS_POLICY_VERSION;
  if (version === undefined) return {};
  if (version !== COMPANY_HEADQUARTERS_POLICY_VERSION) {
    throw new ConvexError("COMPANY_HEADQUARTERS_POLICY_UNAVAILABLE");
  }
  return { headquartersPolicyVersion: version };
}
