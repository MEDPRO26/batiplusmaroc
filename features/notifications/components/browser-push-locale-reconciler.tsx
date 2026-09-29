"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { reconcileExistingBrowserPushLocale } from "@/features/notifications/lib/browser-push";

/**
 * Keeps an already-enabled browser subscription aligned with the signed-in
 * user's active locale from every localized route, not only Preferences.
 */
export function BrowserPushLocaleReconciler() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const locale = useLocale() === "fr" ? "fr" : "en";
  const registerSubscription = useMutation(
    api.notifications.pushSubscriptions.registerMyPushSubscription,
  );
  const attemptedLocale = useRef<"fr" | "en" | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      // A later sign-in may represent a different account using the same
      // browser subscription, so it must get a fresh proof-of-possession bind.
      attemptedLocale.current = null;
      return;
    }
    if (attemptedLocale.current === locale) return;

    attemptedLocale.current = locale;
    void reconcileExistingBrowserPushLocale(locale, registerSubscription).catch(() => {
      // Keep this best-effort background repair invisible. A later locale or
      // authenticated mount may retry; the explicit device controls still
      // expose actionable failures to the user.
      if (attemptedLocale.current === locale) attemptedLocale.current = null;
    });
  }, [isAuthenticated, isLoading, locale, registerSubscription]);

  return null;
}
