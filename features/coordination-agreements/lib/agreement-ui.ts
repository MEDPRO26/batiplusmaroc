import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { getErrorCode } from "@/lib/errors/parse-error";

export const agreementApi = api.coordinationAgreements.index;
export type ClientAgreement = NonNullable<FunctionReturnType<typeof agreementApi.getMyAgreement>>;
export type AdminAgreement = NonNullable<FunctionReturnType<typeof agreementApi.getAdminAgreement>>;
export type AgreementVersion = NonNullable<ClientAgreement["pendingVersion"]>;
export type Terms = AgreementVersion["terms"];
export type PublishPayload = FunctionArgs<typeof agreementApi.publishAdminDraft>;
export type ConfirmPayload = FunctionArgs<typeof agreementApi.confirmMyVersion>;
export type Editor = {
  tasks: string; exclusions: string; visits: string; availability: string; startDate: string;
  feeKind: "" | "fixed" | "percentage"; amountMad: string; rate: string; basis: string; basisAmountMad: string;
  payer: string; paymentTerms: string;
};
export const emptyEditor = (): Editor => ({ tasks: "", exclusions: "", visits: "", availability: "", startDate: "",
  feeKind: "", amountMad: "", rate: "", basis: "", basisAmountMad: "", payer: "", paymentTerms: "" });
export function termsToEditor(terms: Terms): Editor {
  return { ...emptyEditor(), ...terms, feeKind: terms.fee.kind,
    ...(terms.fee.kind === "fixed" ? { amountMad: String(terms.fee.amountMad) }
      : { rate: terms.fee.rate, basis: terms.fee.basis, basisAmountMad: terms.fee.basisAmountMad === undefined ? "" : String(terms.fee.basisAmountMad) }) };
}

/** Strict decimal parsing: no grouping, rounding or whole-dirham parser. */
export function parseCentimeMad(input: string): number | null {
  const match = /^(0|[1-9]\d*)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents <= BigInt(0) || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const amount = Number(cents) / 100;
  return Math.round(amount * 100) === Number(cents) && Math.round(amount * 100) / 100 === amount ? amount : null;
}
export function exactPercentage(input: string): string | null {
  const value = input.trim().replace(",", ".");
  return value.length <= 64 && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && /[1-9]/.test(value) ? value : null;
}
export function realDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000-") && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function editorToTerms(editor: Editor): Terms {
  if (!realDate(editor.startDate)) throw new Error("INVALID_COORDINATION_DATE");
  let fee: Terms["fee"];
  if (editor.feeKind === "fixed") {
    const amountMad = parseCentimeMad(editor.amountMad);
    if (amountMad === null) throw new Error("INVALID_COORDINATION_AMOUNT");
    fee = { kind: "fixed", amountMad };
  } else if (editor.feeKind === "percentage") {
    const rate = exactPercentage(editor.rate);
    if (rate === null) throw new Error("INVALID_COORDINATION_PERCENTAGE");
    const basis = editor.basis.trim();
    if (!basis || basis.length > 5000) throw new Error("INVALID_COORDINATION_TERMS");
    const amount = editor.basisAmountMad.trim() ? parseCentimeMad(editor.basisAmountMad) : undefined;
    if (amount === null) throw new Error("INVALID_COORDINATION_AMOUNT");
    fee = { kind: "percentage", rate, basis, ...(amount === undefined ? {} : { basisAmountMad: amount }) };
  } else throw new Error("INVALID_COORDINATION_TERMS");
  const limits = { tasks: 5000, exclusions: 5000, visits: 2000, availability: 2000, payer: 500, paymentTerms: 5000 };
  for (const [key, max] of Object.entries(limits)) {
    const value = editor[key as keyof typeof limits].trim();
    if (!value || value.length > max) throw new Error("INVALID_COORDINATION_TERMS");
  }
  return { tasks: editor.tasks.trim(), exclusions: editor.exclusions.trim(), visits: editor.visits.trim(), availability: editor.availability.trim(),
    startDate: editor.startDate, currency: "MAD", fee, payer: editor.payer.trim(), paymentTerms: editor.paymentTerms.trim() };
}
export function startHasPassed(terms: Terms, asOf: number) { return terms.startDate < new Date(asOf).toISOString().slice(0, 10); }
export function publicationChanged(data: AdminAgreement | null, snapshot: PublishPayload) {
  return !data || data.draftRevision !== snapshot.expectedDraftRevision || data.readiness.revision !== snapshot.expectedReadinessRevision
    || (data.pendingVersion?.id ?? null) !== snapshot.expectedPendingVersionId
    || (data.currentConfirmedVersion?.id ?? null) !== snapshot.expectedConfirmedVersionId;
}
export function confirmationChanged(data: ClientAgreement | null, snapshot: ConfirmPayload, readinessRevision: number) {
  return !data || data.pendingVersion?.id !== snapshot.versionId || (data.currentConfirmedVersion?.id ?? null) !== snapshot.expectedConfirmedVersionId
    || data.readiness.revision !== readinessRevision;
}
export function agreementFailure(error: unknown) {
  const code = getErrorCode(error);
  return { code, denied: ["NOT_AUTHENTICATED", "USER_NOT_FOUND", "CLIENT_ACCOUNT_REQUIRED", "CLIENT_ONBOARDING_REQUIRED", "ADMIN_REQUIRED",
    "PROJECT_NOT_FOUND", "COORDINATION_AGREEMENT_NOT_FOUND", "COORDINATION_VERSION_NOT_FOUND"].includes(code),
    retryable: code === "UNKNOWN" || code === "NETWORK" };
}
export function focusSupportComposer(conversationId: string) {
  const field = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea[data-support-composer]"))
    .find(node => node.dataset.supportComposer === conversationId);
  field?.focus();
}
