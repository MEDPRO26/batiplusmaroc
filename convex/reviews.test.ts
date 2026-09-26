/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
function makeBackend() { return convexTest(schema, modules); }
type Backend = ReturnType<typeof makeBackend>;
type AccountType = "client" | "company" | "admin" | "seo_team";

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` });
}

async function user(t: Backend, accountType: AccountType, firstName = "Review") {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${crypto.randomUUID()}@reviews.test`, firstName, lastName: "Tester",
    accountType, onboardingStatus: "completed", countryCode: "MA", createdAt: 1, updatedAt: 1,
  }));
}

async function setup(
  status: "active" | "completed" = "completed",
  existing?: { t: Backend; companyId: Id<"companies"> },
) {
  const t = existing?.t ?? makeBackend();
  const clientUserId = await user(t, "client", "Samira");
  const otherClientUserId = await user(t, "client", "Other");
  const companyUserId = await user(t, "company");
  const adminUserId = await user(t, "admin");
  const seoUserId = await user(t, "seo_team");
  const companyId = existing?.companyId ?? await t.run((ctx) => ctx.db.insert("companies", {
    name: "Atlas Build", slug: "atlas-build", city: "Rabat",
    description: "Verified construction company serving residential clients.",
    onboardingStatus: "completed", verificationStatus: "verified", createdAt: 1, updatedAt: 1,
  }));
  await t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId, userId: companyUserId, role: "owner", status: "active", createdAt: 1,
  }));
  const projectId = await t.run((ctx) => ctx.db.insert("projects", {
    clientId: clientUserId, title: `Completed project ${crypto.randomUUID()}`,
    countryCode: "MA", surfaceUnknown: false, budgetUnknown: false, visibility: "marketplace",
    status: status === "completed" ? "completed" : "company_selected", lastCompletedStep: 6,
    createdAt: 1, updatedAt: 1,
  }));
  const initialQuoteId = await t.run((ctx) => ctx.db.insert("projectQuotes", {
    projectId, companyId, submittedByUserId: companyUserId, message: "Complete the project.",
    estimatedPrice: 100_000, currency: "MAD", estimatedDuration: 60,
    availableStartDate: "2099-01-01", scope: "Full scope for the completed project.",
    quoteType: "initial", status: "discussion_open", createdAt: 2, updatedAt: 2, submittedAt: 2,
  }));
  const conversationId = await t.run((ctx) => ctx.db.insert("conversations", {
    projectId, quoteId: initialQuoteId, clientId: clientUserId, companyId,
    status: "active", createdBy: clientUserId, createdAt: 3, updatedAt: 3,
  }));
  const finalQuoteId = await t.run((ctx) => ctx.db.insert("finalQuotes", {
    projectId, clientId: clientUserId, companyId, initialQuoteId, conversationId,
    status: "accepted", requestedAt: 4, requestedByUserId: clientUserId,
    requestTrigger: "client_request", acceptedAt: 6, acceptedByUserId: clientUserId,
    createdAt: 4, updatedAt: 6,
  }));
  const revisionId = await t.run((ctx) => ctx.db.insert("finalQuoteRevisions", {
    finalQuoteId, revisionNumber: 1, price: 100_000, currency: "MAD", duration: 60,
    plannedStartDate: "2099-01-01", validUntil: "2099-12-31", scope: "Full scope.",
    inclusions: "Labour and materials.", exclusions: "None.", paymentTerms: "By progress.",
    submittedByUserId: companyUserId, submittedAt: 5, createdAt: 5,
  }));
  await t.run(async (ctx) => {
    await ctx.db.patch(finalQuoteId, { currentRevisionId: revisionId, acceptedRevisionId: revisionId });
    await ctx.db.patch(projectId, { selectedCompanyId: companyId, selectedFinalQuoteId: finalQuoteId });
  });
  const dealId = await t.run((ctx) => ctx.db.insert("deals", {
    projectId, clientUserId, companyId, createdByUserId: clientUserId,
    acceptedFinalQuoteId: finalQuoteId, acceptedFinalQuoteRevisionId: revisionId,
    conversationId, initialQuoteId, agreedAmountMad: 100_000, currency: "MAD",
    commissionRateBps: 300, commissionAmountMad: 3_000,
    commissionTierMinAmountMad: 0, commissionTierMaxAmountMad: 300_000,
    commissionConfigVersion: 1, commissionDebtorCompanyId: companyId,
    commissionBeneficiary: "batiplus", commissionStatus: "due", status,
    ...(status === "completed" ? { completedAt: 10, completedByUserId: clientUserId } : {}),
    createdAt: 6,
  }));
  return { t, clientUserId, otherClientUserId, companyUserId, adminUserId, seoUserId, companyId, projectId, dealId, revisionId };
}

async function create(state: Awaited<ReturnType<typeof setup>>, rating = 5, comment = "Excellent work delivered exactly as agreed.") {
  return await asUser(state.t, state.clientUserId).mutation(api.reviews.index.createReview, {
    dealId: state.dealId, rating, comment,
  });
}

describe("Client Deal reviews", () => {
  test("completed Deal owner creates one visible review with trusted relationships and audit", async () => {
    const state = await setup();
    const created = await create(state, 5, "  Excellent   construction work delivered on time.  ");
    const stored = await state.t.run((ctx) => ctx.db.get(created.reviewId));
    expect(stored).toMatchObject({
      dealId: state.dealId, projectId: state.projectId, companyId: state.companyId,
      clientUserId: state.clientUserId, rating: 5,
      comment: "Excellent construction work delivered on time.", moderationStatus: "visible",
    });
    expect(await state.t.run((ctx) => ctx.db.get(state.companyId))).toMatchObject({ reviewCount: 1, reviewRatingTotal: 5 });
    const activity = await state.t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", state.dealId)).take(10));
    expect(activity).toEqual([expect.objectContaining({ eventType: "review_created", reviewId: created.reviewId, actorUserId: state.clientUserId, newStatus: "visible", metadata: { rating: 5 } })]);
  });

  test("active Deal and corrupt completed relationships are denied", async () => {
    const active = await setup("active");
    await expect(create(active)).rejects.toThrow("REVIEW_NOT_ELIGIBLE");
    const corrupt = await setup();
    await corrupt.t.run((ctx) => ctx.db.delete(corrupt.revisionId));
    await expect(create(corrupt)).rejects.toThrow("REVIEW_DEAL_INTEGRITY_ERROR");
    expect(await corrupt.t.run((ctx) => ctx.db.query("reviews").withIndex("by_dealId", (q) => q.eq("dealId", corrupt.dealId)).take(1))).toHaveLength(0);
  });

  test("only the owning Client can create a review", async () => {
    const state = await setup();
    const args = { dealId: state.dealId, rating: 5, comment: "Excellent completed construction work." };
    await expect(asUser(state.t, state.otherClientUserId).mutation(api.reviews.index.createReview, args)).rejects.toThrow("REVIEW_NOT_FOUND");
    for (const userId of [state.companyUserId, state.adminUserId, state.seoUserId]) {
      await expect(asUser(state.t, userId).mutation(api.reviews.index.createReview, args)).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    }
    await expect(state.t.mutation(api.reviews.index.createReview, args)).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("one Deal can have only one review", async () => {
    const state = await setup();
    await create(state);
    await expect(create(state, 4, "A second review must never be created.")).rejects.toThrow("REVIEW_ALREADY_EXISTS");
    expect(await state.t.run((ctx) => ctx.db.query("reviews").withIndex("by_dealId", (q) => q.eq("dealId", state.dealId)).take(2))).toHaveLength(1);
  });

  test("only the owning Client can read their submitted review", async () => {
    const state = await setup();
    await create(state, 4, "Careful work with clear progress updates.");
    await expect(asUser(state.t, state.clientUserId).query(api.reviews.index.getMyReviewForDeal, { dealId: state.dealId })).resolves.toMatchObject({ rating: 4, moderationStatus: "visible" });
    await expect(asUser(state.t, state.otherClientUserId).query(api.reviews.index.getMyReviewForDeal, { dealId: state.dealId })).rejects.toThrow("REVIEW_NOT_FOUND");
    for (const userId of [state.companyUserId, state.adminUserId, state.seoUserId]) {
      await expect(asUser(state.t, userId).query(api.reviews.index.getMyReviewForDeal, { dealId: state.dealId })).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    }
    await expect(state.t.query(api.reviews.index.getMyReviewForDeal, { dealId: state.dealId })).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("accepts integer boundary ratings and rejects invalid ratings", async () => {
    await expect(create(await setup(), 1)).resolves.toMatchObject({ moderationStatus: "visible" });
    await expect(create(await setup(), 5)).resolves.toMatchObject({ moderationStatus: "visible" });
    for (const rating of [0, 6, 1.5]) {
      await expect(create(await setup(), rating)).rejects.toThrow("INVALID_REVIEW_RATING");
    }
    const invalid = await setup();
    await expect(asUser(invalid.t, invalid.clientUserId).mutation(api.reviews.index.createReview, {
      dealId: invalid.dealId, rating: "5" as never, comment: "Valid comment content.",
    })).rejects.toThrow();
  });

  test("requires a meaningful bounded plain-text comment", async () => {
    for (const comment of ["", "too short", "x".repeat(2_001)]) {
      await expect(create(await setup(), 5, comment)).rejects.toThrow("INVALID_REVIEW_COMMENT");
    }
  });
});

describe("Review aggregates, public profile, and moderation", () => {
  test("visible reviews update average/count and public output contains only safe fields", async () => {
    const first = await setup();
    const second = await setup("completed", { t: first.t, companyId: first.companyId });
    await create(first, 5, "Excellent finish and clear communication throughout.");
    await create(second, 3, "Good work overall with a minor scheduling delay.");
    const profile = await first.t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "atlas-build" });
    expect(profile).toMatchObject({ rating: 4, reviewCount: 2 });
    expect(profile?.reviews).toHaveLength(2);
    expect(Object.keys(profile!.reviews[0]).sort()).toEqual(["comment", "createdAt", "projectTitle", "rating", "reviewerFirstName", "reviewerLastInitial"].sort());
    expect(JSON.stringify(profile?.reviews)).not.toContain(first.clientUserId);
    expect(JSON.stringify(profile?.reviews)).not.toContain(first.dealId);
  });

  test("Admin hide/restore controls public visibility and exact aggregates", async () => {
    const first = await setup();
    const second = await setup("completed", { t: first.t, companyId: first.companyId });
    const five = await create(first, 5, "Excellent finish and clear communication throughout.");
    await create(second, 3, "Good work overall with a minor scheduling delay.");
    const admin = asUser(first.t, first.adminUserId);
    await expect(admin.mutation(api.admin.reviews.setReviewVisibility, { reviewId: five.reviewId, status: "hidden" })).resolves.toEqual({ status: "hidden", changed: true });
    expect(await first.t.run((ctx) => ctx.db.get(first.companyId))).toMatchObject({ reviewCount: 1, reviewRatingTotal: 3 });
    let profile = await first.t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "atlas-build" });
    expect(profile).toMatchObject({ rating: 3, reviewCount: 1 });
    expect(profile?.reviews.map((review) => review.rating)).toEqual([3]);
    await expect(admin.mutation(api.admin.reviews.setReviewVisibility, { reviewId: five.reviewId, status: "visible" })).resolves.toEqual({ status: "visible", changed: true });
    expect(await first.t.run((ctx) => ctx.db.get(first.companyId))).toMatchObject({ reviewCount: 2, reviewRatingTotal: 8 });
    profile = await first.t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "atlas-build" });
    expect(profile).toMatchObject({ rating: 4, reviewCount: 2 });
    const events = await first.t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", first.dealId)).order("asc").take(10));
    expect(events.map((event) => event.eventType)).toEqual(["review_created", "review_hidden", "review_restored"]);
  });

  test("only Admin can moderate and repeated status is audit-idempotent", async () => {
    const state = await setup();
    const created = await create(state);
    const args = { reviewId: created.reviewId, status: "hidden" as const };
    for (const userId of [state.clientUserId, state.companyUserId, state.seoUserId]) {
      await expect(asUser(state.t, userId).mutation(api.admin.reviews.setReviewVisibility, args)).rejects.toThrow("ADMIN_REQUIRED");
      await expect(asUser(state.t, userId).query(api.admin.reviews.listReviews, { status: "all" })).rejects.toThrow("ADMIN_REQUIRED");
    }
    await expect(state.t.mutation(api.admin.reviews.setReviewVisibility, args)).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(state.t.query(api.admin.reviews.listReviews, { status: "all" })).rejects.toThrow("NOT_AUTHENTICATED");
    const admin = asUser(state.t, state.adminUserId);
    await expect(admin.query(api.admin.reviews.listReviews, { status: "visible", search: "Atlas" })).resolves.toHaveLength(1);
    await admin.mutation(api.admin.reviews.setReviewVisibility, args);
    await expect(admin.mutation(api.admin.reviews.setReviewVisibility, args)).resolves.toEqual({ status: "hidden", changed: false });
    const events = await state.t.run((ctx) => ctx.db.query("marketplaceActivity").withIndex("by_dealId_and_createdAt", (q) => q.eq("dealId", state.dealId)).take(10));
    expect(events.filter((event) => event.eventType === "review_hidden")).toHaveLength(1);
  });
});
