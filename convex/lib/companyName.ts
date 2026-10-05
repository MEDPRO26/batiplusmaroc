import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_UPLOAD_FILE_NAME_LENGTH, messagePdfFileNameAliasPattern, sanitizeMessagePdfFileName } from "../messages/attachmentRules";

/** Company names are display values in DTOs, never a public source-of-truth field. */
export function maskCompanyName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name.normalize("NFC").trim().split(/\s+/u).map((word) => {
    const characters = Array.from(word);
    return characters.slice(0, 2).join("") + "*".repeat(Math.max(0, characters.length - 2));
  }).join(" ");
}

export type CompanyNameAudience = "public" | "client" | "deal_client" | "own_company" | "admin";
export type CompanyFileNameReference = {
  originalFileName: string;
  uploadFileName?: string;
  kind: "attachment" | "final-quote" | "company-document";
};

/**
 * The caller must establish Admin or own-Company authority before selecting a
 * full-name audience. Deal Clients must be resolved by the server-side policy.
 */
export function companyNameForAudience(name: unknown, audience: CompanyNameAudience): string {
  if (audience === "admin" || audience === "own_company" || audience === "deal_client") {
    return typeof name === "string" ? name : "";
  }
  return maskCompanyName(name);
}

/** Public endpoints must keep their explicit public policy and never call this. */
export async function resolveCompanyIdentityAudience(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
): Promise<CompanyNameAudience> {
  const userId = await getAuthUserId(ctx);
  return resolveCompanyIdentityAudienceForUser(ctx, companyId, userId ? await ctx.db.get(userId) : null);
}

/**
 * Server-only recipient policy. The user must be loaded from the database;
 * notification delivery uses its stored recipient, independently of caller auth.
 * This changes identity visibility only, never permission to read an entity.
 */
export async function resolveCompanyIdentityAudienceForUser(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  user: Doc<"users"> | null,
): Promise<CompanyNameAudience> {
  if (user?.accountType === "admin") return "admin";
  if (user?.accountType === "company") {
    const member = await ctx.db.query("companyMembers").withIndex("by_companyId_and_userId", q =>
      q.eq("companyId", companyId).eq("userId", user._id)).unique();
    if (member?.status === "active") return "own_company";
  }
  if (user?.accountType === "client" && user.onboardingStatus === "completed") {
    // Any persisted Deal grants this exact relationship visibility, including
    // completed/cancelled Deals. No status filter, project flag, scan or cache.
    const deal = await ctx.db.query("deals").withIndex("by_clientUserId_and_companyId", q =>
      q.eq("clientUserId", user._id).eq("companyId", companyId)).first();
    return deal?.clientUserId === user._id && deal.companyId === companyId ? "deal_client" : "client";
  }
  return "public";
}

/** Names in authorized text follow identity policy; file aliases remain private. */
export function companyNamesToMask(company: Pick<Doc<"companies">, "name" | "legalName">, audience: CompanyNameAudience) {
  return audience === "public" || audience === "client" ? [company.name, company.legalName] : [];
}

/**
 * Shared Company attachments and Final Quotes are validated PDFs. Never copy
 * any user-controlled basename (or unknown extension) into a public/Client DTO.
 * Privileged audiences must already have passed the existing access checks.
 * A Deal reveals names only: deal_client still gets generated safe filenames.
 */
export function companyPdfFileNameForAudience(
  fileName: string,
  audience: CompanyNameAudience,
  kind: "attachment" | "final-quote" | "company-document",
): string {
  if (audience === "admin" || audience === "own_company") return fileName;
  const extension = /\.pdf$/i.exec(fileName)?.[0] ?? ".pdf";
  return `${kind}${extension}`;
}

type FileAlias = { matcher: RegExp; safeName: string; knownPath: boolean; priority: number };
type FileMatch = { start: number; end: number; safeName: string; knownPath: boolean; priority: number };
const MAX_FILE_MATCHES = 20_000;
const MAX_PRIVACY_TEXT_LENGTH = 20_000;

function fileAliasPattern(name: string) {
  return name.normalize("NFC").split(/([\s_-]+|[\\/]+)/u).map(part => {
    if (/^[\s_-]+$/u.test(part)) return "[\\s_-]+";
    if (/^[\\/]+$/u.test(part)) return "[\\\\/]+";
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
}

/**
 * Build one private model from the COMPLETE authorized file set, not from text
 * heuristics. No aliases or match metadata are ever part of a browser DTO.
 */
export function createCompanyFilePrivacyBoundary(files: readonly CompanyFileNameReference[]) {
  if (files.length > 1_100) throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
  const aliases = new Map<string, FileAlias>();
  for (const file of files) {
    const safeName = companyPdfFileNameForAudience(file.originalFileName, "client", file.kind);
    const add = (name: string, sanitizerEquivalent = false, optionalExtension = false) => {
      if (!name) return;
      if (name.length > MAX_UPLOAD_FILE_NAME_LENGTH) throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
      const normalized = name.normalize("NFC");
      // Whitespace cannot identify a file reference. Separator-only stems stay
      // literal, even when reconstructing a legacy extensionless basename.
      if (!normalized.trim()) return;
      const stem = normalized.replace(/\.pdf$/iu, "");
      const meaningfulStem = /[^\s_\\/.-]/u.test(stem);
      let pattern = meaningfulStem
        ? sanitizerEquivalent ? messagePdfFileNameAliasPattern(normalized) : fileAliasPattern(normalized)
        : normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // The old sanitizer appended .pdf to extensionless basenames. A literal
      // non-whitespace stem is safe; an empty/whitespace stem must not match all
      // text positions or ordinary spaces when the extension is omitted.
      if (optionalExtension && stem.trim()) pattern = pattern.replace(/\\\.pdf$/i, "(?:\\.pdf)?");
      const key = pattern.toLowerCase();
      if (!aliases.has(key)) {
        // Lookahead enumerates overlapping occurrences of an alias, too.
        aliases.set(key, { matcher: new RegExp(`(?=(${pattern}))`, "giu"), safeName,
          knownPath: /[\\/]/u.test(name), priority: aliases.size });
      }
    };
    for (const source of [file.originalFileName, file.uploadFileName]) {
      if (source === undefined) continue;
      add(source);
      // Preserve known full paths AND recognize safely reconstructed basenames.
      add(source.split(/[\\/]/u).at(-1) ?? "");
    }
    if (file.kind === "attachment") {
      // Sanitizer truncation discarded an unknowable suffix in old records.
      if (file.uploadFileName === undefined && file.originalFileName.length >= 180) throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
      add(sanitizeMessagePdfFileName(file.originalFileName), true, file.uploadFileName === undefined);
      if (file.uploadFileName !== undefined) add(sanitizeMessagePdfFileName(file.uploadFileName), true);
    }
  }
  return {
    redact(text: string): string {
      if (aliases.size === 0 || text.length === 0) return text;
      if (text.length > MAX_PRIVACY_TEXT_LENGTH) throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
      const normalized = text.normalize("NFC");
      const matches: FileMatch[] = [];
      for (const alias of aliases.values()) {
        alias.matcher.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = alias.matcher.exec(normalized)) !== null) {
          matches.push({ start: match.index, end: match.index + match[1].length,
            safeName: alias.safeName, knownPath: alias.knownPath, priority: alias.priority });
          if (matches.length > MAX_FILE_MATCHES) throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
          // Zero-width lookahead: advance one Unicode character explicitly.
          alias.matcher.lastIndex = match.index + (normalized.codePointAt(match.index)! > 0xffff ? 2 : 1);
        }
      }
      if (matches.length === 0) return text;
      for (const match of matches) {
        // A stripped prefix is unknowable from a legacy basename. Accept it
        // only if an independently retained FULL path alias covers the prefix.
        const before = normalized[match.start - 1] ?? "";
        // Legacy basename sanitization trimmed whitespace after a slash. Check
        // across that whitespace without treating preceding prose as a prefix.
        let prefixEnd = match.start;
        while (prefixEnd > 0 && /\s/u.test(normalized[prefixEnd - 1])) prefixEnd--;
        const unknownPrefix = /[\\/]/u.test(normalized[prefixEnd - 1] ?? "")
          || (match.knownPath && /[\p{L}\p{N}_.-]/u.test(before));
        if (unknownPrefix && !matches.some(full =>
          full.knownPath && full.start < match.start && full.end >= match.end)) {
          throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
        }
      }
      matches.sort((a, b) => a.start - b.start || b.end - a.end || a.priority - b.priority);
      const spans: Array<{ start: number; end: number; best: FileMatch }> = [];
      for (const match of matches) {
        const last = spans.at(-1);
        if (!last || match.start >= last.end) {
          spans.push({ start: match.start, end: match.end, best: match });
        } else {
          // Longest ACTUAL span owns the safe label. Union crossing overlaps
          // as well, so no discarded match can leave an original suffix behind.
          last.end = Math.max(last.end, match.end);
          const length = match.end - match.start, bestLength = last.best.end - last.best.start;
          if (length > bestLength || (length === bestLength && match.priority < last.best.priority)) last.best = match;
        }
      }
      let result = "", cursor = 0;
      for (const span of spans) {
        result += normalized.slice(cursor, span.start) + span.best.safeName;
        cursor = span.end;
      }
      return result + normalized.slice(cursor);
    },
  };
}

/** Redact known filenames before name aliases, without changing stored content. */
export function maskCompanyNamesInText(text: string, names: readonly unknown[], files: readonly CompanyFileNameReference[] = []): string {
  // An empty field cannot contain a filename reference. Its file descriptor
  // still uses the generated safe name, independently of alias reconstruction.
  if (text.length === 0) return text;
  const aliases = [...new Set(names.filter((name): name is string => typeof name === "string")
    .map((name) => name.normalize("NFC").trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  let result = createCompanyFilePrivacyBoundary(files).redact(text);
  if (aliases.length === 0) return result;
  result = result.normalize("NFC");
  for (const name of aliases) {
    const pattern = name.split(/\s+/u)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu"),
      (match) => maskCompanyName(match));
  }
  return result;
}

/**
 * Public copy cannot borrow a Client's private conversation/upload aliases.
 * Resolve any explicitly authorized references first using the same engine;
 * then withhold only the unsafe field if a filename-style identity alias is
 * still present. Never guess its basename or return private alias metadata.
 */
export function maskPublicCompanyText(text: string, names: readonly unknown[], files: readonly CompanyFileNameReference[] = []): string {
  try {
    const result = maskCompanyNamesInText(text, names, files);
    const unresolvedNames = names.filter((name): name is string => typeof name === "string")
      .map(name => name.normalize("NFC").trim().replace(/\s+/gu, " "))
      // Short names intentionally remain unchanged under the approved rule.
      .filter(name => name && maskCompanyName(name) !== name)
      .map(originalFileName => ({ originalFileName, kind: "company-document" as const }));
    const boundary = createCompanyFilePrivacyBoundary(unresolvedNames);
    return boundary.redact(result) === result ? result : "";
  } catch (error) {
    if (error instanceof ConvexError && error.data === "COMPANY_FILE_PRIVACY_LIMIT") return "";
    throw error;
  }
}

/**
 * Resolve references only within an already-authorized conversation.
 * Non-empty Client text can reference any file, including an extensionless one.
 * Always resolve the complete bounded set before replacing overlapping aliases.
 */
export async function companyFileNamesForConversation(
  ctx: QueryCtx | MutationCtx,
  conversation: Doc<"conversations">,
  texts: readonly (string | undefined)[],
  knownFiles: readonly CompanyFileNameReference[] = [],
): Promise<readonly CompanyFileNameReference[]> {
  if (!texts.some(text => text?.trim())) return knownFiles;

  const [attachments, parents] = await Promise.all([
    ctx.db.query("messageAttachments").withIndex("by_conversationId_and_createdAt", q => q.eq("conversationId", conversation._id)).take(1_001),
    ctx.db.query("finalQuotes").withIndex("by_conversationId", q => q.eq("conversationId", conversation._id)).take(2),
  ]);
  // A bounded read must never silently omit aliases and return private text.
  if (attachments.length > 1_000 || parents.length > 1) throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
  const files: CompanyFileNameReference[] = attachments.map(attachment => ({
    originalFileName: attachment.originalFileName, uploadFileName: attachment.uploadFileName, kind: "attachment" as const,
  }));
  for (const parent of parents) {
    if (parent.companyId !== conversation.companyId || parent.clientId !== conversation.clientId || parent.projectId !== conversation.projectId) {
      throw new ConvexError("FINAL_QUOTE_INTEGRITY_ERROR");
    }
    const revisions = await ctx.db.query("finalQuoteRevisions").withIndex("by_finalQuoteId_and_revisionNumber", q => q.eq("finalQuoteId", parent._id)).take(101);
    if (revisions.length > 100) throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
    for (const revision of revisions) {
      if (revision.pdfStorageId && !revision.pdfFileName?.trim() && !revision.pdfUploadFileName?.trim()) {
        throw new ConvexError("COMPANY_FILE_PRIVACY_LIMIT");
      }
      if (revision.pdfFileName || revision.pdfUploadFileName) files.push({
        originalFileName: revision.pdfFileName ?? "", uploadFileName: revision.pdfUploadFileName, kind: "final-quote",
      });
    }
  }
  // Preserve the source's safe label when both kinds share a basename, while
  // using resolved metadata rather than incomplete page-local filename hints.
  const preferred = new Set(knownFiles.map(file => `${file.kind}:${file.originalFileName}`));
  return files.sort((a, b) => Number(preferred.has(`${b.kind}:${b.originalFileName}`)) - Number(preferred.has(`${a.kind}:${a.originalFileName}`)));
}

/** For related DTOs that have already authorized this Client/project pair. */
export async function companyFileNamesForRelationship(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  companyId: Id<"companies">,
  clientId: Id<"users">,
  texts: readonly (string | undefined)[],
) {
  if (!texts.some(text => text?.trim())) return [];
  const conversations = await ctx.db.query("conversations").withIndex("by_projectId_and_companyId", q => q.eq("projectId", projectId).eq("companyId", companyId)).take(2);
  if (conversations.length > 1 || (conversations[0] && conversations[0].clientId !== clientId)) throw new ConvexError("CONVERSATION_INTEGRITY_ERROR");
  return conversations[0] ? await companyFileNamesForConversation(ctx, conversations[0], texts) : [];
}
