import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireCompanyUser } from "../companies/access";
import { companyFileNamesForRelationship, companyNameForAudience, companyNamesToMask, maskCompanyNamesInText, resolveCompanyIdentityAudience } from "../lib/companyName";
import { assertCompanyMarketplaceWriteAllowed } from "../companies/operationalStatus";
import { companyInvitationEligibilityError } from "./eligibility";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { ensureConversationForAcceptedInvitation } from "../messages/index";
import {
  createNotification,
  createNotificationForActiveCompanyMembers,
} from "../notifications/model";
import { requireClientUser, requireOwnedProject } from "../projects/access";
import { assertProjectTransition } from "../projects/state";
import { isActiveQuoteStatus } from "../quotes/state";
import {
  assertInvitationTransition,
  isInvitationProjectEligible,
  type InvitationStatus,
} from "./state";

const MAX_INVITATION_MESSAGE_LENGTH = 2_000;
const MAX_INVITATIONS = 100;
const statusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
);

const eligibleProjectValidator = v.object({
  id: v.id("projects"),
  title: v.string(),
  city: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  status: v.union(v.literal("published"), v.literal("in_discussion")),
  invitationId: v.union(v.id("invitations"), v.null()),
  invitationStatus: v.union(statusValidator, v.null()),
});

const invitationValidator = v.object({
  id: v.id("invitations"),
  projectId: v.id("projects"),
  projectTitle: v.string(),
  projectDescription: v.string(),
  city: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  companyId: v.id("companies"),
  companyName: v.string(),
  isVerified: v.boolean(),
  clientDisplayName: v.string(),
  message: v.union(v.string(), v.null()),
  status: statusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  acceptedAt: v.union(v.number(), v.null()),
  declinedAt: v.union(v.number(), v.null()),
  canAccept: v.boolean(),
});

type Ctx = QueryCtx | MutationCtx;

function normalizeMessage(value: string | undefined) {
  const message = value?.trim();
  if (!message) return undefined;
  if (message.length > MAX_INVITATION_MESSAGE_LENGTH)
    throw new ConvexError("INVALID_INVITATION_MESSAGE");
  return message;
}

async function requireEligibleCompany(ctx: Ctx, companyId: Id<"companies">) {
  const company = await ctx.db.get(companyId);
  if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
  const error = await companyInvitationEligibilityError(ctx, company);
  if (error) throw new ConvexError(error);
  return company;
}

async function invitationsForPair(
  ctx: Ctx,
  projectId: Id<"projects">,
  companyId: Id<"companies">,
) {
  return await ctx.db
    .query("invitations")
    .withIndex("by_projectId_and_companyId", (q) =>
      q.eq("projectId", projectId).eq("companyId", companyId),
    )
    .order("desc")
    .take(2);
}

export async function invitationForPair(
  ctx: Ctx,
  projectId: Id<"projects">,
  companyId: Id<"companies">,
) {
  const rows = await invitationsForPair(ctx, projectId, companyId);
  if (rows.length > 1) throw new ConvexError("INVITATION_INTEGRITY_ERROR");
  return rows[0] ?? null;
}

export async function acceptedInvitationForPair(
  ctx: Ctx,
  projectId: Id<"projects">,
  companyId: Id<"companies">,
) {
  const invitation = await invitationForPair(ctx, projectId, companyId);
  return invitation?.status === "accepted" ? invitation : null;
}

function clientDisplayName(client: Doc<"users">) {
  const firstName = client.firstName?.trim();
  const lastInitial = client.lastName?.trim().charAt(0);
  return firstName && lastInitial
    ? `${firstName} ${lastInitial}.`
    : firstName || client.name?.trim() || "";
}

async function toInvitationDto(ctx: Ctx, invitation: Doc<"invitations">, viewerType: "client" | "company") {
  const [project, company, client] = await Promise.all([
    ctx.db.get(invitation.projectId),
    ctx.db.get(invitation.companyId),
    ctx.db.get(invitation.clientUserId),
  ]);
  if (
    !project ||
    !company ||
    !client ||
    project.clientId !== invitation.clientUserId
  ) {
    throw new ConvexError("INVITATION_INTEGRITY_ERROR");
  }
  const audience = await resolveCompanyIdentityAudience(ctx, company._id);
  const maskedNames = companyNamesToMask(company, audience);
  const files = viewerType === "client" ? await companyFileNamesForRelationship(ctx, project._id, company._id, invitation.clientUserId,
    [project.title, project.description, invitation.message]) : [];
  return {
    id: invitation._id,
    projectId: project._id,
    projectTitle: maskCompanyNamesInText(project.title ?? "", maskedNames, files),
    projectDescription: maskCompanyNamesInText(project.description ?? "", maskedNames, files),
    city: project.city ?? null,
    category: project.primaryCategory ?? null,
    companyId: company._id,
    companyName: companyNameForAudience(company.name, audience),
    isVerified: company.verificationStatus === "verified",
    clientDisplayName: clientDisplayName(client),
    message: invitation.message === undefined ? null : maskCompanyNamesInText(invitation.message, maskedNames, files),
    status: invitation.status,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    acceptedAt: invitation.acceptedAt ?? null,
    declinedAt: invitation.declinedAt ?? null,
    canAccept: company.operationalStatus !== "suspended",
  };
}

export const listMyEligibleProjectsForCompany = query({
  args: { companyId: v.id("companies") },
  returns: v.union(v.null(), v.array(eligibleProjectValidator)),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const company = await ctx.db.get(args.companyId);
    // Eligibility can change while a public profile or invitation dialog is open.
    if (!company || await companyInvitationEligibilityError(ctx, company)) return null;
    const groups = await Promise.all(
      (["published", "in_discussion"] as const).map((status) =>
        ctx.db
          .query("projects")
          .withIndex("by_clientId_and_status", (q) =>
            q.eq("clientId", userId).eq("status", status),
          )
          .order("desc")
          .take(50),
      ),
    );
    const projects = groups
      .flat()
      .filter((project) => !project.selectedCompanyId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
    return await Promise.all(
      projects.map(async (project) => {
        const existing = await invitationForPair(
          ctx,
          project._id,
          args.companyId,
        );
        return {
          id: project._id,
          title: project.title ?? "",
          city: project.city ?? null,
          category: project.primaryCategory ?? null,
          status: project.status as "published" | "in_discussion",
          invitationId: existing?._id ?? null,
          invitationStatus: existing?.status ?? null,
        };
      }),
    );
  },
});

export const inviteCompanyToProject = mutation({
  args: {
    companyId: v.id("companies"),
    projectId: v.id("projects"),
    message: v.optional(v.string()),
  },
  returns: v.object({
    invitationId: v.id("invitations"),
    status: v.literal("pending"),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const [project, company] = await Promise.all([
      requireOwnedProject(ctx, userId, args.projectId),
      requireEligibleCompany(ctx, args.companyId),
    ]);
    if (
      !isInvitationProjectEligible(project.status) ||
      project.selectedCompanyId
    )
      throw new ConvexError("PROJECT_NOT_ELIGIBLE_FOR_INVITATION");
    const existingQuotes = await ctx.db
      .query("projectQuotes")
      .withIndex("by_projectId_and_companyId", (q) =>
        q.eq("projectId", project._id).eq("companyId", company._id),
      )
      .order("desc")
      .take(20);
    if (existingQuotes.some((quote) => isActiveQuoteStatus(quote.status)))
      throw new ConvexError("ACTIVE_QUOTE_ALREADY_EXISTS");
    const existing = await invitationForPair(ctx, project._id, company._id);
    if (existing) {
      if (existing.status === "accepted")
        throw new ConvexError("INVITATION_ALREADY_ACCEPTED");
      if (existing.status === "declined")
        throw new ConvexError("INVITATION_ALREADY_DECLINED");
      throw new ConvexError("ACTIVE_INVITATION_ALREADY_EXISTS");
    }
    const now = Date.now();
    const invitationId = await ctx.db.insert("invitations", {
      projectId: project._id,
      clientUserId: userId,
      companyId: company._id,
      message: normalizeMessage(args.message),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("invitationStatusHistory", {
      invitationId,
      projectId: project._id,
      companyId: company._id,
      toStatus: "pending",
      actorUserId: userId,
      createdAt: now,
    });
    await appendMarketplaceActivity(ctx, {
      projectId: project._id,
      eventType: "company_invited",
      actorUserId: userId,
      actorType: "client",
      companyId: company._id,
      invitationId,
      newStatus: "pending",
      createdAt: now,
    });
    await createNotificationForActiveCompanyMembers(ctx, {
      companyId: company._id,
      actorUserId: userId,
      type: "invitation_received",
      entity: { type: "invitation", id: invitationId },
      payload: {
        ...(project.title?.trim() ? { projectTitle: project.title.trim() } : {}),
        ...(company.name?.trim() ? { companyName: company.name.trim() } : {}),
      },
      dedupeKey: `invitation:${invitationId}:received`,
    });
    return { invitationId, status: "pending" as const };
  },
});

export const listMyCompanyInvitations = query({
  args: {},
  returns: v.array(invitationValidator),
  handler: async (ctx) => {
    const { company } = await requireCompanyUser(ctx);
    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_companyId_and_createdAt", (q) =>
        q.eq("companyId", company._id),
      )
      .order("desc")
      .take(MAX_INVITATIONS);
    return await Promise.all(rows.map((row) => toInvitationDto(ctx, row, "company")));
  },
});

export const listProjectInvitations = query({
  args: { projectId: v.id("projects") },
  returns: v.array(invitationValidator),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    await requireOwnedProject(ctx, userId, args.projectId);
    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_projectId_and_companyId", (q) =>
        q.eq("projectId", args.projectId),
      )
      .order("desc")
      .take(MAX_INVITATIONS);
    return await Promise.all(rows.map((row) => toInvitationDto(ctx, row, "client")));
  },
});

async function decideInvitation(
  ctx: MutationCtx,
  invitationId: Id<"invitations">,
  nextStatus: Exclude<InvitationStatus, "pending">,
) {
  const { company, userId } = await requireCompanyUser(ctx);
  const invitation = await ctx.db.get(invitationId);
  if (!invitation || invitation.companyId !== company._id)
    throw new ConvexError("INVITATION_NOT_FOUND");
  if (nextStatus === "accepted" && company.verificationStatus !== "verified")
    throw new ConvexError("COMPANY_NOT_ELIGIBLE_FOR_INVITATION");
  if (nextStatus === "accepted") assertCompanyMarketplaceWriteAllowed(company);
  const project = await ctx.db.get(invitation.projectId);
  if (!project || project.clientId !== invitation.clientUserId)
    throw new ConvexError("INVITATION_NOT_FOUND");
  if (
    nextStatus === "accepted" &&
    (!isInvitationProjectEligible(project.status) || project.selectedCompanyId)
  )
    throw new ConvexError("PROJECT_NOT_ELIGIBLE_FOR_INVITATION");
  assertInvitationTransition(invitation.status, nextStatus);
  const now = Date.now();
  await ctx.db.patch(invitation._id, {
    status: nextStatus,
    updatedAt: now,
    ...(nextStatus === "accepted" ? { acceptedAt: now } : { declinedAt: now }),
  });
  await ctx.db.insert("invitationStatusHistory", {
    invitationId: invitation._id,
    projectId: project._id,
    companyId: company._id,
    fromStatus: invitation.status,
    toStatus: nextStatus,
    actorUserId: userId,
    createdAt: now,
  });
  const conversationId =
    nextStatus === "accepted"
      ? await ensureConversationForAcceptedInvitation(
          ctx,
          {
            ...invitation,
            status: "accepted",
            acceptedAt: now,
            updatedAt: now,
          },
          project,
          userId,
        )
      : undefined;
  if (nextStatus === "accepted" && project.status === "published") {
    assertProjectTransition(project.status, "in_discussion");
    await ctx.db.patch(project._id, {
      status: "in_discussion",
      updatedAt: now,
    });
    await ctx.db.insert("projectStatusHistory", {
      projectId: project._id,
      oldStatus: project.status,
      newStatus: "in_discussion",
      changedBy: userId,
      changedAt: now,
    });
  }
  await appendMarketplaceActivity(ctx, {
    projectId: project._id,
    eventType:
      nextStatus === "accepted"
        ? "company_invitation_accepted"
        : "company_invitation_declined",
    actorUserId: userId,
    actorType: "company",
    companyId: company._id,
    invitationId: invitation._id,
    conversationId,
    oldStatus: invitation.status,
    newStatus: nextStatus,
    createdAt: now,
  });
  await createNotification(ctx, {
    recipientUserId: project.clientId,
    actorUserId: userId,
    type: nextStatus === "accepted" ? "invitation_accepted" : "invitation_declined",
    entity: { type: "invitation", id: invitation._id },
    payload: {
      ...(project.title?.trim() ? { projectTitle: project.title.trim() } : {}),
      ...(company.name?.trim() ? { companyName: company.name.trim() } : {}),
    },
    dedupeKey: `invitation:${invitation._id}:${nextStatus}`,
  });
  return { status: nextStatus };
}

export const acceptInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  returns: v.object({ status: v.literal("accepted") }),
  handler: async (ctx, args) =>
    (await decideInvitation(ctx, args.invitationId, "accepted")) as {
      status: "accepted";
    },
});

export const declineInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  returns: v.object({ status: v.literal("declined") }),
  handler: async (ctx, args) =>
    (await decideInvitation(ctx, args.invitationId, "declined")) as {
      status: "declined";
    },
});
