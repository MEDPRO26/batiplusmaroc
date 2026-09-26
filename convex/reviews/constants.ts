import { ConvexError, v } from "convex/values";

export const reviewModerationStatusValidator = v.union(
  v.literal("visible"),
  v.literal("hidden"),
);

export type ReviewModerationStatus = "visible" | "hidden";

export function validateReviewRating(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new ConvexError("INVALID_REVIEW_RATING");
  }
  return value;
}

export function normalizeReviewComment(value: string) {
  const comment = value.trim().replace(/\s+/g, " ");
  if (comment.length < 10 || comment.length > 2_000) {
    throw new ConvexError("INVALID_REVIEW_COMMENT");
  }
  return comment;
}
