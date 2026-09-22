"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { OnboardingChrome } from "@/features/auth/components/onboarding-chrome";
import { consumeOAuthSignupIntent } from "@/features/auth/lib/oauth-signup-intent";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export function OnboardingScreen({ accountType }: { accountType: "client" | "company" }) {
  const t = useTranslations("auth.onboarding");
  const tAuth = useTranslations("auth");
  const tErrors = useTranslations("auth.signUpFlow.errors");
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.currentUser);
  const finalizeOAuthSignup = useMutation(api.users.finalizeOAuthSignup);
  const ensureCurrentUserFoundation = useMutation(api.users.ensureCurrentUserFoundation);
  const router = useRouter();
  const finalized = useRef(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || finalized.current) return;

    // Password signups already have accountType. OAuth needs one finalize pass.
    if (user.accountType === "client" || user.accountType === "company") {
      if (user.accountType !== accountType) {
        router.replace(user.accountType === "client" ? routes.clientOnboarding : routes.companyOnboarding);
        return;
      }

      finalized.current = true;
      void ensureCurrentUserFoundation().catch(() => {
        finalized.current = false;
        setFinalizeError(tErrors("generic"));
      });
      return;
    }

    const intent = consumeOAuthSignupIntent();
    if (!intent || intent.accountType !== accountType) {
      // Signed in via Google without a role — send to role selection.
      router.replace(routes.signUp);
      return;
    }

    finalized.current = true;
    void finalizeOAuthSignup({
      accountType: intent.accountType,
      acceptedTerms: true,
      marketingOptIn: intent.marketingOptIn,
    }).catch(() => {
      finalized.current = false;
      setFinalizeError(tErrors("generic"));
    });
  }, [accountType, ensureCurrentUserFoundation, finalizeOAuthSignup, router, tErrors, user]);

  return (
    <>
      <OnboardingChrome progressLabel={t("eyebrow")} progressValue={40} />
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
      <p className="mb-3 text-[0.7rem] font-bold tracking-[0.18em] text-brand uppercase">{t("eyebrow")}</p>
      <h1 className="m-0 text-[clamp(2rem,4.5vw,3.4rem)] font-semibold tracking-[-0.045em] text-ink">
        {accountType === "client" ? t("clientTitle") : t("companyTitle")}
      </h1>
      <p className="mt-5 mb-0 max-w-2xl text-base leading-7 text-muted sm:text-lg">
        {accountType === "client" ? t("clientLead") : t("companyLead")}
      </p>
      {user?.email ? (
        <p className="mt-4 mb-0 text-sm text-ink">{t("signedInAs", { email: user.email })}</p>
      ) : null}
      {finalizeError ? (
        <p className="mt-4 mb-0 rounded-lg bg-red-50 px-3 py-2 text-[0.88rem] text-red-700" role="alert">
          {finalizeError}
        </p>
      ) : null}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link className="button button-primary" href={routes.home}>
          {t("backHome")}
        </Link>
        <button
          className="button border border-brand-border bg-white text-ink"
          onClick={() => void signOut()}
          type="button"
        >
          {tAuth("signOut")}
        </button>
      </div>
    </section>
    </>
  );
}
