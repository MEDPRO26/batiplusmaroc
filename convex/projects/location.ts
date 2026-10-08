import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireConversationAccess } from "../messages/index";

export { toDetailedProjectLocation, toGeneralProjectLocation } from "../../lib/geography/project-location";

const nullableString = v.union(v.string(), v.null());
export const generalProjectLocationValidator = v.object({
  regionCode: nullableString,
  provinceCode: nullableString,
  communeName: nullableString,
  legacyCity: nullableString,
});
export const detailedProjectLocationValidator = generalProjectLocationValidator.extend({
  localityName: nullableString,
  neighborhood: nullableString,
});
export const companyProjectLocationValidator = v.union(generalProjectLocationValidator, detailedProjectLocationValidator);

/** Called after requireCompanyUser; conversation access independently rechecks the authenticated caller. */
export async function canAccessDetailedProjectLocation(ctx: QueryCtx, project: Doc<"projects">, companyId: Id<"companies">) {
  const conversations = await ctx.db.query("conversations")
    .withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", project._id).eq("companyId", companyId))
    .take(2);
  // Ambiguous/corrupt relationships fail closed rather than choosing a convenient history.
  if (conversations.length !== 1) return false;
  const conversation = conversations[0];
  if (conversation.clientId !== project.clientId) return false;
  try {
    const access = await requireConversationAccess(ctx, conversation._id);
    return access.viewer.viewerType === "company"
      && access.conversation.projectId === project._id
      && access.conversation.companyId === companyId
      && access.conversation.clientId === project.clientId;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string"
      && ["CONVERSATION_NOT_FOUND", "CONVERSATION_LOCKED", "NOT_AUTHENTICATED", "USER_NOT_FOUND"].includes(error.data)) {
      return false;
    }
    throw error;
  }
}
