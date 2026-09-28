"use client";

import { BellRing, Check, Info, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type {
  NotificationPreferenceCategory,
  NotificationPreferences,
} from "@/convex/notifications/deliveryPolicy";
import type { NotificationAccountType } from "@/features/notifications/lib/presentation";

export const NOTIFICATION_PREFERENCE_CATEGORY_ORDER = [
  "projects",
  "messages",
  "site_visits",
  "commercial",
  "account",
] as const satisfies readonly NotificationPreferenceCategory[];

export function NotificationPreferencesView({
  accountType,
  value,
  saving,
  saved,
  error,
  dirty,
  onChange,
  onSave,
  deviceControls,
}: {
  accountType: NotificationAccountType;
  value: NotificationPreferences;
  saving: boolean;
  saved: boolean;
  error: boolean;
  dirty: boolean;
  onChange: (value: NotificationPreferences) => void;
  onSave: () => void;
  deviceControls?: ReactNode;
}) {
  const t = useTranslations("notificationPreferences");
  const showCategories = accountType === "client" || accountType === "company";

  function setCategory(category: NotificationPreferenceCategory, enabled: boolean) {
    onChange({
      ...value,
      pushCategories: { ...value.pushCategories, [category]: enabled },
    });
  }

  return (
    <section
      aria-labelledby="notification-preferences-title"
      className="mt-10 overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm"
    >
      <div className="border-b border-brand-border px-5 py-5 sm:px-6">
        <p className="text-xs font-bold tracking-[0.13em] text-brand uppercase">{t("eyebrow")}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-ink" id="notification-preferences-title">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{t("description")}</p>
      </div>

      <div className="grid gap-5 p-5 sm:p-6">
        <div className="flex gap-3 rounded-xl bg-brand-soft/65 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand shadow-sm ring-1 ring-brand-border">
            <ShieldCheck aria-hidden className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold text-ink">{t("inApp.title")}</h3>
            <p className="mt-1 text-sm leading-6 text-muted">{t("inApp.description")}</p>
          </div>
        </div>

        <div className="rounded-xl border border-brand-border p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                <BellRing aria-hidden className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold text-ink">{t("push.title")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{t("push.description")}</p>
              </div>
            </div>
            <PreferenceSwitch
              checked={value.pushEnabled}
              disabled={saving}
              label={t("push.toggle")}
              onCheckedChange={(checked) => onChange({ ...value, pushEnabled: checked })}
            />
          </div>

          <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>{t("push.previewNotice")}</p>
          </div>
        </div>

        {deviceControls}

        {showCategories ? (
          <fieldset className="rounded-xl border border-brand-border p-4 sm:p-5">
            <legend className="px-1 text-sm font-semibold text-ink">{t("categories.title")}</legend>
            <p className="mt-1 text-sm leading-6 text-muted">{t("categories.description")}</p>
            <div className="mt-4 divide-y divide-brand-border">
              {NOTIFICATION_PREFERENCE_CATEGORY_ORDER.map((category) => (
                <div className="flex min-h-14 items-center justify-between gap-4 py-2" key={category}>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{t(`categories.${category}.title`)}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">{t(`categories.${category}.description`)}</span>
                  </span>
                  <PreferenceSwitch
                    checked={value.pushCategories[category]}
                    disabled={saving || !value.pushEnabled}
                    label={t(`categories.${category}.toggle`)}
                    onCheckedChange={(checked) => setCategory(category, checked)}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="rounded-xl border border-brand-border px-4 py-3 text-sm leading-6 text-muted">
            {t("categories.internalRoleNotice")}
          </p>
        )}

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">{t("error")}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p aria-live="polite" className="mr-auto text-sm font-medium text-emerald-700">
            {saved ? <><Check aria-hidden className="mr-1 inline size-4" />{t("success")}</> : null}
          </p>
          <button
            className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-[opacity,transform] active:scale-[0.98] hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            disabled={saving || !dirty}
            onClick={onSave}
            type="button"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </section>
  );
}

function PreferenceSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative flex h-11 w-14 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        checked ? "bg-brand" : "bg-slate-300"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden
        className={`size-6 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-0"}`}
      />
    </button>
  );
}

export function NotificationPreferencesSkeleton() {
  return (
    <div aria-label="loading" className="mt-10 rounded-2xl border border-brand-border bg-white p-6" role="status">
      <div className="skeleton-block h-5 w-48 rounded" />
      <div className="skeleton-block mt-3 h-3 w-4/5 rounded" />
      <div className="skeleton-block mt-6 h-24 w-full rounded-xl" />
      <div className="skeleton-block mt-4 h-24 w-full rounded-xl" />
    </div>
  );
}
