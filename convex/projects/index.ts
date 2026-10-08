import { assertNotVerificationStorage } from "../storage/verificationPrivacy";
import { paginationOptsValidator, paginationResultValidator, type OrderedQuery } from "convex/server";
import { ConvexError, v } from "convex/values";
import { getProvince, isValidRegion, isProvinceInRegion } from "../../lib/geography/morocco";
import type { DataModel, Doc } from "../_generated/dataModel";
import { env, mutation, query } from "../_generated/server";
import { requireOwnedAttachment } from "./download";
import {
  claimAttachmentUpload,
  createAttachmentUploadIntent,
} from "./attachments";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { getPublicMediaUrl } from "../storage/publicUrl";
import {
  getProjectViewer,
  requireClientUser,
  requireOwnedEditableProject,
  requireOwnedProject,
} from "./access";
import {
  PROJECT_MAX_DOCUMENTS,
  PROJECT_MAX_IMAGES,
  projectCategories,
  projectCategoryValidator,
  projectCities,
  projectCityValidator,
  projectMarketplaceSortValidator,
  projectPropertyTypes,
  projectPropertyTypeValidator,
  projectStatusValidator,
  projectTimelines,
  projectTimelineValidator,
} from "./constants";
import { assertProjectTransition, isProjectEditable } from "./state";
import {
  detailedProjectLocationValidator,
  generalProjectLocationValidator,
  toDetailedProjectLocation,
  toGeneralProjectLocation,
} from "./location";
import { isWizardLocationComplete } from "../../lib/geography/wizard-location";
import { usesStructuredProjectLocation } from "../../lib/geography/project-location";
import { normalizeProjectSearch } from "./marketplaceSearch";
import {
  assertProjectLocationReady,
  normalizeStructuredProjectLocation,
} from "./locationValidation";

const draftValidator = v.object({
  location: detailedProjectLocationValidator,
  locationMode: v.union(v.literal("structured"), v.null()),
  id: v.id("projects"),
  primaryCategory: v.union(projectCategoryValidator, v.null()),
  customCategoryText: v.union(v.string(), v.null()),
  city: v.union(projectCityValidator, v.null()),
  neighborhood: v.union(v.string(), v.null()),
  title: v.union(v.string(), v.null()),
  propertyType: v.union(projectPropertyTypeValidator, v.null()),
  surface: v.union(v.number(), v.null()),
  surfaceUnknown: v.boolean(),
  description: v.union(v.string(), v.null()),
  timeline: v.union(projectTimelineValidator, v.null()),
  resumeStep: v.union(
    v.literal(1),
    v.literal(2),
    v.literal(3),
    v.literal(4),
    v.literal(5),
  ),
  images: v.array(
    v.object({
      id: v.id("projectMedia"),
      url: v.union(v.string(), v.null()),
      mimeType: v.string(),
      size: v.number(),
    }),
  ),
  attachments: v.array(
    v.object({
      id: v.id("projectAttachments"),
      fileName: v.string(),
      size: v.number(),
    }),
  ),
  updatedAt: v.number(),
});
const wizardValidator = v.object({
  draft: v.union(draftValidator, v.null()),
  categoryOptions: v.array(projectCategoryValidator),
  cityOptions: v.array(projectCityValidator),
  propertyTypeOptions: v.array(projectPropertyTypeValidator),
  timelineOptions: v.array(projectTimelineValidator),
  limits: v.object({ maxImages: v.number(), maxDocuments: v.number() }),
});
const nullableString = v.union(v.string(), v.null());
const projectListItemValidator = v.object({
  location: detailedProjectLocationValidator,
  id: v.id("projects"),
  title: nullableString,
  primaryCategory: v.union(projectCategoryValidator, v.null()),
  city: v.union(projectCityValidator, v.null()),
  timeline: v.union(projectTimelineValidator, v.null()),
  status: projectStatusValidator,
  createdAt: v.number(),
  submittedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
  thumbnailUrl: nullableString,
  canResume: v.boolean(),
  canView: v.boolean(),
});
const historyItemValidator = v.object({
  oldStatus: projectStatusValidator,
  newStatus: projectStatusValidator,
  changedAt: v.number(),
  actor: v.union(v.literal("client"), v.literal("staff")),
  reason: nullableString,
});
const projectDetailsValidator = v.object({
  ...projectListItemValidator.fields,
  customCategoryText: nullableString,
  neighborhood: nullableString,
  description: nullableString,
  propertyType: v.union(projectPropertyTypeValidator, v.null()),
  surface: v.union(v.number(), v.null()),
  surfaceUnknown: v.boolean(),
  images: v.array(v.object({ id: v.id("projectMedia"), url: nullableString })),
  attachments: v.array(
    v.object({
      id: v.id("projectAttachments"),
      fileName: v.string(),
      size: v.number(),
    }),
  ),
  history: v.array(historyItemValidator),
  viewerRole: v.union(v.literal("owner"), v.literal("admin")),
});
const publicProjectValidator = v.object({
  id: v.id("projects"),
  title: v.string(),
  description: v.string(),
  city: v.union(projectCityValidator, v.null()),
  location: generalProjectLocationValidator,
  primaryCategory: projectCategoryValidator,
  timeline: v.union(projectTimelineValidator, v.null()),
  publishedAt: v.union(v.number(), v.null()),
  thumbnailUrl: nullableString,
});

function text(value: string, min: number, max: number, code: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < min || normalized.length > max)
    throw new ConvexError(code);
  return normalized;
}
function optionalText(value: string | undefined, max: number, code: string) {
  return value?.trim() ? text(value, 1, max, code) : undefined;
}
function completed(current: number, step: number) {
  return Math.max(Math.min(current, 6), step);
}
async function draftFor(
  ctx: Parameters<typeof requireClientUser>[0],
  clientId: Parameters<typeof requireOwnedProject>[1],
) {
  return await ctx.db
    .query("projects")
    .withIndex("by_clientId_and_status", (q) =>
      q.eq("clientId", clientId).eq("status", "draft"),
    )
    .order("desc")
    .first();
}
const options = () => ({
  categoryOptions: [...projectCategories],
  cityOptions: [...projectCities],
  propertyTypeOptions: [...projectPropertyTypes],
  timelineOptions: [...projectTimelines],
  limits: {
    maxImages: PROJECT_MAX_IMAGES,
    maxDocuments: PROJECT_MAX_DOCUMENTS,
  },
});

/** Derive five-step resume state from required fields; never reinterpret legacy numeric progress. */
export function projectWizardResumeStep(
  project: Pick<
    Doc<"projects">,
    | "primaryCategory"
    | "customCategoryText"
    | "city"
    | "locationMode"
    | "regionCode"
    | "provinceCode"
    | "communeName"
    | "localityName"
    | "title"
    | "propertyType"
    | "surface"
    | "surfaceUnknown"
    | "description"
    | "timeline"
  >,
) {
  if (
    !project.primaryCategory ||
    (project.primaryCategory === "other" && !project.customCategoryText)
  )
    return 1 as const;
  if (!isWizardLocationComplete(project)) return 2 as const;
  if (
    !project.title ||
    !project.propertyType ||
    !project.description ||
    (!project.surfaceUnknown && project.surface === undefined)
  )
    return 3 as const;
  if (!project.timeline) return 4 as const;
  return 5 as const;
}

async function thumbnailFor(
  ctx: Parameters<typeof requireClientUser>[0],
  projectId: Parameters<typeof requireOwnedProject>[2],
) {
  const media = await ctx.db
    .query("projectMedia")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .first();
  return media ? getPublicMediaUrl(media.objectKey) : null;
}

export const getMyProjects = query({
  args: {},
  returns: v.array(projectListItemValidator),
  handler: async (ctx) => {
    const { userId } = await requireClientUser(ctx);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_clientId", (q) => q.eq("clientId", userId))
      .order("desc")
      .take(100);
    return await Promise.all(
      projects.map(async (project) => ({
        id: project._id,
        title: project.title ?? null,
        primaryCategory: project.primaryCategory ?? null,
        city: project.city ?? null,
        location: toDetailedProjectLocation(project),
        timeline: project.timeline ?? null,
        status: project.status,
        createdAt: project.createdAt,
        submittedAt: project.submittedAt ?? null,
        updatedAt: project.updatedAt,
        thumbnailUrl: await thumbnailFor(ctx, project._id),
        canResume:
          project.status === "draft" || project.status === "needs_changes",
        canView: true,
      })),
    );
  },
});

export const getMyProject = query({
  args: { projectId: v.string() },
  returns: v.union(v.null(), projectDetailsValidator),
  handler: async (ctx, args) => {
    const access = await getProjectViewer(ctx, args.projectId);
    if (!access) return null;
    const { project, viewerRole } = access;
    const [images, attachments, history] = await Promise.all([
      ctx.db
        .query("projectMedia")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .take(PROJECT_MAX_IMAGES),
      ctx.db
        .query("projectAttachments")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .take(PROJECT_MAX_DOCUMENTS),
      ctx.db
        .query("projectStatusHistory")
        .withIndex("by_projectId_and_changedAt", (q) =>
          q.eq("projectId", project._id),
        )
        .order("asc")
        .take(50),
    ]);
    const thumbnailUrl = images[0]
      ? getPublicMediaUrl(images[0].objectKey)
      : null;
    return {
      id: project._id,
      title: project.title ?? null,
      primaryCategory: project.primaryCategory ?? null,
      customCategoryText: project.customCategoryText ?? null,
      city: project.city ?? null,
      neighborhood: project.neighborhood ?? null,
      location: toDetailedProjectLocation(project),
      description: project.description ?? null,
      propertyType: project.propertyType ?? null,
      surface: project.surface ?? null,
      surfaceUnknown: project.surfaceUnknown,
      timeline: project.timeline ?? null,
      status: project.status,
      createdAt: project.createdAt,
      submittedAt: project.submittedAt ?? null,
      updatedAt: project.updatedAt,
      thumbnailUrl,
      canResume:
        project.status === "draft" || project.status === "needs_changes",
      canView: true,
      images: images.map((item) => ({
        id: item._id,
        url: getPublicMediaUrl(item.objectKey),
      })),
      attachments: attachments.map((item) => ({
        id: item._id,
        fileName: item.fileName,
        size: item.size,
      })),
      history: history.map((item) => ({
        oldStatus: item.oldStatus,
        newStatus: item.newStatus,
        changedAt: item.changedAt,
        actor:
          item.changedBy === project.clientId
            ? ("client" as const)
            : ("staff" as const),
        reason: item.reason ?? null,
      })),
      viewerRole,
    };
  },
});

export const listPublicProjects = query({
  args: {},
  returns: v.array(publicProjectValidator),
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_status_and_visibility", (q) =>
        q.eq("status", "published").eq("visibility", "marketplace"),
      )
      .order("desc")
      .take(24);
    return await Promise.all(
      projects
        .flatMap((project) =>
          project.title && project.description && project.primaryCategory
            ? [project]
            : [],
        )
        .map(async (project) => ({
          id: project._id,
          title: project.title!,
          description: project.description!,
          city: project.city ?? null,
          location: toGeneralProjectLocation(project),
          primaryCategory: project.primaryCategory!,
          timeline: project.timeline ?? null,
          publishedAt: project.publishedAt ?? null,
          thumbnailUrl: await thumbnailFor(ctx, project._id),
        })),
    );
  },
});

/** Anonymous discovery through native cursors and explicit public DTOs. */
export const listPublicProjectsPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    regionCode: v.optional(v.string()),
    provinceCode: v.optional(v.string()),
    category: v.optional(projectCategoryValidator),
    search: v.optional(v.string()),
    /** Nonblank text search takes native relevance precedence over chronological sort. */
    sortBy: v.optional(projectMarketplaceSortValidator),
  },
  returns: paginationResultValidator(publicProjectValidator),
  handler: async (ctx, args) => {
    if (args.regionCode !== undefined && !isValidRegion(args.regionCode)) {
      throw new ConvexError("INVALID_PROJECT_REGION");
    }
    if (args.provinceCode !== undefined) {
      if (!getProvince(args.provinceCode)) throw new ConvexError("INVALID_PROJECT_PROVINCE");
      if (args.regionCode === undefined) throw new ConvexError("PROJECT_REGION_REQUIRED");
      if (!isProvinceInRegion(args.provinceCode, args.regionCode)) {
        throw new ConvexError("PROJECT_PROVINCE_REGION_MISMATCH");
      }
    }

    const search = normalizeProjectSearch(args.search);
    const order = args.sortBy === "oldest" ? "asc" : "desc";
    const base = ctx.db.query("projects");
    let candidates: OrderedQuery<DataModel["projects"]>;
    if (search) {
      // The geographic search index remains staged. Area residuals still cost candidate reads.
      candidates = base.withSearchIndex("search_marketplace", (q) => {
        const scoped = q.search("marketplaceSearchText", search)
          .eq("status", "published").eq("visibility", "marketplace");
        return args.category === undefined ? scoped : scoped.eq("primaryCategory", args.category);
      });
    } else if (args.provinceCode !== undefined) {
      candidates = base.withIndex("by_status_visibility_province_publishedAt", (q) =>
        q.eq("status", "published").eq("visibility", "marketplace").eq("provinceCode", args.provinceCode),
      ).order(order);
    } else if (args.regionCode !== undefined) {
      candidates = base.withIndex("by_status_visibility_region_publishedAt", (q) =>
        q.eq("status", "published").eq("visibility", "marketplace").eq("regionCode", args.regionCode),
      ).order(order);
    } else if (args.category !== undefined) {
      candidates = base.withIndex("by_status_visibility_category_publishedAt", (q) =>
        q.eq("status", "published").eq("visibility", "marketplace").eq("primaryCategory", args.category),
      ).order(order);
    } else {
      candidates = base.withIndex("by_status_visibility_publishedAt", (q) =>
        q.eq("status", "published").eq("visibility", "marketplace"),
      ).order(order);
    }

    // Match the existing public completeness policy, including nullable legacy timelines.
    // Predicates precede pagination, so incomplete or sparse candidates cannot hide later matches.
    const page = await candidates.filter((q) => q.and(
      q.neq(q.field("title"), undefined), q.neq(q.field("title"), ""),
      q.neq(q.field("description"), undefined), q.neq(q.field("description"), ""),
      q.neq(q.field("primaryCategory"), undefined),
      args.regionCode === undefined ? true : q.eq(q.field("regionCode"), args.regionCode),
      args.provinceCode === undefined ? true : q.eq(q.field("provinceCode"), args.provinceCode),
      args.category === undefined ? true : q.eq(q.field("primaryCategory"), args.category),
    )).paginate(args.paginationOpts);

    return { ...page, page: await Promise.all(page.page.map(async (project) => ({
      id: project._id,
      title: project.title!,
      description: project.description!,
      city: usesStructuredProjectLocation(project) ? null : project.city ?? null,
      location: toGeneralProjectLocation(project),
      primaryCategory: project.primaryCategory!,
      timeline: project.timeline ?? null,
      publishedAt: project.publishedAt ?? null,
      thumbnailUrl: await thumbnailFor(ctx, project._id),
    }))) };
  },
});

export const getWizard = query({
  args: { projectId: v.optional(v.id("projects")) },
  returns: wizardValidator,
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const requestedProject = args.projectId
      ? await requireOwnedProject(ctx, userId, args.projectId)
      : null;
    const draft = requestedProject
      ? isProjectEditable(requestedProject.status)
        ? requestedProject
        : null
      : await draftFor(ctx, userId);
    if (!draft) return { draft: null, ...options() };
    const [images, attachments] = await Promise.all([
      ctx.db
        .query("projectMedia")
        .withIndex("by_projectId", (q) => q.eq("projectId", draft._id))
        .take(PROJECT_MAX_IMAGES),
      ctx.db
        .query("projectAttachments")
        .withIndex("by_projectId", (q) => q.eq("projectId", draft._id))
        .take(PROJECT_MAX_DOCUMENTS),
    ]);
    return {
      draft: {
        id: draft._id,
        location: toDetailedProjectLocation(draft),
        locationMode: draft.locationMode ?? null,
        primaryCategory: draft.primaryCategory ?? null,
        customCategoryText: draft.customCategoryText ?? null,
        city: draft.city ?? null,
        neighborhood: draft.neighborhood ?? null,
        title: draft.title ?? null,
        propertyType: draft.propertyType ?? null,
        surface: draft.surface ?? null,
        surfaceUnknown: draft.surfaceUnknown,
        description: draft.description ?? null,
        timeline: draft.timeline ?? null,
        resumeStep: projectWizardResumeStep(draft),
        images: images.map((item) => ({
          id: item._id,
          url: getPublicMediaUrl(item.objectKey),
          mimeType: item.mimeType,
          size: item.size,
        })),
        attachments: attachments.map((item) => ({
          id: item._id,
          fileName: item.fileName,
          size: item.size,
        })),
        updatedAt: draft.updatedAt,
      },
      ...options(),
    };
  },
});

export const initializeDraft = mutation({
  args: {},
  returns: v.object({ projectId: v.id("projects"), resumed: v.boolean() }),
  handler: async (ctx) => {
    const { userId } = await requireClientUser(ctx);
    const existing = await draftFor(ctx, userId);
    if (existing) return { projectId: existing._id, resumed: true };
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      clientId: userId,
      countryCode: "MA",
      surfaceUnknown: false,
      visibility: "marketplace",
      status: "draft",
      lastCompletedStep: 0,
      createdAt: now,
      updatedAt: now,
    });
    await appendMarketplaceActivity(ctx, {
      projectId,
      eventType: "project_created",
      actorUserId: userId,
      actorType: "client",
      newStatus: "draft",
      createdAt: now,
    });
    return { projectId, resumed: false };
  },
});

export const saveCategory = mutation({
  args: {
    projectId: v.id("projects"),
    primaryCategory: projectCategoryValidator,
    customCategoryText: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const p = await requireOwnedEditableProject(ctx, userId, args.projectId);
    const customCategoryText =
      args.primaryCategory === "other"
        ? text(
            args.customCategoryText ?? "",
            3,
            120,
            "INVALID_PROJECT_CATEGORY",
          )
        : undefined;
    await ctx.db.patch(p._id, {
      primaryCategory: args.primaryCategory,
      customCategoryText,
      lastCompletedStep: completed(p.lastCompletedStep, 1),
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const saveLocation = mutation({
  args: {
    projectId: v.id("projects"),
    city: projectCityValidator,
    neighborhood: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const p = await requireOwnedEditableProject(ctx, userId, args.projectId);
    if (usesStructuredProjectLocation(p))
      throw new ConvexError("PROJECT_STRUCTURED_LOCATION_REQUIRED");
    await ctx.db.patch(p._id, {
      city: args.city,
      neighborhood: optionalText(
        args.neighborhood,
        100,
        "INVALID_PROJECT_NEIGHBORHOOD",
      ),
      countryCode: "MA",
      lastCompletedStep: completed(p.lastCompletedStep, 2),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Persist structured intent and geography atomically; retain historical city/neighborhood and progress. */
export const saveStructuredLocation = mutation({
  args: {
    projectId: v.id("projects"),
    regionCode: nullableString,
    provinceCode: nullableString,
    communeName: nullableString,
    localityName: nullableString,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const project = await requireOwnedEditableProject(
      ctx,
      userId,
      args.projectId,
    );
    const location = normalizeStructuredProjectLocation(args);
    await ctx.db.patch(project._id, {
      ...location,
      locationMode: "structured",
      countryCode: "MA",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const saveDetails = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    propertyType: projectPropertyTypeValidator,
    surface: v.optional(v.number()),
    surfaceUnknown: v.boolean(),
    description: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const p = await requireOwnedEditableProject(ctx, userId, args.projectId);
    if (
      (!args.surfaceUnknown &&
        (args.surface === undefined ||
          !Number.isFinite(args.surface) ||
          args.surface <= 0 ||
          args.surface > 100_000)) ||
      (args.surfaceUnknown && args.surface !== undefined)
    )
      throw new ConvexError("INVALID_PROJECT_SURFACE");
    await ctx.db.patch(p._id, {
      title: text(args.title, 5, 120, "INVALID_PROJECT_TITLE"),
      propertyType: args.propertyType,
      surface: args.surfaceUnknown ? undefined : args.surface,
      surfaceUnknown: args.surfaceUnknown,
      description: text(
        args.description,
        20,
        2_000,
        "INVALID_PROJECT_DESCRIPTION",
      ),
      lastCompletedStep: completed(p.lastCompletedStep, 3),
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const saveTimeline = mutation({
  args: { projectId: v.id("projects"), timeline: projectTimelineValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const p = await requireOwnedEditableProject(ctx, userId, args.projectId);
    await ctx.db.patch(p._id, {
      timeline: args.timeline,
      lastCompletedStep: completed(p.lastCompletedStep, 5),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {
    projectId: v.id("projects"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: createAttachmentUploadIntent,
});

export const saveFiles = mutation({
  args: {
    projectId: v.id("projects"),
    imageUploadTokens: v.array(v.string()),
    documents: v.array(v.object({ uploadToken: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const p = await requireOwnedEditableProject(ctx, userId, args.projectId);
    if (
      args.imageUploadTokens.length > PROJECT_MAX_IMAGES ||
      new Set(args.imageUploadTokens).size !== args.imageUploadTokens.length
    )
      throw new ConvexError("INVALID_PROJECT_IMAGE");
    if (
      args.documents.length > PROJECT_MAX_DOCUMENTS ||
      new Set(args.documents.map((d) => d.uploadToken)).size !==
        args.documents.length
    )
      throw new ConvexError("INVALID_PROJECT_DOCUMENT");
    const [existingImages, existingDocs] = await Promise.all([
      ctx.db
        .query("projectMedia")
        .withIndex("by_projectId", (q) => q.eq("projectId", p._id))
        .take(PROJECT_MAX_IMAGES + 1),
      ctx.db
        .query("projectAttachments")
        .withIndex("by_projectId", (q) => q.eq("projectId", p._id))
        .take(PROJECT_MAX_DOCUMENTS + 1),
    ]);
    if (
      existingImages.length + args.imageUploadTokens.length >
      PROJECT_MAX_IMAGES
    )
      throw new ConvexError("INVALID_PROJECT_IMAGE");
    if (existingDocs.length + args.documents.length > PROJECT_MAX_DOCUMENTS)
      throw new ConvexError("INVALID_PROJECT_DOCUMENT");
    const now = Date.now();
    const imageIntents = [];
    for (const token of args.imageUploadTokens) {
      const intent = await ctx.db
        .query("projectMediaUploadIntents")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();
      if (
        !intent ||
        intent.projectId !== p._id ||
        intent.userId !== userId ||
        !intent.verifiedAt ||
        intent.claimedAt ||
        intent.expiresAt < now
      )
        throw new ConvexError("INVALID_PROJECT_IMAGE");
      imageIntents.push(intent);
    }
    const docs = [];
    for (const document of args.documents)
      docs.push(await claimAttachmentUpload(ctx, p._id, document.uploadToken));
    for (const [offset, intent] of imageIntents.entries()) {
      await ctx.db.insert("projectMedia", {
        projectId: p._id,
        clientId: userId,
        storageProvider: "r2",
        objectKey: intent.objectKey,
        mimeType: intent.expectedContentType,
        size: intent.expectedSize,
        etag: intent.etag,
        sortOrder: existingImages.length + offset,
        createdAt: now,
      });
      await ctx.db.patch(intent._id, { claimedAt: now });
    }
    for (const file of docs) {
      await ctx.db.insert("projectAttachments", {
        projectId: p._id,
        clientId: userId,
        storageId: file.storageId,
        fileName: file.fileName,
        contentType: "application/pdf",
        size: file.size,
        createdAt: now,
      });
      await ctx.db.patch(file.intent._id, { claimedAt: now });
    }
    await ctx.db.patch(p._id, {
      lastCompletedStep: completed(p.lastCompletedStep, 6),
      updatedAt: now,
    });
    return null;
  },
});

export const publishProject = mutation({
  args: { projectId: v.id("projects") },
  returns: v.object({
    status: v.literal("pending_review"),
    alreadySubmitted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const p = await requireOwnedProject(ctx, userId, args.projectId);
    if (p.status === "pending_review")
      return { status: "pending_review" as const, alreadySubmitted: true };
    assertProjectTransition(p.status, "pending_review");
    if (
      !p.primaryCategory ||
      !p.title ||
      !p.description ||
      !p.timeline ||
      (p.primaryCategory === "other" && !p.customCategoryText)
    )
      throw new ConvexError("PROJECT_INCOMPLETE");
    assertProjectLocationReady(p);
    const now = Date.now();
    await ctx.db.patch(p._id, {
      status: "pending_review",
      submittedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("projectStatusHistory", {
      projectId: p._id,
      oldStatus: p.status,
      newStatus: "pending_review",
      changedBy: userId,
      changedAt: now,
    });
    await appendMarketplaceActivity(ctx, {
      projectId: p._id,
      eventType: "project_submitted",
      actorUserId: userId,
      actorType: "client",
      oldStatus: p.status,
      newStatus: "pending_review",
      createdAt: now,
    });
    return { status: "pending_review" as const, alreadySubmitted: false };
  },
});

export const getAttachmentDownloadUrl = query({
  args: { attachmentId: v.id("projectAttachments") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const attachment = await requireOwnedAttachment(ctx, args.attachmentId);
    try {
      await assertNotVerificationStorage(ctx, attachment.storageId);
    } catch {
      return null;
    }
    return `${env.CONVEX_SITE_URL.replace(/\/$/, "")}/projects/attachments/${attachment._id}`;
  },
});
export const getPublicProject = query({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      description: v.string(),
      city: v.union(projectCityValidator, v.null()),
      primaryCategory: projectCategoryValidator,
      location: generalProjectLocationValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (
      !project ||
      project.status !== "published" ||
      project.visibility !== "marketplace" ||
      !project.title ||
      !project.description ||
      !project.primaryCategory
    )
      return null;
    return {
      title: project.title,
      description: project.description,
      city: project.city ?? null,
      primaryCategory: project.primaryCategory,
      location: toGeneralProjectLocation(project),
    };
  },
});
