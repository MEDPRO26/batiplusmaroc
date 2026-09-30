/**
 * Proposals domain module.
 * Read-only Company projections over initial quotes (`projectQuotes`).
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireCompanyUser } from "../companies/access";
import { invitationForPair } from "../invitations/index";

/** Every non-draft initial-quote status, in the order the proposal lifecycle reaches them. */
const LISTED_STATUSES = [
  "submitted",
  "viewed",
  "shortlisted",
  "discussion_open",
  "declined",
  "withdrawn",
] as const;
const RESULT_LIMIT = 200;

const proposalStatusValidator = v.union(
  v.literal("submitted"),
  v.literal("viewed"),
  v.literal("shortlisted"),
  v.literal("discussion_open"),
  v.literal("declined"),
  v.literal("withdrawn"),
);

const companyProposalValidator = v.object({
  quoteId: v.id("projectQuotes"),
  projectId: v.id("projects"),
  projectTitle: v.string(),
  city: v.union(v.string(), v.null()),
  status: proposalStatusValidator,
  estimatedPriceMad: v.number(),
  submittedAt: v.number(),
  conversationId: v.union(v.id("conversations"), v.null()),
  /** Mirrors the quote workspace access rule so the UI never links to a dead page. */
  canOpenQuoteWorkspace: v.boolean(),
});

/** Same eligibility as `quotes.getSubmissionContext`, which backs the quote workspace page. */
async function canOpenQuoteWorkspace(
  ctx: QueryCtx,
  project: Doc<"projects">,
  companyId: Id<"companies">,
) {
  const invitation = await invitationForPair(ctx, project._id, companyId);
  if (invitation === null) {
    return project.status === "published" && project.visibility === "marketplace";
  }
  return (
    invitation.status === "accepted" &&
    (project.status === "published" || project.status === "in_discussion")
  );
}

/**
 * The authenticated membership determines the Company; callers cannot supply a
 * Company ID. Only the Company's own quotes are read, so no other Company's
 * proposal can leak.
 */
export const listMyProposals = query({
  args: {},
  returns: v.array(companyProposalValidator),
  handler: async (ctx) => {
    const { company } = await requireCompanyUser(ctx);
    // The global result can contain at most RESULT_LIMIT rows, so no status can
    // contribute more than RESULT_LIMIT rows to that result. Reading that many
    // candidates from every indexed status partition is therefore an exact
    // bounded top-K merge rather than a per-status truncation heuristic.
    // Initial quotes are inserted with createdAt === submittedAt, preserving the
    // partition index order used here; status transitions do not change either.
    const quotePartitions = await Promise.all(
      LISTED_STATUSES.map((status) =>
        ctx.db
          .query("projectQuotes")
          .withIndex("by_companyId_and_status", (q) =>
            q.eq("companyId", company._id).eq("status", status),
          )
          .order("desc")
          .take(RESULT_LIMIT),
      ),
    );
    const quotes: Doc<"projectQuotes">[] = quotePartitions.flat();
    quotes.sort(
      (a, b) =>
        b.submittedAt - a.submittedAt ||
        b._creationTime - a._creationTime ||
        b._id.localeCompare(a._id),
    );

    const rows = [];
    for (const quote of quotes.slice(0, RESULT_LIMIT)) {
      if (quote.status === "draft") continue;
      const project = await ctx.db.get(quote.projectId);
      if (!project) continue;
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_projectId_and_companyId", (q) =>
          q.eq("projectId", project._id).eq("companyId", company._id),
        )
        .first();
      rows.push({
        quoteId: quote._id,
        projectId: project._id,
        projectTitle: project.title ?? "—",
        city: project.city ?? null,
        status: quote.status,
        estimatedPriceMad: quote.estimatedPrice,
        submittedAt: quote.submittedAt,
        conversationId: conversation?._id ?? null,
        canOpenQuoteWorkspace: await canOpenQuoteWorkspace(ctx, project, company._id),
      });
    }
    return rows;
  },
});
