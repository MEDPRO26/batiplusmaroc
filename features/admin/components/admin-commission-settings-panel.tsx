"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { AdminPage, ADMIN_PRESS } from "@/features/admin/components/admin-shell";
import { findKnownCodeInText } from "@/lib/errors/codes";

type CommissionSetting = FunctionReturnType<
  typeof api.marketplaceSettings.index.getCommissionSetting
>;

export type CommissionTierDraft = {
  id: string;
  minAmountMad: string;
  maxAmountMad: string;
  commissionPercent: string;
};

export type TierValidationCode =
  | "tiersRequired"
  | "invalidBoundary"
  | "invalidRate"
  | "firstTierZero"
  | "unordered"
  | "overlap"
  | "gap"
  | "finalTierOpen"
  | "multipleOpenTiers";

export function percentageInputToBps(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [wholePart, fractionPart = ""] = normalized.split(".");
  const whole = Number(wholePart);
  const fraction = Number(fractionPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) return null;
  const basisPoints = whole * 100 + fraction;
  return basisPoints >= 0 && basisPoints <= 3_000 ? basisPoints : null;
}

export function formatBpsAsPercentage(value: number) {
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function parseWholeMad(value: string) {
  const normalized = value.trim().replace(/[\s,'’]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function tiersToDrafts(
  tiers: CommissionSetting["commissionTiers"],
): CommissionTierDraft[] {
  return tiers.map((tier, index) => ({
    id: `saved-tier-${index}`,
    minAmountMad: String(tier.minAmountMad),
    maxAmountMad: tier.maxAmountMad === null ? "" : String(tier.maxAmountMad),
    commissionPercent: formatBpsAsPercentage(tier.commissionRateBps),
  }));
}

export function addTierDraft(
  drafts: readonly CommissionTierDraft[],
  id: string,
): CommissionTierDraft[] {
  if (drafts.length === 0) {
    return [{ id, minAmountMad: "0", maxAmountMad: "", commissionPercent: "" }];
  }
  return [
    ...drafts.slice(0, -1),
    { ...drafts[drafts.length - 1] },
    { id, minAmountMad: "", maxAmountMad: "", commissionPercent: "" },
  ];
}

export function removeTierDraft(
  drafts: readonly CommissionTierDraft[],
  id: string,
): CommissionTierDraft[] {
  if (drafts.length <= 1) return [...drafts];
  const remaining = drafts.filter((tier) => tier.id !== id);
  return remaining.map((tier, index) =>
    index === remaining.length - 1 ? { ...tier, maxAmountMad: "" } : tier,
  );
}

export function updateTierDraft(
  drafts: readonly CommissionTierDraft[],
  id: string,
  field: keyof Omit<CommissionTierDraft, "id">,
  value: string,
): CommissionTierDraft[] {
  return drafts.map((tier) => tier.id === id ? { ...tier, [field]: value } : tier);
}

export function validateTierDrafts(drafts: readonly CommissionTierDraft[]):
  | { tiers: Array<{ minAmountMad: number; maxAmountMad: number | null; commissionRateBps: number }> }
  | { error: TierValidationCode } {
  if (drafts.length < 1) return { error: "tiersRequired" };
  const tiers = [];
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const minAmountMad = parseWholeMad(draft.minAmountMad);
    const maxAmountMad = draft.maxAmountMad.trim() === ""
      ? null
      : parseWholeMad(draft.maxAmountMad);
    const commissionRateBps = percentageInputToBps(draft.commissionPercent);
    if (
      minAmountMad === null ||
      (draft.maxAmountMad.trim() !== "" && maxAmountMad === null) ||
      (maxAmountMad !== null && minAmountMad > maxAmountMad)
    ) return { error: "invalidBoundary" };
    if (commissionRateBps === null) return { error: "invalidRate" };
    if (maxAmountMad === null && index !== drafts.length - 1) {
      return { error: "multipleOpenTiers" };
    }
    tiers.push({ minAmountMad, maxAmountMad, commissionRateBps });
  }
  if (tiers[0].minAmountMad !== 0) return { error: "firstTierZero" };
  if (tiers[tiers.length - 1].maxAmountMad !== null) {
    return { error: "finalTierOpen" };
  }
  for (let index = 1; index < tiers.length; index += 1) {
    const previous = tiers[index - 1];
    const current = tiers[index];
    if (current.minAmountMad <= previous.minAmountMad) return { error: "unordered" };
    if (previous.maxAmountMad === null) return { error: "multipleOpenTiers" };
    const expectedMin = previous.maxAmountMad + 1;
    if (current.minAmountMad < expectedMin) return { error: "overlap" };
    if (current.minAmountMad > expectedMin) return { error: "gap" };
  }
  return { tiers };
}

const BACKEND_ERROR_TO_MESSAGE: Record<string, TierValidationCode> = {
  COMMISSION_TIERS_REQUIRED: "tiersRequired",
  INVALID_COMMISSION_TIER_BOUNDARY: "invalidBoundary",
  INVALID_COMMISSION_RATE: "invalidRate",
  COMMISSION_FIRST_TIER_ZERO_REQUIRED: "firstTierZero",
  COMMISSION_TIERS_UNORDERED: "unordered",
  COMMISSION_TIERS_OVERLAP: "overlap",
  COMMISSION_TIERS_GAP: "gap",
  COMMISSION_FINAL_TIER_OPEN_REQUIRED: "finalTierOpen",
  COMMISSION_MULTIPLE_OPEN_TIERS: "multipleOpenTiers",
};

export function AdminCommissionSettingsPanel() {
  const t = useTranslations("adminSettings");
  const setting = useQuery(api.marketplaceSettings.index.getCommissionSetting, {});
  const updateCommissionTiers = useMutation(
    api.marketplaceSettings.index.updateCommissionTiers,
  );
  const [draftOverride, setDraftOverride] = useState<CommissionTierDraft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<TierValidationCode | "backendError" | "">("");
  const [success, setSuccess] = useState("");

  const drafts = draftOverride ?? (
    setting?.configured
      ? tiersToDrafts(setting.commissionTiers)
      : [{ id: "initial-tier", minAmountMad: "0", maxAmountMad: "", commissionPercent: "" }]
  );

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(""), 4_000);
    return () => window.clearTimeout(timeout);
  }, [success]);

  function changeTier(id: string, field: keyof Omit<CommissionTierDraft, "id">, value: string) {
    setDraftOverride(updateTierDraft(drafts, id, field, value));
    setError("");
    setSuccess("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const validation = validateTierDrafts(drafts);
    if ("error" in validation) {
      setError(validation.error);
      return;
    }
    setSaving(true);
    try {
      await updateCommissionTiers({ commissionTiers: validation.tiers });
      setDraftOverride(null);
      setSuccess(t("updatedSuccess"));
    } catch (cause) {
      const code = findKnownCodeInText(
        cause instanceof Error ? cause.message : String(cause),
      );
      setError(code ? BACKEND_ERROR_TO_MESSAGE[code] ?? "backendError" : "backendError");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminCommissionSettingsView
      drafts={drafts}
      error={error ? t(error) : ""}
      onAdd={() => setDraftOverride(addTierDraft(drafts, crypto.randomUUID()))}
      onChange={changeTier}
      onRemove={(id) => setDraftOverride(removeTierDraft(drafts, id))}
      onSubmit={submit}
      saving={saving}
      setting={setting}
      success={success}
    />
  );
}

export function AdminCommissionSettingsView({
  setting,
  drafts,
  saving,
  error,
  success,
  onChange,
  onAdd,
  onRemove,
  onSubmit,
}: {
  setting: CommissionSetting | undefined;
  drafts: CommissionTierDraft[];
  saving: boolean;
  error: string;
  success: string;
  onChange: (id: string, field: keyof Omit<CommissionTierDraft, "id">, value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("adminSettings");

  return (
    <AdminPage breadcrumb={t("title")} notice={success} title={t("title")}>
      <p className="max-w-3xl text-sm leading-6 text-[#626970]">{t("lead")}</p>
      {setting === undefined ? (
        <CommissionSettingsSkeleton label={t("loading")} />
      ) : (
        <section className="relative max-w-5xl overflow-hidden rounded-[20px] border border-[#e7eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[#2f6bff]" />
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-semibold tracking-wide text-[#2457d6]">
                  {t("policyLabel")}
                </span>
                <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-[#17191d]">
                  {t("marketplaceCommissionRules")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#626970]">{t("rulesDescription")}</p>
              </div>
              {setting.configured && setting.commissionConfigVersion !== null ? (
                <p className="shrink-0 rounded-full bg-[#f2f4f7] px-3 py-1.5 text-xs font-semibold text-[#626970]">
                  {t("version", { version: setting.commissionConfigVersion })}
                </p>
              ) : null}
            </div>

            {!setting.configured ? (
              <p className="mt-5 rounded-[14px] border border-[#f0d8a8] bg-[#fff9ec] px-4 py-3 text-sm font-medium text-[#76511d]" role="status">
                {t("configurationRequired")}
              </p>
            ) : null}

            <form className="mt-7" onSubmit={onSubmit}>
              <div aria-hidden className="hidden grid-cols-[1fr_1fr_0.8fr_auto] gap-3 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#737a84] lg:grid">
                <span>{t("dealValueFrom")}</span>
                <span>{t("dealValueTo")}</span>
                <span>{t("commission")}</span>
                <span className="w-24" />
              </div>
              <div className="mt-2 space-y-3">
                {drafts.map((tier, index) => {
                  const isFinal = index === drafts.length - 1;
                  return (
                    <fieldset
                      className="grid gap-3 rounded-[16px] border border-[#e7eaee] bg-[#f8f9fb] p-4 lg:grid-cols-[1fr_1fr_0.8fr_auto] lg:items-end"
                      disabled={saving}
                      key={tier.id}
                    >
                      <legend className="sr-only">{t("tierNumber", { number: index + 1 })}</legend>
                      <TierInput
                        ariaLabel={`${t("dealValueFrom")} ${index + 1}`}
                        label={t("dealValueFrom")}
                        onChange={(value) => onChange(tier.id, "minAmountMad", value)}
                        suffix="MAD"
                        value={tier.minAmountMad}
                      />
                      {isFinal ? (
                        <div>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#737a84] lg:sr-only">
                            {t("dealValueTo")}
                          </span>
                          <div className="flex min-h-11 items-center rounded-[12px] border border-dashed border-[#b9c2cf] bg-white px-3 text-sm font-semibold text-[#2457d6]">
                            {t("noLimit")}
                          </div>
                        </div>
                      ) : (
                        <TierInput
                          ariaLabel={`${t("dealValueTo")} ${index + 1}`}
                          label={t("dealValueTo")}
                          onChange={(value) => onChange(tier.id, "maxAmountMad", value)}
                          suffix="MAD"
                          value={tier.maxAmountMad}
                        />
                      )}
                      <TierInput
                        ariaLabel={`${t("commission")} ${index + 1}`}
                        label={t("commission")}
                        onChange={(value) => onChange(tier.id, "commissionPercent", value)}
                        suffix="%"
                        value={tier.commissionPercent}
                      />
                      <button
                        aria-label={`${t("removeTier")} ${index + 1}`}
                        className={`min-h-11 rounded-full border border-[#dfe3e8] bg-white px-4 text-sm font-semibold text-[#626970] disabled:cursor-not-allowed disabled:opacity-40 ${ADMIN_PRESS}`}
                        disabled={drafts.length === 1 || saving}
                        onClick={() => onRemove(tier.id)}
                        type="button"
                      >
                        {t("removeTier")}
                      </button>
                    </fieldset>
                  );
                })}
              </div>

              <button
                className={`mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#bfd0ff] bg-[#f4f7ff] px-5 text-sm font-semibold text-[#2457d6] disabled:opacity-50 ${ADMIN_PRESS}`}
                disabled={saving || drafts.length >= 20}
                onClick={onAdd}
                type="button"
              >
                <span aria-hidden className="mr-2 text-lg leading-none">+</span>
                {t("addTier")}
              </button>

              <div className="mt-6 border-t border-[#eceff2] pt-5">
                <div className="space-y-1 text-sm leading-6 text-[#626970]">
                  <p>{t("appliesNewDeals")}</p>
                  <p>{t("existingDealsKeepCommission")}</p>
                </div>
                <div aria-live="polite" className="min-h-8 pt-2">
                  {error ? <p className="text-sm font-medium text-[#9a342c]" role="alert">{error}</p> : null}
                </div>
                <div className="flex justify-end">
                  <button
                    className={`inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#2f6bff] px-7 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,107,255,0.22)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${ADMIN_PRESS}`}
                    disabled={saving}
                    type="submit"
                  >
                    {saving ? t("saving") : t("saveChanges")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      )}
    </AdminPage>
  );
}

function TierInput({
  value,
  label,
  ariaLabel,
  suffix,
  onChange,
}: {
  value: string;
  label: string;
  ariaLabel: string;
  suffix: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#737a84] lg:sr-only">
        {label}
      </span>
      <span className="flex min-h-11 items-center rounded-[12px] border border-[#dfe3e8] bg-white px-3 focus-within:border-[#2f6bff] focus-within:ring-2 focus-within:ring-[#2f6bff]/15">
        <input
          aria-label={ariaLabel}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums text-[#17191d] outline-none"
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
        <span aria-hidden className="ml-2 border-l border-[#e7eaee] pl-2 text-xs font-semibold text-[#737a84]">{suffix}</span>
      </span>
    </label>
  );
}

function CommissionSettingsSkeleton({ label }: { label: string }) {
  return (
    <section
      aria-busy="true"
      className="max-w-5xl animate-pulse rounded-[20px] border border-[#e7eaee] bg-white p-5 sm:p-7"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div className="h-5 w-36 rounded bg-[#e8ecf0]" />
      <div className="mt-5 h-8 w-72 rounded bg-[#e8ecf0]" />
      <div className="mt-6 space-y-3">
        <div className="h-24 rounded-[16px] bg-[#f1f3f5]" />
        <div className="h-24 rounded-[16px] bg-[#f1f3f5]" />
        <div className="h-24 rounded-[16px] bg-[#f1f3f5]" />
      </div>
    </section>
  );
}
