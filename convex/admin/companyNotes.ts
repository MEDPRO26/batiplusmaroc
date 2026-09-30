import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireAdminUser } from "./access";

const MAX_NOTE_LENGTH = 5_000;
const MAX_PAGE_SIZE = 30;

const companyAdminNoteValidator = v.object({
  id: v.id("companyAdminNotes"),
  body: v.string(),
  authorDisplayName: v.string(),
  createdAt: v.number(),
});

function normalizeBody(value: string) {
  const body = value.trim();
  if (body.length < 1 || body.length > MAX_NOTE_LENGTH) {
    throw new ConvexError("INVALID_COMPANY_ADMIN_NOTE_BODY");
  }
  return body;
}

function adminDisplayName(user: Doc<"users"> | null) {
  if (!user) return "Batiplus Admin";
  const fullName = [user.firstName?.trim(), user.lastName?.trim()]
    .filter(Boolean)
    .join(" ");
  return fullName || user.name?.trim() || "Batiplus Admin";
}

export const listCompanyAdminNotes = query({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(companyAdminNoteValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    if (
      !Number.isInteger(args.paginationOpts.numItems)
      || args.paginationOpts.numItems < 1
      || args.paginationOpts.numItems > MAX_PAGE_SIZE
    ) {
      throw new ConvexError("INVALID_COMPANY_ADMIN_NOTE_PAGE_SIZE");
    }

    const result = await ctx.db
      .query("companyAdminNotes")
      .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", company._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map(async (note) => ({
        id: note._id,
        body: note.body,
        authorDisplayName: adminDisplayName(await ctx.db.get(note.authorAdminUserId)),
        createdAt: note.createdAt,
      }))),
    };
  },
});

export const createCompanyAdminNote = mutation({
  args: { companyId: v.id("companies"), body: v.string() },
  returns: companyAdminNoteValidator,
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    const body = normalizeBody(args.body);
    const createdAt = Date.now();
    const id = await ctx.db.insert("companyAdminNotes", {
      companyId: company._id,
      authorAdminUserId: admin._id,
      body,
      createdAt,
    });
    return {
      id,
      body,
      authorDisplayName: adminDisplayName(admin),
      createdAt,
    };
  },
});
