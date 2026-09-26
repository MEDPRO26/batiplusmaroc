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

export function AdminCommissionSettingsPanel() {
  const t = useTranslations("adminSettings");
  const setting = useQuery(api.marketplaceSettings.index.getCommissionSetting, {});
  const updateCommissionRate = useMutation(
    api.marketplaceSettings.index.updateCommissionRate,
  );
  const [inputOverride, setInputOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const input =
    inputOverride ??
    (setting?.configured && setting.commissionRateBps !== null
      ? formatBpsAsPercentage(setting.commissionRateBps)
      : "");

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(""), 4_000);
    return () => window.clearTimeout(timeout);
  }, [success]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const commissionRateBps = percentageInputToBps(input);
    if (commissionRateBps === null) {
      setError(t("invalidRate"));
      return;
    }

    setSaving(true);
    try {
      await updateCommissionRate({ commissionRateBps });
      setInputOverride(null);
      setSuccess(t("updatedSuccess"));
    } catch (cause) {
      const code = findKnownCodeInText(
        cause instanceof Error ? cause.message : String(cause),
      );
      setError(
        code === "INVALID_COMMISSION_RATE"
          ? t("invalidRate")
          : code === "COMMISSION_CONFIGURATION_REQUIRED"
            ? t("configurationRequired")
            : t("backendError"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminCommissionSettingsView
      error={error}
      input={input}
      onInputChange={(value) => {
        setInputOverride(value);
        setError("");
      }}
      onSubmit={submit}
      saving={saving}
      setting={setting}
      success={success}
    />
  );
}

export function AdminCommissionSettingsView({
  setting,
  input,
  saving,
  error,
  success,
  onInputChange,
  onSubmit,
}: {
  setting: CommissionSetting | undefined;
  input: string;
  saving: boolean;
  error: string;
  success: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("adminSettings");

  return (
    <AdminPage breadcrumb={t("title")} notice={success} title={t("title")}>
      <p className="max-w-2xl text-sm leading-6 text-[#626970]">{t("lead")}</p>
      {setting === undefined ? (
        <CommissionSettingsSkeleton label={t("loading")} />
      ) : (
        <section className="relative max-w-3xl overflow-hidden rounded-[20px] border border-[#e7eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[#2f6bff]" />
          <div className="grid gap-8 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] md:items-start">
            <div>
              <span className="inline-flex rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-semibold tracking-wide text-[#2457d6]">
                {t("policyLabel")}
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-[#17191d]">
                {t("marketplaceCommission")}
              </h2>
              <div className="mt-4 space-y-2 text-sm leading-6 text-[#626970]">
                <p>{t("appliesNewDeals")}</p>
                <p>{t("existingDealsKeepRate")}</p>
              </div>
              {!setting.configured ? (
                <p className="mt-5 rounded-[14px] border border-[#f0d8a8] bg-[#fff9ec] px-4 py-3 text-sm font-medium text-[#76511d]" role="status">
                  {t("configurationRequired")}
                </p>
              ) : null}
            </div>
            <form className="rounded-[16px] bg-[#f6f8fa] p-4 sm:p-5" onSubmit={onSubmit}>
              <label className="block text-sm font-semibold text-[#17191d]" htmlFor="commission-rate">
                {t("commissionRate")}
              </label>
              <div className="mt-3 flex min-h-12 items-center rounded-[14px] border border-[#dfe3e8] bg-white px-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] focus-within:border-[#2f6bff] focus-within:ring-2 focus-within:ring-[#2f6bff]/15">
                <input
                  aria-describedby="commission-rate-help commission-rate-error"
                  className="min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums text-[#17191d] outline-none disabled:opacity-60"
                  disabled={saving}
                  id="commission-rate"
                  inputMode="decimal"
                  name="commissionRate"
                  onChange={(event) => onInputChange(event.target.value)}
                  placeholder="10.00"
                  value={input}
                />
                <span aria-hidden className="ml-3 border-l border-[#e7eaee] pl-3 text-sm font-semibold text-[#626970]">%</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#737a84]" id="commission-rate-help">
                {t("rateHelp")}
              </p>
              <div aria-live="polite" className="min-h-7 pt-2">
                {error ? (
                  <p className="text-sm font-medium text-[#9a342c]" id="commission-rate-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <button
                className={`mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,107,255,0.22)] disabled:cursor-not-allowed disabled:opacity-60 ${ADMIN_PRESS}`}
                disabled={saving}
                type="submit"
              >
                {saving ? t("saving") : t("saveChanges")}
              </button>
            </form>
          </div>
        </section>
      )}
    </AdminPage>
  );
}

function CommissionSettingsSkeleton({ label }: { label: string }) {
  return (
    <section
      aria-busy="true"
      className="max-w-3xl animate-pulse rounded-[20px] border border-[#e7eaee] bg-white p-5 sm:p-7"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div className="h-5 w-32 rounded bg-[#e8ecf0]" />
      <div className="mt-5 h-8 w-56 rounded bg-[#e8ecf0]" />
      <div className="mt-6 h-32 rounded-[16px] bg-[#f1f3f5]" />
    </section>
  );
}
