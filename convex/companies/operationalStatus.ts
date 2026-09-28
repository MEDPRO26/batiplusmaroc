import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const companyOperationalStatusValidator = v.union(
  v.literal("normal"),
  v.literal("needs_attention"),
  v.literal("suspended"),
);

export type CompanyOperationalStatus =
  typeof companyOperationalStatusValidator.type;

type Ctx = QueryCtx | MutationCtx;

/** Legacy Company rows predate operational status and are normal by definition. */
export function getCompanyOperationalStatus(
  company: Pick<Doc<"companies">, "operationalStatus">,
): CompanyOperationalStatus {
  return company.operationalStatus ?? "normal";
}

export function assertCompanyMarketplaceWriteAllowed(
  company: Pick<Doc<"companies">, "operationalStatus">,
) {
  if (getCompanyOperationalStatus(company) === "suspended") {
    throw new ConvexError("COMPANY_MARKETPLACE_SUSPENDED");
  }
}

export async function requireCompanyMarketplaceWriteAllowed(
  ctx: Ctx,
  companyId: Id<"companies">,
) {
  const company = await ctx.db.get(companyId);
  if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
  assertCompanyMarketplaceWriteAllowed(company);
  return company;
}
