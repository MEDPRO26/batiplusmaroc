"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { NotificationPreferences } from "@/convex/notifications/deliveryPolicy";
import {
  NotificationPreferencesSkeleton,
  NotificationPreferencesView,
} from "@/features/notifications/components/notification-preferences-view";
import type { NotificationAccountType } from "@/features/notifications/lib/presentation";
import { BrowserPushDeviceControls } from "@/features/notifications/components/browser-push-device-controls";

function samePreferences(first: NotificationPreferences, second: NotificationPreferences) {
  return first.pushEnabled === second.pushEnabled
    && first.pushCategories.projects === second.pushCategories.projects
    && first.pushCategories.messages === second.pushCategories.messages
    && first.pushCategories.site_visits === second.pushCategories.site_visits
    && first.pushCategories.commercial === second.pushCategories.commercial
    && first.pushCategories.account === second.pushCategories.account;
}

export function NotificationPreferencesPanel({
  accountType,
}: {
  accountType: NotificationAccountType;
}) {
  const preferences = useQuery(
    api.notifications.preferences.getMyNotificationPreferences,
  );
  const updatePreferences = useMutation(
    api.notifications.preferences.updateMyNotificationPreferences,
  );
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  if (preferences === undefined) return <NotificationPreferencesSkeleton />;

  const persisted: NotificationPreferences = {
    pushEnabled: preferences.pushEnabled,
    pushCategories: preferences.pushCategories,
  };
  const value = draft ?? persisted;
  const dirty = !samePreferences(value, persisted);

  function change(next: NotificationPreferences) {
    setDraft(next);
    setSaved(false);
    setError(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      const result = await updatePreferences(value);
      setDraft({
        pushEnabled: result.pushEnabled,
        pushCategories: result.pushCategories,
      });
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <NotificationPreferencesView
      accountType={accountType}
      dirty={dirty}
      error={error}
      onChange={change}
      onSave={() => void save()}
      saved={saved}
      saving={saving}
      value={value}
      deviceControls={<BrowserPushDeviceControls globalPushEnabled={value.pushEnabled} />}
    />
  );
}
