/**
 * Development-only repair for legacy discussion_open quotes created before
 * conversation creation became atomic. Requires an explicit deployment env opt-in.
 */
import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";
import { ensureConversationForQuote } from "../messages/index";

const MAX_LEGACY_QUOTES = 100;

function assertDevelopmentOptIn(confirmDevelopment: boolean) {
  if (!confirmDevelopment || process.env.ALLOW_DEV_CONVERSATION_RECOVERY !== "true") {
    throw new ConvexError("ALLOW_DEV_CONVERSATION_RECOVERY=true is required on the development deployment");
  }
}

async function legacyDiscussionQuotes(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("projectQuotes")
    .filter((q) => q.eq(q.field("status"), "discussion_open"))
    .take(MAX_LEGACY_QUOTES + 1);
}

const recoverySummaryValidator = v.object({
  candidates: v.number(),
  missing: v.number(),
  existing: v.number(),
  duplicateGroups: v.number(),
  invalid: v.number(),
  truncated: v.boolean(),
});

export const inspectLegacyDiscussions = internalQuery({
  args: { confirmDevelopment: v.boolean() },
  returns: recoverySummaryValidator,
  handler: async (ctx, args) => {
    assertDevelopmentOptIn(args.confirmDevelopment);
    const quotes = await legacyDiscussionQuotes(ctx);
    let missing = 0;
    let existing = 0;
    let duplicateGroups = 0;
    let invalid = 0;
    for (const quote of quotes.slice(0, MAX_LEGACY_QUOTES)) {
      const project = await ctx.db.get(quote.projectId);
      if (!project) {
        invalid += 1;
        continue;
      }
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", quote.projectId).eq("companyId", quote.companyId))
        .take(2);
      if (conversations.length > 1) duplicateGroups += 1;
      else if (conversations.length === 1) existing += 1;
      else missing += 1;
    }
    return {
      candidates: Math.min(quotes.length, MAX_LEGACY_QUOTES),
      missing,
      existing,
      duplicateGroups,
      invalid,
      truncated: quotes.length > MAX_LEGACY_QUOTES,
    };
  },
});

export const backfillLegacyDiscussions = internalMutation({
  args: { confirmDevelopment: v.boolean() },
  returns: v.object({
    ...recoverySummaryValidator.fields,
    created: v.number(),
  }),
  handler: async (ctx, args) => {
    assertDevelopmentOptIn(args.confirmDevelopment);
    const quotes = await legacyDiscussionQuotes(ctx);
    let created = 0;
    let existing = 0;
    let duplicateGroups = 0;
    let invalid = 0;
    for (const quote of quotes.slice(0, MAX_LEGACY_QUOTES)) {
      const project = await ctx.db.get(quote.projectId);
      if (!project) {
        invalid += 1;
        continue;
      }
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", quote.projectId).eq("companyId", quote.companyId))
        .take(2);
      if (conversations.length > 1) {
        duplicateGroups += 1;
        continue;
      }
      if (conversations.length === 1) {
        existing += 1;
        continue;
      }
      await ensureConversationForQuote(ctx, quote, project, project.clientId);
      created += 1;
    }
    return {
      candidates: Math.min(quotes.length, MAX_LEGACY_QUOTES),
      missing: 0,
      existing,
      duplicateGroups,
      invalid,
      truncated: quotes.length > MAX_LEGACY_QUOTES,
      created,
    };
  },
});
