import { v } from "convex/values";

export const marketplaceActivityEventTypeValidator = v.union(
  v.literal("project_created"),
  v.literal("project_submitted"),
  v.literal("project_approved"),
  v.literal("project_needs_changes"),
  v.literal("initial_quote_submitted"),
  v.literal("quote_viewed"),
  v.literal("quote_shortlisted"),
  v.literal("quote_declined"),
  v.literal("discussion_opened"),
  v.literal("site_assessment_invited"),
  v.literal("site_assessment_accepted"),
  v.literal("site_assessment_declined"),
  v.literal("site_assessment_cancelled"),
  v.literal("site_visit_scheduled"),
  v.literal("site_visit_proposed"),
  v.literal("site_visit_rescheduled"),
  v.literal("site_visit_confirmed"),
  v.literal("site_visit_declined"),
  v.literal("site_visit_completed"),
  v.literal("site_visit_cancelled"),
  v.literal("final_quote_requested"),
  v.literal("final_quote_submitted"),
  v.literal("final_quote_changes_requested"),
  v.literal("final_quote_revised"),
  v.literal("final_quote_declined"),
  v.literal("final_quote_withdrawn"),
  v.literal("final_quote_accepted"),
  v.literal("company_selected"),
  v.literal("deal_created"),
  v.literal("deal_completed"),
  v.literal("commission_due"),
  v.literal("commission_paid"),
);

export const marketplaceActivityActorTypeValidator = v.union(
  v.literal("client"),
  v.literal("company"),
  v.literal("admin"),
);

export const marketplaceActivityMetadataValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);

export type MarketplaceActivityEventType =
  | "project_created"
  | "project_submitted"
  | "project_approved"
  | "project_needs_changes"
  | "initial_quote_submitted"
  | "quote_viewed"
  | "quote_shortlisted"
  | "quote_declined"
  | "discussion_opened"
  | "site_assessment_invited"
  | "site_assessment_accepted"
  | "site_assessment_declined"
  | "site_assessment_cancelled"
  | "site_visit_scheduled"
  | "site_visit_proposed"
  | "site_visit_rescheduled"
  | "site_visit_confirmed"
  | "site_visit_declined"
  | "site_visit_completed"
  | "site_visit_cancelled"
  | "final_quote_requested"
  | "final_quote_submitted"
  | "final_quote_changes_requested"
  | "final_quote_revised"
  | "final_quote_declined"
  | "final_quote_withdrawn"
  | "final_quote_accepted"
  | "company_selected"
  | "deal_created"
  | "deal_completed"
  | "commission_due"
  | "commission_paid";

export type MarketplaceActivityActorType = "client" | "company" | "admin";
