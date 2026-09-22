"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { BrandLogo } from "@/components/layout/brand-logo";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";
import { mapAuthError } from "@/features/auth/lib/map-auth-error";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { focusFirstInvalidField } from "@/lib/forms/submit";
import { routes } from "@/lib/routes";

export function SignInForm({ brandName }: { brandName: string }) {
  const t = useTranslations("auth.signInFlow");
  const tUx = useTranslations("ux");
  const tBrand = useTranslations("brand");
  const locale = useLocale() as AppLocale;
  const { signIn } = useAuthActions();
  const router = useRouter();
  const user = useQuery(api.users.currentUser);
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.accountType === "company") {
      router.replace(
        user.onboardingStatus === "completed" ? routes.companyDashboard : routes.companyOnboarding,
      );
      return;
    }
    if (user.accountType === "client") {
      router.replace(
        user.onboardingStatus === "completed" ? routes.clientDashboard : routes.clientOnboarding,
      );
      return;
    }
    // OAuth user without a role yet — pick Client / Company.
    router.replace(routes.signUp);
  }, [router, user]);

  async function onGoogleSignIn() {
    setError(null);
    setGooglePending(true);
    try {
      const redirectTo = getPathname({ locale, href: routes.signIn });
      await signIn("google", { redirectTo });
    } catch (caught) {
      setError(mapAuthError(caught, tUx));
      setGooglePending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email) {
      setError(t("validation.required"));
      focusFirstInvalidField(form, "email");
      return;
    }
    if (!password) {
      setError(t("validation.passwordRequired"));
      focusFirstInvalidField(form, "password");
      return;
    }

    formData.set("flow", "signIn");

    setSubmitting(true);
    try {
      await signIn("password", formData);
    } catch (caught) {
      setError(mapAuthError(caught, tUx));
      setSubmitting(false);
    }
  }

  const busy = submitting || googlePending;

  return (
    <section className="flex flex-1 flex-col items-center px-5 pb-12 pt-8 sm:pt-12">
      <Link
        aria-label={tBrand("homeAria")}
        className="mb-8 inline-flex text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:mb-10"
        href={routes.home}
      >
        <BrandLogo className="text-[1.85rem] leading-none tracking-[-0.05em] text-ink" name={brandName} />
      </Link>

      <div className="w-full max-w-[440px] rounded-xl border border-brand-border bg-white px-6 py-8 shadow-[0_8px_30px_rgb(23_61_99/0.06)] sm:px-9 sm:py-10">
        <h1 className="m-0 text-center text-[1.65rem] font-semibold tracking-[-0.04em] text-ink sm:text-[1.85rem]">
          {t("title")}
        </h1>

        <div className="mt-7 grid gap-3">
          <GoogleSignInButton
            disabled={busy}
            label={t("continueGoogle")}
            onClick={() => void onGoogleSignIn()}
            pending={googlePending}
            pendingLabel={t("continuingGoogle")}
          />
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-brand-border" />
            <span className="text-[0.8rem] font-medium tracking-wide text-muted uppercase">{t("or")}</span>
            <span className="h-px flex-1 bg-brand-border" />
          </div>
        </div>

        <form className="mt-2 grid gap-4" noValidate onSubmit={onSubmit}>
          <label className="sr-only" htmlFor={`${formId}-email`}>
            {t("emailLabel")}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-0 grid w-11 place-items-center text-muted">
              <UserIcon />
            </span>
            <input
              autoComplete="username"
              className="w-full rounded-lg border border-brand-border bg-white py-3.5 pe-3.5 ps-11 text-[0.95rem] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted/75 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]"
              id={`${formId}-email`}
              name="email"
              placeholder={t("emailPlaceholder")}
              required
              type="email"
            />
          </div>

          <label className="sr-only" htmlFor={`${formId}-password`}>
            {t("passwordLabel")}
          </label>
          <input
            autoComplete="current-password"
            className="w-full rounded-lg border border-brand-border bg-white px-3.5 py-3.5 text-[0.95rem] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted/75 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]"
            id={`${formId}-password`}
            name="password"
            placeholder={t("passwordPlaceholder")}
            required
            type="password"
          />

          {error ? <FriendlyAlert>{error}</FriendlyAlert> : null}

          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-[0.95rem] font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {submitting ? t("continuing") : t("continue")}
          </button>
        </form>

        <div className="mt-8 border-t border-brand-border pt-7 text-center">
          <p className="mb-4 text-[0.92rem] text-muted">{t("noAccount")}</p>
          <Link
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full border-2 border-brand bg-white px-5 text-[0.95rem] font-semibold text-brand transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            href={routes.signUp}
          >
            {t("signUp")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.5c1.6-3.2 4-4.8 6.5-4.8s4.9 1.6 6.5 4.8" strokeLinecap="round" />
    </svg>
  );
}
