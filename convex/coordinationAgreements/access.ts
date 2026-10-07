import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireAdminUser } from "../admin/access";
import { supportContextFor, type SupportContext } from "../clientSupport/access";
import { requireClientUser, requireOwnedProject } from "../projects/access";
import { validDate, type Readiness } from "./validators";

export type Ctx = QueryCtx | MutationCtx;
export type Context = SupportContext & { actor: Doc<"users"> };
export type Agreement = Doc<"coordinationAgreements">;
export type Version = Doc<"coordinationAgreementVersions">;

export async function requireContext(ctx: Ctx, projectId: Id<"projects">, role: "client" | "admin"): Promise<Context> {
  const actor = role === "admin" ? await requireAdminUser(ctx) : (await requireClientUser(ctx)).user;
  if (role === "client") await requireOwnedProject(ctx, actor._id, projectId);
  const conversation = await ctx.db.query("clientSupportConversations")
    .withIndex("by_projectId", q => q.eq("projectId", projectId)).unique();
  const context = conversation ? await supportContextFor(ctx, conversation) : null;
  if (!context || (role === "client" && context.client._id !== actor._id)) {
    throw new ConvexError("COORDINATION_AGREEMENT_NOT_FOUND");
  }
  return { ...context, actor };
}

export async function agreementFor(ctx: Ctx, context: Context) {
  const [byProject, byConversation] = await Promise.all([
    ctx.db.query("coordinationAgreements").withIndex("by_projectId", q => q.eq("projectId", context.project._id)).unique(),
    ctx.db.query("coordinationAgreements").withIndex("by_supportConversationId", q => q.eq("supportConversationId", context.conversation._id)).unique(),
  ]);
  if (byProject?._id !== byConversation?._id || (byProject && (
    byProject.clientId !== context.client._id || byProject.projectId !== context.project._id
    || byProject.supportConversationId !== context.conversation._id
  ))) throw new ConvexError("COORDINATION_AGREEMENT_NOT_FOUND");
  return byProject;
}

export async function getOrCreateAgreement(ctx: MutationCtx, context: Context) {
  const existing = await agreementFor(ctx, context);
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("coordinationAgreements", {
    projectId: context.project._id, supportConversationId: context.conversation._id, clientId: context.client._id,
    readinessRevision: 0, draftRevision: 0, versionCount: 0, createdAt: now, updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

export function assertNewAgreementAction(project: Doc<"projects">) {
  if (["draft", "completed", "cancelled", "archived"].includes(project.status)) {
    throw new ConvexError("COORDINATION_PROJECT_NOT_ELIGIBLE");
  }
}

export function safeDisplayName(user: Doc<"users">) {
  return ([user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ") || user.name?.trim() || "").slice(0, 200);
}

export function assertVersion(agreement: Agreement, version: Version | null): asserts version is Version {
  if (!version || version.agreementId !== agreement._id || version.readiness.declaredByUserId !== agreement.clientId
    || !Number.isSafeInteger(version.versionNumber) || version.versionNumber < 1 || version.versionNumber > agreement.versionCount
    || (version.confirmation && version.confirmation.confirmedByUserId !== agreement.clientId)) {
    throw new ConvexError("COORDINATION_VERSION_NOT_FOUND");
  }
}

/** Read source metadata internally; never use the broader admin quote/PDF guard or return its DTO. */
export async function eligibleSource(ctx: Ctx, context: Context, revisionId: Id<"finalQuoteRevisions">, asOf: number) {
  const revision = await ctx.db.get(revisionId);
  const quote = revision ? await ctx.db.get(revision.finalQuoteId) : null;
  if (!revision || !quote || quote.projectId !== context.project._id || quote.clientId !== context.client._id
    || quote.currentRevisionId !== revision._id || revision.currency !== "MAD") return null;
  const [company, conversation, initial] = await Promise.all([
    ctx.db.get(quote.companyId), ctx.db.get(quote.conversationId), ctx.db.get(quote.initialQuoteId),
  ]);
  if (!company || !conversation || !initial || conversation.status !== "active"
    || conversation.projectId !== context.project._id || conversation.clientId !== context.client._id
    || conversation.companyId !== company._id || conversation.quoteId !== initial._id
    || initial.projectId !== context.project._id || initial.companyId !== company._id || initial.status !== "discussion_open") return null;
  // Preserve marketplace invitation integrity as well as the quote-unlock gate.
  if (conversation.invitationId) {
    const invitation = await ctx.db.get(conversation.invitationId);
    if (!invitation || invitation.projectId !== context.project._id || invitation.companyId !== company._id
      || invitation.clientUserId !== context.client._id) return null;
  }
  const project = context.project;
  if ((project.selectedCompanyId && project.selectedCompanyId !== company._id)
    || (project.selectedFinalQuoteId && project.selectedFinalQuoteId !== quote._id)) return null;
  if (quote.status === "submitted") {
    if (!validDate(revision.validUntil) || revision.validUntil < new Date(asOf).toISOString().slice(0, 10)) return null;
  } else if (quote.status === "accepted") {
    if (quote.acceptedRevisionId !== revision._id || quote.acceptedByUserId !== context.client._id
      || project.selectedCompanyId !== company._id || project.selectedFinalQuoteId !== quote._id) return null;
  } else return null;
  return { finalQuoteId: quote._id, revisionId: revision._id, companyId: company._id,
    marketplaceConversationId: conversation._id, initialQuoteId: initial._id };
}

export async function readinessEligible(ctx: Ctx, context: Context, readiness: Readiness | undefined, asOf: number) {
  if (!readiness || readiness.declaredByUserId !== context.client._id) return false;
  const source = await eligibleSource(ctx, context, readiness.revisionId, asOf);
  return source !== null && source.finalQuoteId === readiness.finalQuoteId && source.companyId === readiness.companyId
    && source.marketplaceConversationId === readiness.marketplaceConversationId && source.initialQuoteId === readiness.initialQuoteId;
}
