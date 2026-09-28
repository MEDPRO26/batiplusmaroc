import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  companyOperationalStatusValidator,
  getCompanyOperationalStatus,
} from "../companies/operationalStatus";
import { requireAdminUser } from "./access";
import { createOperationalNotificationForActiveCompanyMembers } from "../notifications/model";

const historyItemValidator = v.object({
  id: v.id("companyOperationalStatusHistory"),
  fromStatus: companyOperationalStatusValidator,
  toStatus: companyOperationalStatusValidator,
  reason: v.string(),
  changedByDisplayName: v.string(),
  createdAt: v.number(),
});

function normalizeReason(value: string) {
  const reason = value.trim().replace(/\s+/g, " ");
  if (reason.length < 10 || reason.length > 1_000) {
    throw new ConvexError("INVALID_COMPANY_OPERATIONAL_STATUS_REASON");
  }
  return reason;
}

export const get = query({
  args: { companyId: v.id("companies") },
  returns: v.object({ status: companyOperationalStatusValidator }),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    return { status: getCompanyOperationalStatus(company) };
  },
});

export const listHistory = query({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(historyItemValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    if (!Number.isFinite(args.paginationOpts.numItems) || args.paginationOpts.numItems > 30) {
      throw new ConvexError("INVALID_COMPANY_OPERATIONAL_STATUS_PAGE_SIZE");
    }
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    const page = await ctx.db
      .query("companyOperationalStatusHistory")
      .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);
    const actors = await Promise.all(page.page.map((row) => ctx.db.get(row.changedByAdminUserId)));
    return {
      ...page,
      page: page.page.map((row, index) => {
        const actor = actors[index];
        const name = [actor?.firstName, actor?.lastName].filter(Boolean).join(" ").trim();
        return {
          id: row._id,
          fromStatus: row.fromStatus,
          toStatus: row.toStatus,
          reason: row.reason,
          changedByDisplayName: name || "Admin",
          createdAt: row.createdAt,
        };
      }),
    };
  },
});

export const change = mutation({
  args: {
    companyId: v.id("companies"),
    toStatus: companyOperationalStatusValidator,
    reason: v.string(),
  },
  returns: v.object({ status: companyOperationalStatusValidator }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    const fromStatus = getCompanyOperationalStatus(company);
    if (fromStatus === args.toStatus) {
      throw new ConvexError("COMPANY_OPERATIONAL_STATUS_UNCHANGED");
    }
    const reason = normalizeReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(company._id, { operationalStatus: args.toStatus, updatedAt: now });
    const historyId = await ctx.db.insert("companyOperationalStatusHistory", {
      companyId: company._id,
      fromStatus,
      toStatus: args.toStatus,
      reason,
      changedByAdminUserId: admin._id,
      createdAt: now,
    });
    const notificationType = args.toStatus === "suspended"
      ? "company_suspended" as const
      : fromStatus === "suspended"
        ? "company_reactivated" as const
        : null;
    if (notificationType) {
      await createOperationalNotificationForActiveCompanyMembers(ctx, {
        companyId: company._id,
        type: notificationType,
        entity: { type: "company_operational_status", id: historyId },
        payload: {
          companyId: company._id,
          companyName: company.name?.trim() || company.legalName?.trim() || "Company",
        },
        actorUserId: admin._id,
        dedupeKey: `company-operational-status:${historyId}:${notificationType}`,
      });
    }
    return { status: args.toStatus };
  },
});
