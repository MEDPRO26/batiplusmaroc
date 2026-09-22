"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export function AuthSessionControls({ className }: { className: string; inverted?: boolean }) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();
  const router = useRouter();

  if (isLoading) {
    return <span className={className} aria-hidden="true" />;
  }

  if (isAuthenticated) {
    const workspace =
      user?.accountType === "company"
        ? user.onboardingStatus === "completed"
          ? routes.companyDashboard
          : routes.companyOnboarding
        : user?.onboardingStatus === "completed"
          ? routes.clientDashboard
          : routes.clientOnboarding;

    return (
      <>
        <Link className={className} href={workspace}>
          {tAuth("workspace")}
        </Link>
        <button
          className={`${className} cursor-pointer border-0 bg-transparent p-0`}
          onClick={() => {
            void signOut().then(() => router.push(routes.signIn));
          }}
          type="button"
        >
          {tAuth("signOut")}
        </button>
      </>
    );
  }

  return (
    <>
      <Link className={className} href={routes.signIn}>
        {t("signIn")}
      </Link>
      <Link className={className} href={routes.signUp}>
        {t("signUp")}
      </Link>
    </>
  );
}

export function MobileAuthSessionControls({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const itemClass =
    "flex min-h-12 w-full items-center justify-between border-b border-brand-border px-1.5 text-start transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  if (isLoading) return null;

  if (isAuthenticated) {
    const workspace =
      user?.accountType === "company"
        ? user.onboardingStatus === "completed"
          ? routes.companyDashboard
          : routes.companyOnboarding
        : user?.onboardingStatus === "completed"
          ? routes.clientDashboard
          : routes.clientOnboarding;
    return (
      <>
        <Link className={itemClass} href={workspace} onClick={onNavigate}>
          {tAuth("workspace")}
        </Link>
        <button
          className={`${itemClass} cursor-pointer border-x-0 border-t-0 bg-transparent`}
          onClick={() => {
            onNavigate();
            void signOut().then(() => router.push(routes.signIn));
          }}
          type="button"
        >
          {tAuth("signOut")}
        </button>
      </>
    );
  }

  return (
    <>
      <Link className={itemClass} href={routes.signIn} onClick={onNavigate}>
        {t("signIn")}
      </Link>
      <Link className={itemClass} href={routes.signUp} onClick={onNavigate}>
        {t("signUp")}
      </Link>
    </>
  );
}
