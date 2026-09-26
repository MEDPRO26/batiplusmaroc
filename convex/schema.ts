import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  marketplaceActivityActorTypeValidator,
  marketplaceActivityEventTypeValidator,
  marketplaceActivityMetadataValidator,
} from "./marketplaceActivity/constants";
import { dealStatusValidator } from "./deals/constants";

const accountType = v.union(
  v.literal("client"),
  v.literal("company"),
  v.literal("admin"),
  v.literal("seo_team"),
);
const onboardingStatus = v.union(v.literal("pending"), v.literal("completed"));
const companySize = v.union(
  v.literal("solo"),
  v.literal("2to10"),
  v.literal("11to50"),
  v.literal("51to200"),
  v.literal("201plus"),
);
const companyLanguage = v.union(
  v.literal("arabic"),
  v.literal("french"),
  v.literal("english"),
  v.literal("amazigh"),
  v.literal("spanish"),
);
const companyServiceArea = v.union(
  v.literal("agadir"),
  v.literal("casablanca"),
  v.literal("fes"),
  v.literal("marrakech"),
  v.literal("meknes"),
  v.literal("oujda"),
  v.literal("rabat"),
  v.literal("sale"),
  v.literal("tangier"),
  v.literal("tetouan"),
);
const projectCategory = v.union(
  v.literal("houseConstruction"), v.literal("buildingConstruction"), v.literal("renovation"),
  v.literal("interior"), v.literal("structural"), v.literal("finishing"), v.literal("architecture"),
  v.literal("pool"), v.literal("electrical"), v.literal("plumbing"), v.literal("painting"), v.literal("other"),
);
const projectPropertyType = v.union(v.literal("house"), v.literal("apartment"), v.literal("building"), v.literal("office"), v.literal("shop"), v.literal("land"), v.literal("other"));
const projectBudgetRange = v.union(v.literal("under_50000"), v.literal("50000_100000"), v.literal("100000_250000"), v.literal("250000_500000"), v.literal("500000_1000000"), v.literal("1000000_plus"), v.literal("unknown"));
const projectTimeline = v.union(v.literal("asap"), v.literal("within_1_month"), v.literal("one_to_three_months"), v.literal("three_to_six_months"), v.literal("six_plus_months"), v.literal("flexible"));
const projectStatus = v.union(v.literal("draft"), v.literal("pending_review"), v.literal("needs_changes"), v.literal("published"), v.literal("in_discussion"), v.literal("company_selected"), v.literal("in_progress"), v.literal("completed"), v.literal("cancelled"), v.literal("archived"));
const initialQuoteStatus = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("viewed"),
  v.literal("shortlisted"),
  v.literal("discussion_open"),
  v.literal("declined"),
  v.literal("withdrawn"),
);
const finalQuoteStatus = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("changes_requested"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("withdrawn"),
);
const seoLocale = v.union(v.literal("fr"), v.literal("en"));
const seoSearchIntent = v.union(
  v.literal("informational"),
  v.literal("commercial"),
  v.literal("transactional"),
  v.literal("navigational"),
  v.literal("local"),
);
const seoRobotsDirective = v.union(
  v.literal("index,follow"),
  v.literal("noindex,follow"),
  v.literal("index,nofollow"),
  v.literal("noindex,nofollow"),
);
const seoArticleStatus = v.union(
  v.literal("draft"), v.literal("review"), v.literal("published"), v.literal("archived"),
);
const seoPillarStatus = v.union(v.literal("planned"), v.literal("active"), v.literal("archived"));
const seoClusterStatus = v.union(
  v.literal("planned"), v.literal("briefed"), v.literal("writing"),
  v.literal("published"), v.literal("archived"),
);
const seoBriefStatus = v.union(
  v.literal("draft"), v.literal("ready"), v.literal("converted"), v.literal("archived"),
);
export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    /** Always "MA" for V1 — set only by the backend. */
    countryCode: v.optional(v.literal("MA")),
    accountType: v.optional(accountType),
    /** @deprecated Read-only compatibility for users created before termsAcceptedAt. */
    acceptedTerms: v.optional(v.boolean()),
    termsAcceptedAt: v.optional(v.number()),
    marketingOptIn: v.optional(v.boolean()),
    onboardingStatus: v.optional(onboardingStatus),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_accountType", ["accountType"]),

  clientProfiles: defineTable({
    userId: v.id("users"),
    city: v.optional(v.string()),
    /** Optional R2 object key for the client's profile photo. */
    avatarObjectKey: v.optional(v.string()),
    avatarMimeType: v.optional(v.string()),
    avatarSize: v.optional(v.number()),
    onboardingStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_avatarObjectKey", ["avatarObjectKey"]),

  clientAvatarUploadIntents: defineTable({
    userId: v.id("users"),
    expectedContentType: v.string(),
    expectedSize: v.number(),
    objectKey: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    verifiedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
    etag: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_objectKey", ["objectKey"]),

  projects: defineTable({
    clientId: v.id("users"), primaryCategory: v.optional(projectCategory), customCategoryText: v.optional(v.string()),
    city: v.optional(companyServiceArea), neighborhood: v.optional(v.string()), countryCode: v.literal("MA"),
    title: v.optional(v.string()), propertyType: v.optional(projectPropertyType), surface: v.optional(v.number()),
    surfaceUnknown: v.boolean(), description: v.optional(v.string()), budgetRange: v.optional(projectBudgetRange),
    budgetMin: v.optional(v.number()), budgetMax: v.optional(v.number()), budgetUnknown: v.boolean(),
    timeline: v.optional(projectTimeline), visibility: v.union(v.literal("marketplace"), v.literal("invite_only")),
    /** Public-only denormalized text used by the authenticated company marketplace. */
    marketplaceSearchText: v.optional(v.string()),
    /** Denormalized budget rank for marketplace sorting (0=unknown … 6=1M+). */
    marketplaceBudgetRank: v.optional(v.number()),
    status: projectStatus, lastCompletedStep: v.number(), createdAt: v.number(), updatedAt: v.number(),
    selectedCompanyId: v.optional(v.id("companies")),
    selectedFinalQuoteId: v.optional(v.id("finalQuotes")),
    selectedAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()), publishedAt: v.optional(v.number()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_clientId_and_status", ["clientId", "status"])
    .index("by_status", ["status"])
    .index("by_status_and_city", ["status", "city"])
    .index("by_status_and_visibility", ["status", "visibility"])
    .index("by_status_visibility_publishedAt", ["status", "visibility", "publishedAt"])
    .index("by_status_visibility_city_publishedAt", ["status", "visibility", "city", "publishedAt"])
    .index("by_status_visibility_category_publishedAt", ["status", "visibility", "primaryCategory", "publishedAt"])
    .index("by_status_visibility_budget_publishedAt", ["status", "visibility", "budgetRange", "publishedAt"])
    .index("by_status_visibility_timeline_publishedAt", ["status", "visibility", "timeline", "publishedAt"])
    .index("by_status_visibility_propertyType_publishedAt", ["status", "visibility", "propertyType", "publishedAt"])
    .index("by_status_visibility_budgetRank_publishedAt", ["status", "visibility", "marketplaceBudgetRank", "publishedAt"])
    .index("by_status_visibility_city_category_publishedAt", ["status", "visibility", "city", "primaryCategory", "publishedAt"])
    .index("by_status_visibility_city_budget_publishedAt", ["status", "visibility", "city", "budgetRange", "publishedAt"])
    .index("by_status_visibility_category_budget_publishedAt", ["status", "visibility", "primaryCategory", "budgetRange", "publishedAt"])
    .index("by_status_visibility_city_category_budget_publishedAt", ["status", "visibility", "city", "primaryCategory", "budgetRange", "publishedAt"])
    .index("by_primaryCategory_and_status", ["primaryCategory", "status"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_marketplace", {
      searchField: "marketplaceSearchText",
      filterFields: ["status", "visibility", "city", "primaryCategory", "budgetRange", "timeline", "propertyType"],
    }),

  projectStatusHistory: defineTable({
    projectId: v.id("projects"), oldStatus: projectStatus, newStatus: projectStatus,
    changedBy: v.id("users"), changedAt: v.number(), reason: v.optional(v.string()),
  }).index("by_projectId", ["projectId"]).index("by_projectId_and_changedAt", ["projectId", "changedAt"]),

  marketplaceActivity: defineTable({
    projectId: v.id("projects"),
    eventType: marketplaceActivityEventTypeValidator,
    actorUserId: v.id("users"),
    actorType: marketplaceActivityActorTypeValidator,
    companyId: v.optional(v.id("companies")),
    quoteId: v.optional(v.id("projectQuotes")),
    conversationId: v.optional(v.id("conversations")),
    siteAssessmentId: v.optional(v.id("siteAssessments")),
    siteVisitId: v.optional(v.id("siteVisits")),
    finalQuoteId: v.optional(v.id("finalQuotes")),
    finalQuoteRevisionId: v.optional(v.id("finalQuoteRevisions")),
    dealId: v.optional(v.id("deals")),
    oldStatus: v.optional(v.string()),
    newStatus: v.optional(v.string()),
    reason: v.optional(v.string()),
    metadata: v.optional(marketplaceActivityMetadataValidator),
    createdAt: v.number(),
  })
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"])
    .index("by_eventType_and_createdAt", ["eventType", "createdAt"])
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"])
    .index("by_finalQuoteId_and_createdAt", ["finalQuoteId", "createdAt"])
    .index("by_dealId_and_createdAt", ["dealId", "createdAt"]),

  siteAssessments: defineTable({
    projectId: v.id("projects"),
    clientId: v.id("users"),
    companyId: v.id("companies"),
    initialQuoteId: v.id("projectQuotes"),
    conversationId: v.id("conversations"),
    status: v.union(
      v.literal("invited"),
      v.literal("accepted"),
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("declined"),
      v.literal("cancelled"),
    ),
    active: v.boolean(),
    invitedByUserId: v.id("users"),
    invitedAt: v.number(),
    acceptedAt: v.optional(v.number()),
    acceptedMarketplaceTermsAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    scheduledAt: v.optional(v.number()),
    siteAddress: v.optional(v.string()),
    clientNote: v.optional(v.string()),
    companyNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId_and_active", ["projectId", "active"])
    .index("by_conversationId", ["conversationId"])
    .index("by_projectId_and_companyId", ["projectId", "companyId"]),

  siteVisits: defineTable({
    assessmentId: v.id("siteAssessments"),
    projectId: v.id("projects"),
    clientId: v.id("users"),
    companyId: v.id("companies"),
    conversationId: v.id("conversations"),
    initialQuoteId: v.id("projectQuotes"),
    proposedByUserId: v.id("users"),
    currentProposalId: v.optional(v.id("siteVisitProposals")),
    proposedDate: v.string(),
    proposedTime: v.string(),
    timezone: v.literal("Africa/Casablanca"),
    siteAddress: v.string(),
    note: v.optional(v.string()),
    status: v.union(
      v.literal("proposed"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("declined"),
      v.literal("cancelled"),
    ),
    active: v.boolean(),
    proposedAt: v.number(),
    confirmedByUserId: v.optional(v.id("users")),
    confirmedAt: v.optional(v.number()),
    declinedByUserId: v.optional(v.id("users")),
    declinedAt: v.optional(v.number()),
    cancelledByUserId: v.optional(v.id("users")),
    cancelledAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
    completedByUserId: v.optional(v.id("users")),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_assessmentId_and_active", ["assessmentId", "active"])
    .index("by_createdAt", ["createdAt"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"])
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"]),

  siteVisitProposals: defineTable({
    visitId: v.id("siteVisits"),
    assessmentId: v.id("siteAssessments"),
    sequence: v.number(),
    proposedByUserId: v.id("users"),
    proposedDate: v.string(),
    proposedTime: v.string(),
    timezone: v.literal("Africa/Casablanca"),
    siteAddress: v.string(),
    note: v.optional(v.string()),
    proposedAt: v.number(),
  })
    .index("by_visitId_and_sequence", ["visitId", "sequence"])
    .index("by_assessmentId_and_proposedAt", ["assessmentId", "proposedAt"]),

  projectMedia: defineTable({
    projectId: v.id("projects"), clientId: v.id("users"), storageProvider: v.literal("r2"),
    objectKey: v.string(), mimeType: v.string(), size: v.number(), etag: v.optional(v.string()),
    sortOrder: v.number(), createdAt: v.number(),
  }).index("by_projectId", ["projectId"]).index("by_clientId", ["clientId"]).index("by_objectKey", ["objectKey"]),

  projectMediaUploadIntents: defineTable({
    projectId: v.id("projects"), userId: v.id("users"), expectedContentType: v.string(), expectedSize: v.number(),
    objectKey: v.string(), token: v.string(), expiresAt: v.number(), verifiedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()), etag: v.optional(v.string()), createdAt: v.number(),
  }).index("by_token", ["token"]).index("by_objectKey", ["objectKey"]),

  projectAttachments: defineTable({
    projectId: v.id("projects"), clientId: v.id("users"), storageId: v.id("_storage"), fileName: v.string(),
    contentType: v.string(), size: v.number(), createdAt: v.number(),
  }).index("by_projectId", ["projectId"]).index("by_clientId", ["clientId"]),

  projectAttachmentUploadIntents: defineTable({
    projectId: v.id("projects"), userId: v.id("users"), token: v.string(), expiresAt: v.number(),
    claimedAt: v.optional(v.number()), createdAt: v.number(),
  }).index("by_token", ["token"]),

  projectQuotes: defineTable({
    projectId: v.id("projects"),
    companyId: v.id("companies"),
    submittedByUserId: v.id("users"),
    message: v.string(),
    estimatedPrice: v.number(),
    currency: v.literal("MAD"),
    /** Estimated calendar duration in days. */
    estimatedDuration: v.number(),
    /** ISO calendar date (YYYY-MM-DD), kept timezone-independent. */
    availableStartDate: v.string(),
    scope: v.string(),
    quoteType: v.literal("initial"),
    status: initialQuoteStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    submittedAt: v.number(),
    withdrawnAt: v.optional(v.number()),
  })
    .index("by_projectId_and_companyId", ["projectId", "companyId"])
    .index("by_projectId_and_status", ["projectId", "status"])
    .index("by_companyId_and_status", ["companyId", "status"]),

  finalQuotes: defineTable({
    projectId: v.id("projects"),
    clientId: v.id("users"),
    companyId: v.id("companies"),
    initialQuoteId: v.id("projectQuotes"),
    conversationId: v.id("conversations"),
    siteAssessmentId: v.optional(v.id("siteAssessments")),
    siteVisitId: v.optional(v.id("siteVisits")),
    status: finalQuoteStatus,
    currentRevisionId: v.optional(v.id("finalQuoteRevisions")),
    acceptedRevisionId: v.optional(v.id("finalQuoteRevisions")),
    requestedAt: v.number(),
    requestedByUserId: v.id("users"),
    requestTrigger: v.union(v.literal("client_request"), v.literal("completed_site_visit")),
    changesRequestedAt: v.optional(v.number()),
    changesRequestedByUserId: v.optional(v.id("users")),
    changesRequestReason: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.id("users")),
    declinedAt: v.optional(v.number()),
    declinedByUserId: v.optional(v.id("users")),
    declineReason: v.optional(v.string()),
    withdrawnAt: v.optional(v.number()),
    withdrawnByUserId: v.optional(v.id("users")),
    withdrawalReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId_and_companyId", ["projectId", "companyId"])
    .index("by_projectId", ["projectId"])
    .index("by_projectId_and_status", ["projectId", "status"])
    .index("by_companyId", ["companyId"])
    .index("by_status", ["status"])
    .index("by_conversationId", ["conversationId"]),

  finalQuoteRevisions: defineTable({
    finalQuoteId: v.id("finalQuotes"),
    revisionNumber: v.number(),
    price: v.number(),
    currency: v.literal("MAD"),
    duration: v.number(),
    plannedStartDate: v.string(),
    validUntil: v.string(),
    scope: v.string(),
    inclusions: v.string(),
    exclusions: v.string(),
    paymentTerms: v.string(),
    companyNote: v.optional(v.string()),
    pdfStorageId: v.optional(v.id("_storage")),
    pdfFileName: v.optional(v.string()),
    pdfSize: v.optional(v.number()),
    submittedByUserId: v.id("users"),
    submittedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_finalQuoteId_and_revisionNumber", ["finalQuoteId", "revisionNumber"])
    .index("by_finalQuoteId_and_createdAt", ["finalQuoteId", "createdAt"]),

  finalQuoteUploadIntents: defineTable({
    finalQuoteId: v.id("finalQuotes"),
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_finalQuoteId", ["finalQuoteId"]),

  deals: defineTable({
    projectId: v.id("projects"),
    clientUserId: v.id("users"),
    companyId: v.id("companies"),
    acceptedFinalQuoteId: v.id("finalQuotes"),
    acceptedFinalQuoteRevisionId: v.id("finalQuoteRevisions"),
    /** Operational trace back to the discussion and initial estimate. */
    conversationId: v.id("conversations"),
    initialQuoteId: v.id("projectQuotes"),
    agreedAmountMad: v.number(),
    currency: v.literal("MAD"),
    commissionRateBps: v.number(),
    commissionAmountMad: v.number(),
    status: dealStatusValidator,
    createdAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_clientUserId", ["clientUserId"])
    .index("by_companyId", ["companyId"])
    .index("by_status", ["status"])
    .index("by_acceptedFinalQuoteId", ["acceptedFinalQuoteId"]),

  dealStatusHistory: defineTable({
    dealId: v.id("deals"),
    fromStatus: v.optional(dealStatusValidator),
    toStatus: dealStatusValidator,
    actorUserId: v.id("users"),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_dealId_and_createdAt", ["dealId", "createdAt"]),

  marketplaceSettings: defineTable({
    key: v.literal("global"),
    commissionRateBps: v.number(),
    updatedAt: v.number(),
    updatedByUserId: v.id("users"),
  }).index("by_key", ["key"]),

  marketplaceSettingsHistory: defineTable({
    settingKey: v.literal("commission_rate_bps"),
    oldCommissionRateBps: v.union(v.number(), v.null()),
    newCommissionRateBps: v.number(),
    actorUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_settingKey_and_createdAt", ["settingKey", "createdAt"]),

  quoteStatusHistory: defineTable({
    quoteId: v.id("projectQuotes"),
    oldStatus: initialQuoteStatus,
    newStatus: initialQuoteStatus,
    changedBy: v.id("users"),
    changedAt: v.number(),
    reason: v.optional(v.string()),
  })
    .index("by_quoteId", ["quoteId"])
    .index("by_quoteId_and_changedAt", ["quoteId", "changedAt"]),

  conversations: defineTable({
    projectId: v.id("projects"),
    quoteId: v.id("projectQuotes"),
    clientId: v.id("users"),
    companyId: v.id("companies"),
    status: v.union(v.literal("active"), v.literal("closed")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastMessageAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    clientLastReadAt: v.optional(v.number()),
    companyLastReadAt: v.optional(v.number()),
    clientLastSentAt: v.optional(v.number()),
    companyLastSentAt: v.optional(v.number()),
  })
    .index("by_projectId_and_companyId", ["projectId", "companyId"])
    .index("by_clientId_and_updatedAt", ["clientId", "updatedAt"])
    .index("by_companyId_and_updatedAt", ["companyId", "updatedAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderUserId: v.id("users"),
    senderType: v.union(v.literal("client"), v.literal("company")),
    body: v.string(),
    clientMessageId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"])
    .index("by_conversationId_and_senderUserId_and_clientMessageId", [
      "conversationId",
      "senderUserId",
      "clientMessageId",
    ]),

  messageAttachments: defineTable({
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    storageId: v.id("_storage"),
    uploadedByUserId: v.id("users"),
    kind: v.literal("pdf"),
    originalFileName: v.string(),
    mimeType: v.literal("application/pdf"),
    sizeBytes: v.number(),
    createdAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"]),

  messageAttachmentUploadIntents: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    token: v.string(),
    originalFileName: v.string(),
    expectedContentType: v.literal("application/pdf"),
    expectedSize: v.number(),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_token", ["token"]),

  companies: defineTable({
    name: v.optional(v.string()),
    legalName: v.optional(v.string()),
    slug: v.optional(v.string()),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    description: v.optional(v.string()),
    yearsExperience: v.optional(v.number()),
    foundedYear: v.optional(v.number()),
    companySize: v.optional(companySize),
    languages: v.optional(v.array(companyLanguage)),
    serviceAreas: v.optional(v.array(companyServiceArea)),
    website: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    logoMediaId: v.optional(v.id("publicMedia")),
    coverMediaId: v.optional(v.id("publicMedia")),
    /** Denormalized public-only text used by the company directory search index. */
    directorySearchText: v.optional(v.string()),
    onboardingStatus,
    verificationStatus: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_onboardingStatus", ["onboardingStatus"])
    .index("by_onboardingStatus_and_verificationStatus", [
      "onboardingStatus",
      "verificationStatus",
    ])
    .index("by_verificationStatus", ["verificationStatus"])
    .searchIndex("search_directory", {
      searchField: "directorySearchText",
      filterFields: ["onboardingStatus", "verificationStatus"],
    }),

  companyMembers: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("staff")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_companyId", ["companyId"])
    .index("by_companyId_and_status", ["companyId", "status"])
    .index("by_companyId_and_userId", ["companyId", "userId"]),

  companyServices: defineTable({
    companyId: v.id("companies"),
    service: v.union(
      v.literal("houseConstruction"),
      v.literal("renovation"),
      v.literal("structural"),
      v.literal("finishing"),
      v.literal("architecture"),
      v.literal("interior"),
      v.literal("electrical"),
      v.literal("plumbing"),
      v.literal("joinery"),
      v.literal("pool"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_and_service", ["companyId", "service"]),

  companyVerifications: defineTable({
    companyId: v.id("companies"),
    legalName: v.string(),
    ice: v.string(),
    rcNumber: v.string(),
    legalRepresentative: v.string(),
    phone: v.string(),
    address: v.string(),
    submittedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_companyId", ["companyId"]),

  companyVerificationDocuments: defineTable({
    verificationId: v.id("companyVerifications"),
    companyId: v.id("companies"),
    documentType: v.union(
      v.literal("rc"),
      v.literal("ice"),
      v.literal("insurance"),
      v.literal("other"),
    ),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_and_documentType", ["companyId", "documentType"]),

  companyVerificationUploadIntents: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    documentType: v.union(
      v.literal("rc"),
      v.literal("ice"),
      v.literal("insurance"),
      v.literal("other"),
    ),
    token: v.string(),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_token", ["token"]),

  companyVerificationHistory: defineTable({
    companyId: v.id("companies"),
    oldStatus: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
    newStatus: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
    changedBy: v.id("users"),
    changedAt: v.number(),
    rejectionReason: v.optional(v.string()),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_and_changedAt", ["companyId", "changedAt"]),

  portfolioProjects: defineTable({
    companyId: v.id("companies"),
    title: v.string(),
    description: v.string(),
    city: v.string(),
    projectType: v.union(
      v.literal("construction"),
      v.literal("renovation"),
      v.literal("structural"),
      v.literal("finishing"),
      v.literal("interior"),
      v.literal("exterior"),
      v.literal("other"),
    ),
    surface: v.optional(v.number()),
    durationMonths: v.optional(v.number()),
    year: v.optional(v.number()),
    /** @deprecated Kept while legacy Convex Storage images are migrated. */
    coverImageStorageId: v.optional(v.id("_storage")),
    coverMediaId: v.optional(v.id("publicMedia")),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("hidden")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_and_status", ["companyId", "status"]),

  portfolioMedia: defineTable({
    portfolioProjectId: v.id("portfolioProjects"),
    /** @deprecated Kept while legacy Convex Storage images are migrated. */
    storageId: v.optional(v.id("_storage")),
    publicMediaId: v.optional(v.id("publicMedia")),
    sortOrder: v.number(),
    caption: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_portfolioProjectId", ["portfolioProjectId"]),

  portfolioUploadIntents: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    kind: v.union(v.literal("cover"), v.literal("media")),
    expectedContentType: v.string(),
    expectedSize: v.number(),
    token: v.string(),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_token", ["token"]),

  publicMedia: defineTable({
    storageProvider: v.literal("r2"),
    companyId: v.id("companies"),
    portfolioProjectId: v.optional(v.id("portfolioProjects")),
    purpose: v.union(
      v.literal("companyLogo"),
      v.literal("companyCover"),
      v.literal("portfolioCover"),
      v.literal("portfolioMedia"),
    ),
    objectKey: v.string(),
    mimeType: v.string(),
    size: v.number(),
    etag: v.optional(v.string()),
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_portfolioProjectId", ["portfolioProjectId"])
    .index("by_objectKey", ["objectKey"]),

  publicMediaUploadIntents: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    portfolioProjectId: v.optional(v.id("portfolioProjects")),
    purpose: v.union(
      v.literal("companyLogo"),
      v.literal("companyCover"),
      v.literal("portfolioCover"),
      v.literal("portfolioMedia"),
    ),
    expectedContentType: v.string(),
    expectedSize: v.number(),
    objectKey: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    verifiedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
    etag: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_objectKey", ["objectKey"]),

  seoMedia: defineTable({
    objectKey: v.string(), filename: v.string(), mimeType: v.string(),
    width: v.optional(v.number()), height: v.optional(v.number()), size: v.number(),
    etag: v.optional(v.string()),
    uploadedBy: v.id("users"), status: v.union(v.literal("active"), v.literal("archived")),
    replacesMediaId: v.optional(v.id("seoMedia")), replacedByMediaId: v.optional(v.id("seoMedia")),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(), updatedAt: v.number(),
  })
    .index("by_objectKey", ["objectKey"])
    .index("by_status_and_createdAt", ["status", "createdAt"]),

  seoMediaUploadIntents: defineTable({
    userId: v.id("users"), objectKey: v.string(), fileName: v.string(),
    expectedContentType: v.string(), expectedSize: v.number(), token: v.string(),
    replacesMediaId: v.optional(v.id("seoMedia")), expiresAt: v.number(),
    verifiedAt: v.optional(v.number()), claimedAt: v.optional(v.number()),
    etag: v.optional(v.string()), createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_objectKey", ["objectKey"]),

  seoMediaMetadata: defineTable({
    mediaId: v.id("seoMedia"), locale: seoLocale, altText: v.string(),
    title: v.optional(v.string()), caption: v.optional(v.string()),
    description: v.optional(v.string()), seoFilename: v.optional(v.string()),
    createdBy: v.id("users"), updatedBy: v.id("users"),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_mediaId_and_locale", ["mediaId", "locale"]),

  seoPillars: defineTable({
    title: v.string(), slug: v.string(), description: v.string(), primaryKeyword: v.string(),
    searchIntent: seoSearchIntent, locale: seoLocale, status: seoPillarStatus,
    targetUrl: v.optional(v.string()), createdBy: v.id("users"), updatedBy: v.id("users"),
    createdAt: v.number(), updatedAt: v.number(), archivedAt: v.optional(v.number()),
  })
    .index("by_locale_and_slug", ["locale", "slug"])
    .index("by_locale_and_status", ["locale", "status"]),

  seoClusters: defineTable({
    pillarId: v.id("seoPillars"), topic: v.string(), primaryKeyword: v.string(),
    secondaryKeywords: v.array(v.string()), searchIntent: seoSearchIntent, locale: seoLocale,
    targetArticleId: v.optional(v.id("seoArticles")), targetPageKey: v.optional(v.string()),
    status: seoClusterStatus, priority: v.number(), createdBy: v.id("users"),
    updatedBy: v.id("users"), createdAt: v.number(), updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_pillarId", ["pillarId"])
    .index("by_locale_and_status_and_priority", ["locale", "status", "priority"]),

  seoBriefs: defineTable({
    locale: seoLocale, targetKeyword: v.string(), supportingKeywords: v.array(v.string()),
    searchIntent: seoSearchIntent, targetAudience: v.string(), suggestedTitle: v.string(),
    suggestedH1: v.string(), outline: v.array(v.object({
      level: v.union(v.literal(2), v.literal(3)), heading: v.string(),
    })), questions: v.array(v.string()),
    internalLinkNotes: v.array(v.string()), externalReferences: v.array(v.string()),
    wordCountTarget: v.number(), cta: v.string(), notes: v.optional(v.string()),
    pillarId: v.optional(v.id("seoPillars")), clusterId: v.optional(v.id("seoClusters")),
    articleId: v.optional(v.id("seoArticles")), status: seoBriefStatus,
    createdBy: v.id("users"), updatedBy: v.id("users"), createdAt: v.number(), updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_clusterId", ["clusterId"])
    .index("by_articleId", ["articleId"])
    .index("by_locale_and_status", ["locale", "status"]),

  seoArticles: defineTable({
    title: v.string(), slug: v.string(), excerpt: v.string(), content: v.string(),
    featuredMediaId: v.optional(v.id("seoMedia")), authorId: v.id("users"), locale: seoLocale,
    category: v.string(), primaryKeyword: v.string(), secondaryKeywords: v.array(v.string()),
    searchIntent: seoSearchIntent, seoTitle: v.string(), metaDescription: v.string(),
    canonicalUrl: v.optional(v.string()), robots: seoRobotsDirective,
    ogTitle: v.optional(v.string()), ogDescription: v.optional(v.string()),
    ogMediaId: v.optional(v.id("seoMedia")), pillarId: v.optional(v.id("seoPillars")),
    clusterId: v.optional(v.id("seoClusters")), briefId: v.optional(v.id("seoBriefs")),
    translationGroup: v.optional(v.string()), status: seoArticleStatus,
    createdBy: v.id("users"), updatedBy: v.id("users"), createdAt: v.number(),
    updatedAt: v.number(), publishedAt: v.optional(v.number()), archivedAt: v.optional(v.number()),
  })
    .index("by_locale_and_slug", ["locale", "slug"])
    .index("by_locale_and_status", ["locale", "status"])
    .index("by_pillarId", ["pillarId"])
    .index("by_clusterId", ["clusterId"])
    .index("by_featuredMediaId", ["featuredMediaId"])
    .index("by_ogMediaId", ["ogMediaId"])
    .index("by_translationGroup_and_locale", ["translationGroup", "locale"])
    .index("by_canonicalUrl", ["canonicalUrl"]),

  seoArticleMedia: defineTable({
    articleId: v.id("seoArticles"), mediaId: v.id("seoMedia"), createdAt: v.number(),
  })
    .index("by_articleId", ["articleId"])
    .index("by_mediaId", ["mediaId"])
    .index("by_articleId_and_mediaId", ["articleId", "mediaId"]),

  seoPageMetadata: defineTable({
    pageKey: v.string(), locale: seoLocale, seoTitle: v.string(), metaDescription: v.string(),
    canonicalUrl: v.optional(v.string()), robots: seoRobotsDirective,
    ogTitle: v.optional(v.string()), ogDescription: v.optional(v.string()),
    ogMediaId: v.optional(v.id("seoMedia")), createdBy: v.id("users"), updatedBy: v.id("users"),
    createdAt: v.number(), updatedAt: v.number(),
  })
    .index("by_pageKey_and_locale", ["pageKey", "locale"])
    .index("by_canonicalUrl", ["canonicalUrl"])
    .index("by_ogMediaId", ["ogMediaId"]),

  seoArticleLinks: defineTable({
    sourceArticleId: v.id("seoArticles"),
    targetArticleId: v.optional(v.id("seoArticles")), targetPageKey: v.optional(v.string()),
    anchorText: v.string(), createdBy: v.id("users"), createdAt: v.number(),
  })
    .index("by_sourceArticleId", ["sourceArticleId"])
    .index("by_sourceArticleId_and_targetArticleId", ["sourceArticleId", "targetArticleId"]),

  seoAuditEvents: defineTable({
    actorId: v.id("users"), entityType: v.union(
      v.literal("article"), v.literal("media"), v.literal("media_metadata"),
      v.literal("page_metadata"), v.literal("pillar"), v.literal("cluster"),
      v.literal("brief"), v.literal("article_link"),
    ),
    entityId: v.string(), action: v.string(), changedFields: v.array(v.string()),
    beforeStatus: v.optional(v.string()), afterStatus: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index("by_entityType_and_entityId_and_occurredAt", ["entityType", "entityId", "occurredAt"])
    .index("by_actorId_and_occurredAt", ["actorId", "occurredAt"]),
});
