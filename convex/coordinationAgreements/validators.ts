import { ConvexError, v, type Infer } from "convex/values";
import { isCentimePrecisionMadAmount } from "../deals/money";

// Storage/transport bounds, not commercial rate or fee limits.
export const MAX_HISTORY_PAGE_SIZE = 25;
export const MAX_PUBLICATION_KEY_LENGTH = 100;
export const MAX_PERCENTAGE_LENGTH = 64;
export const TERM_LIMITS = {
  tasks: 5_000, exclusions: 5_000, visits: 2_000, availability: 2_000,
  payer: 500, paymentTerms: 5_000, basis: 5_000,
} as const;

export const feeValidator = v.union(
  v.object({ kind: v.literal("fixed"), amountMad: v.number() }),
  v.object({
    kind: v.literal("percentage"),
    // Decimal text preserves precision; no basis-point conversion or calculation.
    rate: v.string(), basis: v.string(), basisAmountMad: v.optional(v.number()),
  }),
);
export const termsValidator = v.object({
  tasks: v.string(), exclusions: v.string(), visits: v.string(),
  availability: v.string(), startDate: v.string(), currency: v.literal("MAD"),
  fee: feeValidator, payer: v.string(), paymentTerms: v.string(),
});
export type Terms = Infer<typeof termsValidator>;

// These source references are internal and never part of an agreement DTO.
export const readinessValidator = v.object({
  finalQuoteId: v.id("finalQuotes"), revisionId: v.id("finalQuoteRevisions"),
  companyId: v.id("companies"), marketplaceConversationId: v.id("conversations"),
  initialQuoteId: v.id("projectQuotes"), declaredByUserId: v.id("users"), declaredAt: v.number(),
});
export type Readiness = Infer<typeof readinessValidator>;
export const declarationValidator = v.object({
  declared: v.literal(true), actorUserId: v.id("users"), declaredAt: v.number(),
});
export const confirmationValidator = v.object({
  confirmedByUserId: v.id("users"), confirmedByDisplayName: v.string(),
  confirmedAt: v.number(), effectiveFrom: v.number(),
  notStartedDeclaration: v.optional(declarationValidator),
});
export const nullableVersionId = v.union(v.id("coordinationAgreementVersions"), v.null());
export const publicationInputValidator = v.object({
  expectedDraftRevision: v.number(), expectedReadinessRevision: v.number(),
  expectedPendingVersionId: nullableVersionId, expectedConfirmedVersionId: nullableVersionId,
  attestNotStarted: v.union(v.boolean(), v.null()),
});

function text(value: string, maximum: number) {
  const result = value.trim();
  if (!result || result.length > maximum) throw new ConvexError("INVALID_COORDINATION_TERMS");
  return result;
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeTerms(value: Terms): Terms {
  if (!validDate(value.startDate)) throw new ConvexError("INVALID_COORDINATION_DATE");
  let fee: Terms["fee"];
  if (value.fee.kind === "fixed") {
    if (!isCentimePrecisionMadAmount(value.fee.amountMad)) throw new ConvexError("INVALID_COORDINATION_AMOUNT");
    fee = { kind: "fixed", amountMad: value.fee.amountMad };
  } else {
    const rate = value.fee.rate.trim();
    if (rate.length > MAX_PERCENTAGE_LENGTH || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rate)
      || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
      throw new ConvexError("INVALID_COORDINATION_PERCENTAGE");
    }
    if (value.fee.basisAmountMad !== undefined && !isCentimePrecisionMadAmount(value.fee.basisAmountMad)) {
      throw new ConvexError("INVALID_COORDINATION_AMOUNT");
    }
    fee = { kind: "percentage", rate, basis: text(value.fee.basis, TERM_LIMITS.basis),
      ...(value.fee.basisAmountMad === undefined ? {} : { basisAmountMad: value.fee.basisAmountMad }) };
  }
  return {
    tasks: text(value.tasks, TERM_LIMITS.tasks), exclusions: text(value.exclusions, TERM_LIMITS.exclusions),
    visits: text(value.visits, TERM_LIMITS.visits), availability: text(value.availability, TERM_LIMITS.availability),
    startDate: value.startDate, currency: "MAD", fee, payer: text(value.payer, TERM_LIMITS.payer),
    paymentTerms: text(value.paymentTerms, TERM_LIMITS.paymentTerms),
  };
}

export function checkedRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw new ConvexError("INVALID_COORDINATION_REVISION");
  }
  return value;
}

export function checkedAsOf(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 253_402_300_799_999) {
    throw new ConvexError("INVALID_COORDINATION_TIME");
  }
  return value;
}

export function assertProspectiveStart(terms: Terms, now: number) {
  // Same UTC calendar convention as marketplace final-quote validity.
  if (!validDate(terms.startDate) || terms.startDate < new Date(now).toISOString().slice(0, 10)) {
    throw new ConvexError("COORDINATION_START_DATE_PASSED");
  }
}

export function publicationKey(value: string) {
  const key = value.trim();
  if (!key || key.length > MAX_PUBLICATION_KEY_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ConvexError("INVALID_IDEMPOTENCY_KEY");
  }
  return key;
}
