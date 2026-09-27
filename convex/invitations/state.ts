import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export type InvitationStatus = Doc<"invitations">["status"];

const transitions: Record<InvitationStatus, readonly InvitationStatus[]> = {
  pending: ["accepted", "declined"],
  accepted: [],
  declined: [],
};

export function assertInvitationTransition(
  from: InvitationStatus,
  to: InvitationStatus,
) {
  if (!transitions[from].includes(to)) {
    throw new ConvexError(
      from === "accepted"
        ? "INVITATION_ALREADY_ACCEPTED"
        : from === "declined"
          ? "INVITATION_ALREADY_DECLINED"
          : "INVALID_INVITATION_TRANSITION",
    );
  }
}

export function isInvitationProjectEligible(status: Doc<"projects">["status"]) {
  return status === "published" || status === "in_discussion";
}
