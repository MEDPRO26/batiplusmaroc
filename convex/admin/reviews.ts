import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { reviewModerationStatusValidator } from "../reviews/constants";
import { adjustCompanyReviewAggregate } from "../reviews/model";
import { requireAdminUser } from "./access";

const adminReviewValidator = v.object({
  reviewId: v.id("reviews"), dealId: v.id("deals"), projectId: v.id("projects"),
  projectTitle: v.string(), companyId: v.id("companies"), companyName: v.string(),
  clientName: v.string(), rating: v.number(), comment: v.string(),
  moderationStatus: reviewModerationStatusValidator, createdAt: v.number(),
  moderatedAt: v.union(v.number(), v.null()),
});

export const listReviews = query({
  args: { status: v.union(v.literal("all"), v.literal("visible"), v.literal("hidden")), search: v.optional(v.string()) },
  returns: v.array(adminReviewValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const moderationStatus = args.status === "all" ? null : args.status;
    const reviews = moderationStatus === null
      ? await ctx.db.query("reviews").withIndex("by_createdAt").order("desc").take(100)
      : await ctx.db.query("reviews").withIndex("by_moderationStatus_and_createdAt", (q) => q.eq("moderationStatus", moderationStatus)).order("desc").take(100);
    const rows = await Promise.all(reviews.map(async (review) => {
      const [project, company, client] = await Promise.all([
        ctx.db.get(review.projectId), ctx.db.get(review.companyId), ctx.db.get(review.clientUserId),
      ]);
      if (!project || !company || !client) return null;
      return {
        reviewId: review._id, dealId: review.dealId, projectId: review.projectId,
        projectTitle: project.title ?? "—", companyId: review.companyId,
        companyName: company.name ?? "—",
        clientName: [client.firstName, client.lastName].filter(Boolean).join(" ") || "—",
        rating: review.rating, comment: review.comment, moderationStatus: review.moderationStatus,
        createdAt: review.createdAt, moderatedAt: review.moderatedAt ?? null,
      };
    }));
    const search = args.search?.trim().toLocaleLowerCase() ?? "";
    return rows.filter((row): row is NonNullable<typeof row> => row !== null)
      .filter((row) => !search || `${row.projectTitle} ${row.companyName} ${row.clientName} ${row.comment}`.toLocaleLowerCase().includes(search));
  },
});

export const setReviewVisibility = mutation({
  args: { reviewId: v.id("reviews"), status: reviewModerationStatusValidator },
  returns: v.object({ status: reviewModerationStatusValidator, changed: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const review = await ctx.db.get(args.reviewId);
    if (!review) throw new ConvexError("REVIEW_NOT_FOUND");
    if (review.moderationStatus === args.status) return { status: args.status, changed: false };
    const [company, deal, project] = await Promise.all([
      ctx.db.get(review.companyId), ctx.db.get(review.dealId), ctx.db.get(review.projectId),
    ]);
    if (!company || !deal || !project || deal.projectId !== project._id || deal.companyId !== company._id ||
      review.clientUserId !== deal.clientUserId || project.clientId !== review.clientUserId ||
      project.selectedCompanyId !== review.companyId) {
      throw new ConvexError("REVIEW_DEAL_INTEGRITY_ERROR");
    }
    const now = Date.now();
    await adjustCompanyReviewAggregate(ctx, company, review.rating, args.status === "visible" ? 1 : -1);
    await ctx.db.patch(review._id, { moderationStatus: args.status, moderatedAt: now, moderatedByAdminUserId: admin._id });
    await appendMarketplaceActivity(ctx, {
      projectId: project._id, eventType: args.status === "visible" ? "review_restored" : "review_hidden",
      actorUserId: admin._id, actorType: "admin", companyId: company._id, dealId: deal._id,
      reviewId: review._id, oldStatus: review.moderationStatus, newStatus: args.status, createdAt: now,
    });
    return { status: args.status, changed: true };
  },
});
