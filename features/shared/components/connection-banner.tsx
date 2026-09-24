"use client";

import { useConvexConnectionState } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { FriendlyAlert } from "@/features/shared/components/error-state";

export function ConnectionBanner() {
  const t = useTranslations("ux");
  const connection = useConvexConnectionState();
  const [visible, setVisible] = useState(false);

  const disconnected = !connection.isWebSocketConnected;
  const shouldShow = disconnected && (connection.hasEverConnected || connection.connectionRetries >= 2);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(shouldShow), shouldShow ? 800 : 0);
    return () => window.clearTimeout(timer);
  }, [shouldShow]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-lg shadow-[0_10px_30px_rgb(23_61_99/0.12)]">
        <FriendlyAlert tone="info">{t("offline")}</FriendlyAlert>
      </div>
    </div>
  );
}
