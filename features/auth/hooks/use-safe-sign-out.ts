"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { signOutSafely } from "@/features/auth/lib/safe-sign-out";

/** Clear the current device's push capability before clearing authentication. */
export function useSafeSignOut() {
  const { signOut } = useAuthActions();
  const unregisterSubscription = useMutation(
    api.notifications.pushSubscriptions.unregisterMyPushSubscription,
  );

  return useCallback(async () => {
    return await signOutSafely({
      unregisterSubscription: async (endpoint) =>
        await unregisterSubscription({ endpoint }),
      signOut,
    });
  }, [signOut, unregisterSubscription]);
}
