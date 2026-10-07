"use client";

import { BellRing, Check, ShieldCheck } from "lucide-react";
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
    <section aria-labelledby="notification-preferences-title" className="mt-12">
      <header className="max-w-2xl">
        <p className="text-xs font-bold tracking-[0.13em] text-brand uppercase">{t("eyebrow")}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-ink" id="notification-preferences-title">
          {t("title")}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">{t("description")}</p>
      </header>

      <div className="mt-6 overflow-hidden rounded-sm border border-brand-border bg-white">
        <div className="flex items-start gap-3 border-b border-brand-border px-5 py-4 sm:px-6">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm bg-brand-soft text-brand">
            <ShieldCheck aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-ink">{t("inApp.title")}</h3>
              <span className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                {t("inApp.alwaysOn")}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted">{t("inApp.description")}</p>
          </div>
        </div>

        <div className="border-b border-brand-border px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm bg-brand-soft text-brand">
                <BellRing aria-hidden className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">{t("push.title")}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{t("push.description")}</p>
                <p className="mt-2 text-xs leading-5 text-muted">{t("push.previewNotice")}</p>
              </div>
            </div>
            <PreferenceSwitch
              checked={value.pushEnabled}
              disabled={saving}
              label={t("push.toggle")}
              onCheckedChange={(checked) => onChange({ ...value, pushEnabled: checked })}
            />
          </div>
        </div>

        {deviceControls}

        {showCategories ? (
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">{t("categories.title")}</legend>
            <div className="border-b border-brand-border px-5 py-4 sm:px-6">
              <h3 className="text-sm font-semibold text-ink">{t("categories.title")}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{t("categories.description")}</p>
            </div>
            <div className={`divide-y divide-brand-border ${value.pushEnabled ? "" : "opacity-55"}`}>
              {NOTIFICATION_PREFERENCE_CATEGORY_ORDER.map((category) => (
                <div className="flex min-h-14 items-center justify-between gap-4 px-5 py-3 sm:px-6" key={category}>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{t(`categories.${category}.title`)}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">
                      {t(`categories.${category}.description`)}
                    </span>
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
          <p className="border-b border-brand-border px-5 py-4 text-sm leading-6 text-muted sm:px-6">
            {t("categories.internalRoleNotice")}
          </p>
        )}

        {error ? (
          <p className="border-b border-brand-border bg-red-50 px-5 py-3 text-sm text-red-900 sm:px-6" role="alert">
            {t("error")}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3 bg-slate-50/80 px-5 py-4 sm:px-6">
          <p aria-live="polite" className="mr-auto text-sm font-medium text-emerald-700">
            {saved ? (
              <>
                <Check aria-hidden className="mr-1 inline size-4" />
                {t("success")}
              </>
            ) : null}
          </p>
          <button
            className="min-h-11 rounded-sm bg-brand px-5 text-sm font-semibold text-white transition-[opacity,transform] active:scale-[0.96] hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden
        className={`relative h-6 w-10 rounded-sm transition-colors duration-150 ${
          checked ? "bg-brand" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-sm bg-white shadow-sm transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export function NotificationPreferencesSkeleton() {
  return (
    <div aria-label="loading" className="mt-12" role="status">
      <div className="skeleton-block h-4 w-36 rounded-sm" />
      <div className="skeleton-block mt-3 h-6 w-56 rounded-sm" />
      <div className="skeleton-block mt-2 h-3 w-4/5 max-w-md rounded-sm" />
        <div className="mt-6 overflow-hidden rounded-sm border border-brand-border bg-white">
        <div className="skeleton-block m-5 h-14 rounded-sm" />
        <div className="skeleton-block mx-5 mb-5 h-14 rounded-sm" />
      </div>
    </div>
  );
}
