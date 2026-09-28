"use client";

import { useAction, useConvex, useMutation } from "convex/react";
import { BellRing, CheckCircle2, CircleAlert, LoaderCircle, MonitorSmartphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  disableBrowserPush,
  enableBrowserPush,
  inspectBrowserPush,
  type SerializedPushSubscription,
} from "@/features/notifications/lib/browser-push";

export type BrowserPushDeviceStatus =
  | "loading"
  | "unsupported"
  | "not_enabled"
  | "denied"
  | "enabled"
  | "error";

const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function BrowserPushDeviceControls({
  globalPushEnabled,
}: {
  globalPushEnabled: boolean;
}) {
  const locale = useLocale() === "fr" ? "fr" : "en";
  const convex = useConvex();
  const registerSubscription = useMutation(
    api.notifications.pushSubscriptions.registerMyPushSubscription,
  );
  const unregisterSubscription = useMutation(
    api.notifications.pushSubscriptions.unregisterMyPushSubscription,
  );
  const sendTestPush = useAction(api.notifications.pushTest.sendMyTestPush);
  const isRegistered = useCallback(async (endpoint: string) => {
    const result = await convex.query(
      api.notifications.pushSubscriptions.getMyPushSubscriptionState,
      { endpoint },
    );
    return result.registered;
  }, [convex]);
  const register = useCallback(async (subscription: SerializedPushSubscription) => {
    await registerSubscription(subscription);
  }, [registerSubscription]);
  const unregister = useCallback(async (endpoint: string) => {
    await unregisterSubscription({ endpoint });
  }, [unregisterSubscription]);
  const sendTest = useCallback(async (nextLocale: "en" | "fr") => (
    await sendTestPush({ locale: nextLocale })
  ), [sendTestPush]);

  return (
    <BrowserPushDeviceFlow
      globalPushEnabled={globalPushEnabled}
      isRegistered={isRegistered}
      locale={locale}
      publicVapidKey={PUBLIC_VAPID_KEY}
      registerSubscription={register}
      sendTestPush={sendTest}
      unregisterSubscription={unregister}
    />
  );
}

export function BrowserPushDeviceFlow({
  globalPushEnabled,
  locale,
  publicVapidKey,
  isRegistered,
  registerSubscription,
  unregisterSubscription,
  sendTestPush,
}: {
  globalPushEnabled: boolean;
  locale: "en" | "fr";
  publicVapidKey: string;
  isRegistered: (endpoint: string) => Promise<boolean>;
  registerSubscription: (subscription: SerializedPushSubscription) => Promise<void>;
  unregisterSubscription: (endpoint: string) => Promise<void>;
  sendTestPush: (locale: "en" | "fr") => Promise<{ sent: number; removed: number; failed: number }>;
}) {
  const [status, setStatus] = useState<BrowserPushDeviceStatus>("loading");
  const [subscription, setSubscription] = useState<SerializedPushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle");

  const refresh = useCallback(async () => {
    try {
      const inspection = await inspectBrowserPush();
      setTestResult("idle");
      if (!inspection.supported) {
        setSubscription(null);
        setStatus("unsupported");
      } else if (inspection.permission === "denied") {
        setSubscription(null);
        setStatus("denied");
      } else if (!inspection.subscription) {
        setSubscription(null);
        setStatus("not_enabled");
      } else {
        const registered = await isRegistered(inspection.subscription.endpoint);
        setSubscription(inspection.subscription);
        setStatus(registered ? "enabled" : "not_enabled");
      }
    } catch {
      setStatus("error");
    }
  }, [isRegistered]);

  useEffect(() => {
    // The async inspection reads browser permission/service-worker state before updating React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setTestResult("idle");
    try {
      const next = await enableBrowserPush(publicVapidKey);
      await registerSubscription(next);
      setSubscription(next);
      setStatus("enabled");
    } catch {
      const permission = typeof Notification === "undefined" ? null : Notification.permission;
      setStatus(permission === "denied" ? "denied" : "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    setTestResult("idle");
    try {
      const removed = await disableBrowserPush();
      await unregisterSubscription(removed?.endpoint ?? subscription.endpoint);
      setSubscription(null);
      setStatus("not_enabled");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  async function testPush() {
    setBusy(true);
    setTestResult("idle");
    try {
      const result = await sendTestPush(locale);
      setTestResult(result.sent > 0 && result.failed === 0 ? "success" : "error");
      if (result.removed > 0) await refresh();
    } catch {
      setTestResult("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BrowserPushDeviceView
      busy={busy}
      globalPushEnabled={globalPushEnabled}
      onDisable={() => void disable()}
      onEnable={() => void enable()}
      onTest={() => void testPush()}
      status={status}
      testResult={testResult}
    />
  );
}

export function BrowserPushDeviceView({
  status,
  busy,
  globalPushEnabled,
  testResult,
  onEnable,
  onDisable,
  onTest,
}: {
  status: BrowserPushDeviceStatus;
  busy: boolean;
  globalPushEnabled: boolean;
  testResult: "idle" | "success" | "error";
  onEnable: () => void;
  onDisable: () => void;
  onTest: () => void;
}) {
  const t = useTranslations("notificationPreferences.device");
  const enabled = status === "enabled";
  const actionable = status === "not_enabled" || status === "error";
  const icon = status === "loading"
    ? <LoaderCircle aria-hidden className="size-5 animate-spin" />
    : enabled
      ? <CheckCircle2 aria-hidden className="size-5" />
      : status === "denied" || status === "error"
        ? <CircleAlert aria-hidden className="size-5" />
        : <MonitorSmartphone aria-hidden className="size-5" />;

  return (
    <div className="rounded-xl border border-brand-border p-4 sm:p-5" data-testid="browser-push-device">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{t("title")}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{t("description")}</p>
          <p aria-live="polite" className="mt-3 text-sm font-medium text-ink">
            {t(`status.${status}`)}
          </p>
        </div>
      </div>

      {!globalPushEnabled ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-5 text-muted">
          {t("globalPreferenceOff")}
        </p>
      ) : null}

      {status === "denied" ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
          {t("deniedHelp")}
        </p>
      ) : null}

      {testResult === "success" ? (
        <p aria-live="polite" className="mt-4 text-sm font-medium text-emerald-700">{t("testSuccess")}</p>
      ) : null}
      {testResult === "error" ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-900" role="alert">
          {t("testError")}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {actionable ? (
          <DeviceButton disabled={busy} onClick={onEnable} primary>
            {busy ? t("working") : t("enable")}
          </DeviceButton>
        ) : null}
        {enabled ? (
          <>
            <DeviceButton disabled={busy} onClick={onTest} primary>
              <BellRing aria-hidden className="size-4" />
              {busy ? t("working") : t("sendTest")}
            </DeviceButton>
            <DeviceButton disabled={busy} onClick={onDisable}>
              {t("disable")}
            </DeviceButton>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DeviceButton({
  children,
  disabled,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? "bg-brand text-white hover:bg-brand-dark" : "border border-brand-border text-ink hover:bg-slate-50"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
