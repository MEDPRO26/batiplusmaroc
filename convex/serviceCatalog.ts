import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAdminUser } from "./admin/access";
import { defaultServiceCatalog } from "../lib/service-catalog-defaults";

const catalogItem = v.object({
  _id: v.id("serviceCatalog"), _creationTime: v.number(), slug: v.string(), nameFr: v.string(), nameEn: v.string(),
  isActive: v.boolean(), sortOrder: v.number(), createdAt: v.number(), updatedAt: v.number(),
});

function normalizeSlug(value: string) {
  const slug = value.trim();
  if (!/^[a-z][A-Za-z0-9-]{1,63}$/.test(slug)) throw new ConvexError("INVALID_SERVICE_SLUG");
  return slug;
}
function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) throw new ConvexError("INVALID_SERVICE_NAME");
  return name;
}
function validateOrder(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new ConvexError("INVALID_SERVICE_ORDER");
  return value;
}

export async function listCatalog(ctx: QueryCtx | MutationCtx, activeOnly: boolean) {
  const rows = activeOnly
    ? await ctx.db.query("serviceCatalog").withIndex("by_isActive_and_sortOrder", q => q.eq("isActive", true)).take(201)
    : await ctx.db.query("serviceCatalog").withIndex("by_isActive_and_sortOrder").take(201);
  if (rows.length > 200) throw new ConvexError("SERVICE_CATALOG_LIMIT");
  return activeOnly ? rows : rows.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
}

export const listActive = query({
  args: {}, returns: v.array(catalogItem),
  handler: async ctx => await listCatalog(ctx, true),
});
export const listAdmin = query({
  args: {}, returns: v.array(catalogItem),
  handler: async ctx => { await requireAdminUser(ctx); return await listCatalog(ctx, false); },
});
export const create = mutation({
  args: { slug: v.string(), nameFr: v.string(), nameEn: v.string(), sortOrder: v.number() },
  returns: v.id("serviceCatalog"),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const slug = normalizeSlug(args.slug);
    if (await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", slug)).unique()) throw new ConvexError("SERVICE_SLUG_TAKEN");
    const now = Date.now();
    const after = { slug, nameFr: normalizeName(args.nameFr), nameEn: normalizeName(args.nameEn), isActive: true, sortOrder: validateOrder(args.sortOrder) };
    const id = await ctx.db.insert("serviceCatalog", { ...after, createdAt: now, updatedAt: now });
    await ctx.db.insert("serviceCatalogHistory", { serviceId: id, changedBy: admin._id, action: "created", after, changedAt: now });
    return id;
  },
});
export const edit = mutation({
  args: { id: v.id("serviceCatalog"), slug: v.string(), nameFr: v.string(), nameEn: v.string(), sortOrder: v.number(), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const current = await ctx.db.get(args.id);
    if (!current) throw new ConvexError("SERVICE_NOT_FOUND");
    const slug = normalizeSlug(args.slug);
    if (slug !== current.slug) {
      const duplicate = await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", slug)).unique();
      if (duplicate) throw new ConvexError("SERVICE_SLUG_TAKEN");
      const used = await ctx.db.query("companyServices").withIndex("by_serviceId", q => q.eq("serviceId", args.id)).first();
      // Legacy rows may not yet be backfilled, and must also lock the slug.
      const legacy = await ctx.db.query("companyServices").withIndex("by_service", q => q.eq("service", current.slug)).first();
      if (used || legacy) throw new ConvexError("SERVICE_SLUG_IN_USE");
    }
    const before = { slug: current.slug, nameFr: current.nameFr, nameEn: current.nameEn, isActive: current.isActive, sortOrder: current.sortOrder };
    const after = { slug, nameFr: normalizeName(args.nameFr), nameEn: normalizeName(args.nameEn), sortOrder: validateOrder(args.sortOrder), isActive: args.isActive };
    if (Object.keys(after).every(key => before[key as keyof typeof before] === after[key as keyof typeof after])) return null;
    const now = Date.now();
    await ctx.db.patch(args.id, { ...after, updatedAt: now });
    await ctx.db.insert("serviceCatalogHistory", { serviceId: args.id, changedBy: admin._id, action: "updated", before, after, changedAt: now });
    return null;
  },
});
export const seedDefaults = mutation({
  args: {}, returns: v.object({ created: v.number() }),
  handler: async ctx => {
    const admin = await requireAdminUser(ctx);
    let created = 0;
    for (const { slug, nameFr, nameEn, sortOrder } of defaultServiceCatalog) {
      if (await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", slug)).unique()) continue;
      const now = Date.now();
      const after = { slug, nameFr, nameEn, isActive: true, sortOrder };
      const id = await ctx.db.insert("serviceCatalog", { ...after, createdAt: now, updatedAt: now });
      await ctx.db.insert("serviceCatalogHistory", { serviceId: id, changedBy: admin._id, action: "created", after, changedAt: now });
      created++;
    }
    return { created };
  },
});
/** Admin-controlled, repeatable batch; unknown legacy values are preserved and reported. */
export const migrateLegacySelections = mutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ migrated: v.number(), unresolved: v.array(v.string()), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    if (args.paginationOpts.numItems > 50) throw new ConvexError("INVALID_BATCH_SIZE");
    const page = await ctx.db.query("companyServices").paginate(args.paginationOpts);
    let migrated = 0;
    const unresolved: string[] = [];
    for (const row of page.page) {
      if (row.serviceId) continue;
      const service = await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", row.service)).unique();
      if (!service) { unresolved.push(row.service); continue; }
      await ctx.db.patch(row._id, { serviceId: service._id, updatedAt: Date.now() });
      migrated++;
    }
    return { migrated, unresolved, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export async function validateNewServiceIds(ctx: MutationCtx, ids: readonly Id<"serviceCatalog">[], existingIds: ReadonlySet<Id<"serviceCatalog">> = new Set()) {
  if (ids.length < 1 || ids.length > 200 || new Set(ids).size !== ids.length) throw new ConvexError("INVALID_SERVICES");
  const rows = await Promise.all(ids.map(id => ctx.db.get(id)));
  if (rows.some((row, index) => !row || (!row.isActive && !existingIds.has(ids[index])))) throw new ConvexError("INVALID_SERVICES");
  return rows as NonNullable<(typeof rows)[number]>[];
}

export async function existingServiceIds(ctx: MutationCtx, rows: readonly { serviceId?: Id<"serviceCatalog">; service: string }[]) {
  const ids = await Promise.all(rows.map(async row => row.serviceId
    ?? (await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", row.service)).unique())?._id));
  return new Set(ids.filter((id): id is Id<"serviceCatalog"> => id !== undefined));
}

export async function resolvedServiceNames(ctx: QueryCtx, rows: readonly { serviceId?: Id<"serviceCatalog">; service: string }[]) {
  const catalog = await Promise.all(rows.map(async row => row.serviceId
    ? await ctx.db.get(row.serviceId)
    : await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", row.service)).unique()));
  return catalog.filter((item): item is NonNullable<typeof item> => item !== null).map(item => ({ slug: item.slug, nameFr: item.nameFr, nameEn: item.nameEn }));
}
