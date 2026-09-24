"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ClientNavbar } from "@/components/layout/client-navbar";
import { CompanyNavbar } from "@/components/layout/company-navbar";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { NavbarLoadingShell } from "@/components/layout/signed-in-navbar-chrome";
import { resolveNavbarRole } from "@/components/layout/navbar-role";

/**
 * Picks Public / Client / Company navbar from Convex Auth + currentUser.
 * Shows a lightweight shell while auth/account type resolve to avoid flicker.
 */
export function SiteHeader() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip");

  const role = resolveNavbarRole({
    isLoading,
    isAuthenticated,
    accountType: user?.accountType ?? null,
    userPending: isAuthenticated && user === undefined,
  });

  if (role === "loading") {
    return <NavbarLoadingShell />;
  }
  if (role === "client" && user) {
    return (
      <ClientNavbar
        user={{
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          onboardingStatus: user.onboardingStatus,
        }}
      />
    );
  }
  if (role === "company" && user) {
    return (
      <CompanyNavbar
        user={{
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          onboardingStatus: user.onboardingStatus,
        }}
      />
    );
  }
  return <PublicNavbar />;
}
