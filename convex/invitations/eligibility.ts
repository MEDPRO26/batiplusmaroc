import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isCompanyMarketplaceWriteAllowed } from "../companies/operationalStatus";

export async function companyInvitationEligibilityError(
  ctx: QueryCtx | MutationCtx,
  company: Doc<"companies">,
) {
  if (
    company.onboardingStatus !== "completed" ||
    company.verificationStatus !== "verified"
  ) {
    return "COMPANY_NOT_ELIGIBLE_FOR_INVITATION" as const;
  }
  if (!isCompanyMarketplaceWriteAllowed(company)) {
    return "COMPANY_MARKETPLACE_SUSPENDED" as const;
  }
  const activeMember = await ctx.db
    .query("companyMembers")
    .withIndex("by_companyId_and_status", (q) =>
      q.eq("companyId", company._id).eq("status", "active"),
    )
    .first();
  return activeMember ? null : "COMPANY_NOT_ELIGIBLE_FOR_INVITATION";
}
