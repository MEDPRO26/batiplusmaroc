import { paginationOptsValidator, paginationResultValidator, type PaginationOptions } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  agreementFor, assertNewAgreementAction, assertVersion, eligibleSource, getOrCreateAgreement,
  readinessEligible, requireContext, safeDisplayName,
  type Agreement, type Context, type Ctx, type Version,
} from "./access";
import {
  assertProspectiveStart, checkedAsOf, checkedRevision, MAX_HISTORY_PAGE_SIZE, normalizeTerms,
  nullableVersionId, publicationKey, termsValidator,
} from "./validators";

const confirmationDtoValidator = v.object({
  confirmedByDisplayName: v.string(), confirmedAt: v.number(), effectiveFrom: v.number(),
  notStartedDeclaredAt: v.union(v.number(), v.null()),
});
const versionDtoValidator = v.object({
  id: v.id("coordinationAgreementVersions"), versionNumber: v.number(), terms: termsValidator,
  publishedByDisplayName: v.string(), publishedAt: v.number(), replacesVersionId: nullableVersionId,
  adminNotStartedDeclaredAt: v.union(v.number(), v.null()),
  confirmation: v.union(confirmationDtoValidator, v.null()),
  status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("superseded")),
  isCurrentConfirmed: v.boolean(),
});
const summaryFields = {
  id: v.id("coordinationAgreements"), projectId: v.id("projects"),
  supportConversationId: v.id("clientSupportConversations"),
  readiness: v.object({ eligible: v.boolean(), declaredAt: v.union(v.number(), v.null()), revision: v.number() }),
  // Eligibility is advisory at the query's explicit asOf; mutations always use server time.
  projectAllowsNewActions: v.boolean(),
  pendingConfirmationStatus: v.union(v.null(), v.literal("ready"), v.literal("readiness_changed"),
    v.literal("source_unavailable"), v.literal("project_blocked"), v.literal("start_date_passed"),
    v.literal("declaration_missing")),
  pendingVersion: v.union(versionDtoValidator, v.null()),
  currentConfirmedVersion: v.union(versionDtoValidator, v.null()),
  versionCount: v.number(),
};
const clientSummaryValidator = v.object(summaryFields);
const adminSummaryValidator = v.object({
  ...summaryFields,
  draftRevision: v.number(),
  draft: v.union(v.object({
    terms: termsValidator, savedAt: v.number(), savedByDisplayName: v.string(),
  }), v.null()),
});
const publicationResultValidator = v.object({
  versionId: v.id("coordinationAgreementVersions"), versionNumber: v.number(),
  publishedAt: v.number(), duplicate: v.boolean(),
});
const confirmationResultValidator = v.object({
  versionId: v.id("coordinationAgreementVersions"), versionNumber: v.number(),
  confirmedAt: v.number(), effectiveFrom: v.number(), duplicate: v.boolean(),
});

function versionDto(agreement: Agreement, version: Version) {
  assertVersion(agreement, version);
  return {
    id: version._id, versionNumber: version.versionNumber, terms: version.terms,
    publishedByDisplayName: version.publishedByDisplayName, publishedAt: version.publishedAt,
    replacesVersionId: version.replacesVersionId ?? null,
    adminNotStartedDeclaredAt: version.adminNotStartedDeclaration?.declaredAt ?? null,
    confirmation: version.confirmation ? {
      confirmedByDisplayName: version.confirmation.confirmedByDisplayName,
      confirmedAt: version.confirmation.confirmedAt, effectiveFrom: version.confirmation.effectiveFrom,
      notStartedDeclaredAt: version.confirmation.notStartedDeclaration?.declaredAt ?? null,
    } : null,
    status: version.confirmation ? "confirmed" as const
      : agreement.pendingVersionId === version._id ? "pending" as const : "superseded" as const,
    isCurrentConfirmed: agreement.currentConfirmedVersionId === version._id,
  };
}

async function versionsAtPointers(ctx: Ctx, agreement: Agreement) {
  const [pending, current] = await Promise.all([
    agreement.pendingVersionId ? ctx.db.get(agreement.pendingVersionId) : null,
    agreement.currentConfirmedVersionId ? ctx.db.get(agreement.currentConfirmedVersionId) : null,
  ]);
  if (agreement.pendingVersionId) {
    assertVersion(agreement, pending);
    if (pending.confirmation || pending.replacesVersionId !== agreement.currentConfirmedVersionId) {
      throw new ConvexError("COORDINATION_VERSION_CONFLICT");
    }
  }
  if (agreement.currentConfirmedVersionId) {
    assertVersion(agreement, current);
    if (!current.confirmation) throw new ConvexError("COORDINATION_VERSION_CONFLICT");
  }
  return { pending, current };
}

function publicationResult(version: Version, duplicate: boolean) {
  return { versionId: version._id, versionNumber: version.versionNumber, publishedAt: version.publishedAt, duplicate };
}

function confirmationResult(version: Version, duplicate: boolean) {
  if (!version.confirmation) throw new ConvexError("COORDINATION_VERSION_CONFLICT");
  return { versionId: version._id, versionNumber: version.versionNumber,
    confirmedAt: version.confirmation.confirmedAt, effectiveFrom: version.confirmation.effectiveFrom, duplicate };
}

export const setMyReadiness = mutation({
  args: {
    projectId: v.id("projects"), revisionId: v.union(v.id("finalQuoteRevisions"), v.null()),
    expectedReadinessRevision: v.number(),
  },
  returns: v.object({
    agreementId: v.id("coordinationAgreements"), readinessRevision: v.number(),
    declaredAt: v.union(v.number(), v.null()), duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const context = await requireContext(ctx, args.projectId, "client");
    const agreement = await getOrCreateAgreement(ctx, context);
    checkedRevision(args.expectedReadinessRevision);
    const now = Date.now();
    const source = args.revisionId ? await eligibleSource(ctx, context, args.revisionId, now) : null;
    if (args.revisionId && !source) throw new ConvexError("COORDINATION_READINESS_NOT_ELIGIBLE");
    if (args.expectedReadinessRevision !== agreement.readinessRevision) throw new ConvexError("COORDINATION_READINESS_CONFLICT");
    const same = source ? agreement.readiness?.revisionId === source.revisionId
      && await readinessEligible(ctx, context, agreement.readiness, now) : !agreement.readiness;
    if (same) return { agreementId: agreement._id, readinessRevision: agreement.readinessRevision,
      declaredAt: agreement.readiness?.declaredAt ?? null, duplicate: true };
    const readinessRevision = checkedRevision(agreement.readinessRevision) + 1;
    await ctx.db.patch(agreement._id, {
      readinessRevision, updatedAt: now,
      readiness: source ? { ...source, declaredByUserId: context.actor._id, declaredAt: now } : undefined,
    });
    return { agreementId: agreement._id, readinessRevision, declaredAt: source ? now : null, duplicate: false };
  },
});

export const saveAdminDraft = mutation({
  args: { projectId: v.id("projects"), expectedDraftRevision: v.number(), terms: termsValidator },
  returns: v.object({ agreementId: v.id("coordinationAgreements"), draftRevision: v.number(), savedAt: v.number() }),
  handler: async (ctx, args) => {
    const context = await requireContext(ctx, args.projectId, "admin");
    const agreement = await getOrCreateAgreement(ctx, context);
    if (checkedRevision(args.expectedDraftRevision) !== agreement.draftRevision) throw new ConvexError("COORDINATION_DRAFT_CONFLICT");
    const draft = normalizeTerms(args.terms);
    const draftRevision = checkedRevision(agreement.draftRevision) + 1;
    const savedAt = Date.now();
    await ctx.db.patch(agreement._id, { draft, draftRevision, draftSavedAt: savedAt,
      draftSavedByUserId: context.actor._id, updatedAt: savedAt });
    return { agreementId: agreement._id, draftRevision, savedAt };
  },
});

export const publishAdminDraft = mutation({
  args: {
    projectId: v.id("projects"), expectedDraftRevision: v.number(), expectedReadinessRevision: v.number(),
    expectedPendingVersionId: nullableVersionId, expectedConfirmedVersionId: nullableVersionId,
    idempotencyKey: v.string(), attestNotStarted: v.optional(v.boolean()),
  },
  returns: publicationResultValidator,
  handler: async (ctx, args) => {
    const context = await requireContext(ctx, args.projectId, "admin");
    const agreement = await agreementFor(ctx, context);
    if (!agreement) throw new ConvexError("COORDINATION_AGREEMENT_NOT_FOUND");
    const key = publicationKey(args.idempotencyKey);
    const publicationInput = {
      expectedDraftRevision: checkedRevision(args.expectedDraftRevision),
      expectedReadinessRevision: checkedRevision(args.expectedReadinessRevision),
      expectedPendingVersionId: args.expectedPendingVersionId, expectedConfirmedVersionId: args.expectedConfirmedVersionId,
      attestNotStarted: args.attestNotStarted ?? null,
    };
    const previous = await ctx.db.query("coordinationAgreementVersions")
      .withIndex("by_publishedByUserId_and_publicationKey", q => q.eq("publishedByUserId", context.actor._id).eq("publicationKey", key)).unique();
    if (previous) {
      if (previous.agreementId !== agreement._id
        || previous.publicationInput.expectedDraftRevision !== publicationInput.expectedDraftRevision
        || previous.publicationInput.expectedReadinessRevision !== publicationInput.expectedReadinessRevision
        || previous.publicationInput.expectedPendingVersionId !== publicationInput.expectedPendingVersionId
        || previous.publicationInput.expectedConfirmedVersionId !== publicationInput.expectedConfirmedVersionId
        || previous.publicationInput.attestNotStarted !== publicationInput.attestNotStarted) {
        throw new ConvexError("IDEMPOTENCY_KEY_CONFLICT");
      }
      assertVersion(agreement, previous);
      return publicationResult(previous, true);
    }
    if (!agreement.draft || agreement.draftRevision !== args.expectedDraftRevision) throw new ConvexError("COORDINATION_DRAFT_CONFLICT");
    if ((agreement.pendingVersionId ?? null) !== args.expectedPendingVersionId
      || (agreement.currentConfirmedVersionId ?? null) !== args.expectedConfirmedVersionId) throw new ConvexError("COORDINATION_VERSION_CONFLICT");
    if (agreement.readinessRevision !== args.expectedReadinessRevision) throw new ConvexError("COORDINATION_READINESS_CONFLICT");
    await versionsAtPointers(ctx, agreement);
    assertNewAgreementAction(context.project);
    const now = Date.now();
    if (!agreement.readiness || !await readinessEligible(ctx, context, agreement.readiness, now)) {
      throw new ConvexError("COORDINATION_READINESS_NOT_ELIGIBLE");
    }
    const terms = normalizeTerms(agreement.draft);
    assertProspectiveStart(terms, now);
    const first = !agreement.currentConfirmedVersionId;
    if (first && args.attestNotStarted !== true) throw new ConvexError("COORDINATION_NOT_STARTED_DECLARATION_REQUIRED");
    const versionNumber = checkedRevision(agreement.versionCount) + 1;
    const versionId = await ctx.db.insert("coordinationAgreementVersions", {
      agreementId: agreement._id, versionNumber, terms,
      readinessRevision: agreement.readinessRevision, readiness: agreement.readiness,
      replacesVersionId: agreement.currentConfirmedVersionId,
      publishedByUserId: context.actor._id, publishedByDisplayName: safeDisplayName(context.actor), publishedAt: now,
      publicationKey: key, publicationInput,
      ...(first ? { adminNotStartedDeclaration: { declared: true as const, actorUserId: context.actor._id, declaredAt: now } } : {}),
    });
    // Consuming a draft advances its CAS token so a stale editor cannot recreate it.
    await ctx.db.patch(agreement._id, { pendingVersionId: versionId, versionCount: versionNumber,
      draftRevision: checkedRevision(agreement.draftRevision) + 1,
      draft: undefined, draftSavedAt: undefined, draftSavedByUserId: undefined, updatedAt: now });
    return { versionId, versionNumber, publishedAt: now, duplicate: false };
  },
});

export const confirmMyVersion = mutation({
  args: {
    projectId: v.id("projects"), versionId: v.id("coordinationAgreementVersions"),
    expectedConfirmedVersionId: nullableVersionId, attestNotStarted: v.optional(v.boolean()),
  },
  returns: confirmationResultValidator,
  handler: async (ctx, args) => {
    const context = await requireContext(ctx, args.projectId, "client");
    const agreement = await agreementFor(ctx, context);
    if (!agreement) throw new ConvexError("COORDINATION_AGREEMENT_NOT_FOUND");
    const version = await ctx.db.get(args.versionId);
    assertVersion(agreement, version);
    // Historical retries never reapply confirmation, even after replacement or lifecycle/source changes.
    if (version.confirmation) return confirmationResult(version, true);
    if (agreement.pendingVersionId !== version._id || (agreement.currentConfirmedVersionId ?? null) !== args.expectedConfirmedVersionId
      || version.replacesVersionId !== agreement.currentConfirmedVersionId) throw new ConvexError("COORDINATION_VERSION_CONFLICT");
    await versionsAtPointers(ctx, agreement);
    if (agreement.readinessRevision !== version.readinessRevision
      || agreement.readiness?.revisionId !== version.readiness.revisionId) throw new ConvexError("COORDINATION_READINESS_CONFLICT");
    assertNewAgreementAction(context.project);
    const now = Date.now();
    if (!await readinessEligible(ctx, context, version.readiness, now)
      || !await readinessEligible(ctx, context, agreement.readiness, now)) throw new ConvexError("COORDINATION_READINESS_NOT_ELIGIBLE");
    assertProspectiveStart(version.terms, now);
    const first = !version.replacesVersionId;
    if (first && (args.attestNotStarted !== true || !version.adminNotStartedDeclaration)) {
      throw new ConvexError("COORDINATION_NOT_STARTED_DECLARATION_REQUIRED");
    }
    const confirmation = {
      confirmedByUserId: context.actor._id, confirmedByDisplayName: safeDisplayName(context.actor), confirmedAt: now,
      effectiveFrom: Math.max(now, Date.parse(`${version.terms.startDate}T00:00:00.000Z`)),
      ...(first ? { notStartedDeclaration: { declared: true as const, actorUserId: context.actor._id, declaredAt: now } } : {}),
    };
    await ctx.db.patch(version._id, { confirmation });
    await ctx.db.patch(agreement._id, { currentConfirmedVersionId: version._id, pendingVersionId: undefined, updatedAt: now });
    return confirmationResult({ ...version, confirmation }, false);
  },
});

// Advisory only: keep source references internal and leave exact-version confirmation authoritative.
async function pendingConfirmationStatus(ctx: Ctx, context: Context, agreement: Agreement,
  pending: Version | null, eligible: boolean, asOf: number) {
  if (!pending) return null;
  if (agreement.readinessRevision !== pending.readinessRevision
    || agreement.readiness?.revisionId !== pending.readiness.revisionId) return "readiness_changed" as const;
  try {
    assertNewAgreementAction(context.project);
    if (!eligible || !await readinessEligible(ctx, context, pending.readiness, asOf)) return "source_unavailable" as const;
    assertProspectiveStart(pending.terms, asOf);
  } catch (error) {
    if (error instanceof ConvexError && error.data === "COORDINATION_PROJECT_NOT_ELIGIBLE") return "project_blocked" as const;
    if (error instanceof ConvexError && error.data === "COORDINATION_START_DATE_PASSED") return "start_date_passed" as const;
    throw error;
  }
  if (!pending.replacesVersionId && !pending.adminNotStartedDeclaration) return "declaration_missing" as const;
  return "ready" as const;
}

async function summary(ctx: Ctx, context: Context, agreement: Agreement, asOf: number) {
  const { pending, current } = await versionsAtPointers(ctx, agreement);
  const eligible = await readinessEligible(ctx, context, agreement.readiness, asOf);
  return {
    id: agreement._id, projectId: agreement.projectId, supportConversationId: agreement.supportConversationId,
    readiness: { eligible, declaredAt: agreement.readiness?.declaredAt ?? null, revision: agreement.readinessRevision },
    projectAllowsNewActions: !["draft", "completed", "cancelled", "archived"].includes(context.project.status),
    pendingConfirmationStatus: await pendingConfirmationStatus(ctx, context, agreement, pending, eligible, asOf),
    pendingVersion: pending ? versionDto(agreement, pending) : null,
    currentConfirmedVersion: current ? versionDto(agreement, current) : null,
    versionCount: agreement.versionCount,
  };
}

export const getMyAgreement = query({
  args: { projectId: v.id("projects"), asOf: v.number() },
  returns: v.union(clientSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await requireContext(ctx, args.projectId, "client");
    const agreement = await agreementFor(ctx, context);
    const asOf = checkedAsOf(args.asOf);
    return agreement ? summary(ctx, context, agreement, asOf) : null;
  },
});

export const getAdminAgreement = query({
  args: { projectId: v.id("projects"), asOf: v.number() },
  returns: v.union(adminSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await requireContext(ctx, args.projectId, "admin");
    const agreement = await agreementFor(ctx, context);
    const asOf = checkedAsOf(args.asOf);
    if (!agreement) return null;
    const author = agreement.draftSavedByUserId ? await ctx.db.get(agreement.draftSavedByUserId) : null;
    return { ...await summary(ctx, context, agreement, asOf), draftRevision: agreement.draftRevision,
      draft: agreement.draft ? { terms: agreement.draft, savedAt: agreement.draftSavedAt!,
        savedByDisplayName: author ? safeDisplayName(author) : "" } : null };
  },
});

async function history(ctx: Ctx, context: Context, paginationOpts: PaginationOptions) {
  const agreement = await agreementFor(ctx, context);
  if (!Number.isInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > MAX_HISTORY_PAGE_SIZE) {
    throw new ConvexError("INVALID_PAGINATION");
  }
  if (!agreement) return { page: [], isDone: true, continueCursor: "" };
  const result = await ctx.db.query("coordinationAgreementVersions")
    .withIndex("by_agreementId_and_versionNumber", q => q.eq("agreementId", agreement._id))
    .order("desc").paginate(paginationOpts);
  return { ...result, page: result.page.map(version => versionDto(agreement, version)) };
}

export const listMyVersions = query({
  args: { projectId: v.id("projects"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(versionDtoValidator),
  handler: async (ctx, args) => history(ctx, await requireContext(ctx, args.projectId, "client"), args.paginationOpts),
});

export const listAdminVersions = query({
  args: { projectId: v.id("projects"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(versionDtoValidator),
  handler: async (ctx, args) => history(ctx, await requireContext(ctx, args.projectId, "admin"), args.paginationOpts),
});
