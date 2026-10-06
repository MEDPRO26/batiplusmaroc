import { v } from "convex/values";
import { ingestionImageValidator, ingestionStatusValidator, targetValidator } from "./constants";

export const retirementStatusValidator = v.union(v.literal("not_ready"), v.literal("ready"), v.literal("retiring"), v.literal("retired"), v.literal("failed"));
export const blockerValidator = v.union(
  v.literal("ingestion_incomplete"), v.literal("preservation_invalid"), v.literal("relationship_changed"),
  v.literal("moderation_pending"), v.literal("public_state_unsafe"), v.literal("dependency_found"),
  v.literal("dependency_ambiguous"), v.literal("source_invalid"), v.literal("upload_grant_active"),
);
export const retirementResultValidator = v.object({
  ingestionId: v.id("legacyMediaIngestions"), retirementStatus: retirementStatusValidator,
  cacheVerificationRequired: v.boolean(), knownUrls: v.array(v.string()),
});
export const readinessValidator = targetValidator.extend({
  ingestionId: v.id("legacyMediaIngestions"), companyName: v.union(v.string(), v.null()),
  projectTitle: v.union(v.string(), v.null()), order: v.union(v.number(), v.null()),
  ingestionStatus: ingestionStatusValidator, moderationStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.null()),
  publicState: v.union(v.literal("approved"), v.literal("generic"), v.literal("omitted"), v.literal("unsafe")),
  dependencyResult: v.union(v.literal("clear"), v.literal("blocked")),
  ready: v.boolean(), retryable: v.boolean(), blockers: v.array(blockerValidator), fingerprint: v.string(),
  recoveryImageId: v.union(ingestionImageValidator, v.null()),
  retirementStatus: retirementStatusValidator, knownUrls: v.array(v.string()), cacheVerificationRequired: v.boolean(),
});
export const retirementRequestValidator = v.object({
  ingestionId: v.id("legacyMediaIngestions"), expectedFingerprint: v.string(), confirmation: v.literal("RETIRE"),
});
export const RETIREMENT_LEASE_MS = 10 * 60 * 1000;
