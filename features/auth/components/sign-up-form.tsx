"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";
import { mapAuthError } from "@/features/auth/lib/map-auth-error";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { saveOAuthSignupIntent } from "@/features/auth/lib/oauth-signup-intent";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { focusFirstInvalidField } from "@/lib/forms/submit";
import { routes } from "@/lib/routes";

type SignUpRole = "client" | "company";

export function SignUpForm({ role }: { role: SignUpRole }) {
  const t = useTranslations("auth.signUpFlow");
  const tUx = useTranslations("ux");
  const locale = useLocale() as AppLocale;
  const { signIn } = useAuthActions();
  const router = useRouter();
  const formId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  const switchHref = role === "client" ? routes.signUpCompany : routes.signUpClient;
  const onboardingHref = role === "client" ? routes.clientOnboarding : routes.companyOnboarding;

  async function onGoogleSignUp() {
    setError(null);
    if (!acceptedTerms) {
      setError(t("validation.terms"));
      return;
    }

    saveOAuthSignupIntent({ accountType: role, marketingOptIn: marketing });
    setGooglePending(true);
    try {
      const redirectTo = getPathname({ locale, href: onboardingHref });
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
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!firstName || !lastName || !email || password.length < 8) {
      setError(t("validation.required"));
      focusFirstInvalidField(
        form,
        !firstName ? "firstName" : !lastName ? "lastName" : !email ? "email" : "password",
      );
      return;
    }
    if (!acceptedTerms) {
      setError(t("validation.terms"));
      return;
    }

    // Never send country from the browser — Morocco is set on the backend.
    formData.delete("country");
    formData.delete("countryCode");
    formData.set("flow", "signUp");
    formData.set("accountType", role);
    formData.set("acceptedTerms", acceptedTerms ? "true" : "false");
    formData.set("marketingOptIn", marketing ? "true" : "false");

    setSubmitting(true);
    try {
      await signIn("password", formData);
      router.push(onboardingHref);
    } catch (caught) {
      setError(mapAuthError(caught, tUx));
      setSubmitting(false);
    }
  }

  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-brand-border bg-white px-3.5 py-3 text-[0.95rem] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";

  const busy = submitting || googlePending;

  return (
    <div className=" flex flex-1 flex-col">
      <div className=" flex justify-end px-5 pb-2 sm:px-8 lg:px-10">
        <p className="mb-0 text-[0.9rem] text-muted">
          {role === "client" ? t("lookingForWork") : t("lookingToHire")}{" "}
          <Link
            className="font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            href={switchHref}
          >
            {role === "client" ? t("applyAsCompany") : t("applyAsClient")}
          </Link>
        </p>
      </div>

      <div className="mx-auto  flex w-full max-w-[740px] flex-1 flex-col px-5 pb-16 pt-2 sm:px-6 sm:pt-4">
        <h1 className="m-0 text-center text-[clamp(1.65rem,3.5vw,2.15rem)] font-semibold tracking-[-0.04em] text-ink">
          {role === "client" ? t("clientFormTitle") : t("companyFormTitle")}
        </h1>

        <div className="mt-8 grid gap-3">
          <GoogleSignInButton
            disabled={busy}
            label={t("continueGoogle")}
            onClick={() => void onGoogleSignUp()}
            pending={googlePending}
            pendingLabel={t("continuingGoogle")}
          />
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-brand-border" />
            <span className="text-[0.8rem] font-medium tracking-wide text-muted uppercase">{t("or")}</span>
            <span className="h-px flex-1 bg-brand-border" />
          </div>
        </div>

        <form className="mt-2 grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[0.9rem] font-medium text-ink" htmlFor={`${formId}-first`}>
              {t("firstName")}
              <input
                autoComplete="given-name"
                className={fieldClass}
                id={`${formId}-first`}
                name="firstName"
                required
                type="text"
              />
            </label>
            <label className="block text-[0.9rem] font-medium text-ink" htmlFor={`${formId}-last`}>
              {t("lastName")}
              <input
                autoComplete="family-name"
                className={fieldClass}
                id={`${formId}-last`}
                name="lastName"
                required
                type="text"
              />
            </label>
          </div>

          <label className="block text-[0.9rem] font-medium text-ink" htmlFor={`${formId}-email`}>
            {role === "client" ? t("workEmail") : t("email")}
            <input
              autoComplete="email"
              className={fieldClass}
              id={`${formId}-email`}
              name="email"
              required
              type="email"
            />
          </label>

          <label className="block text-[0.9rem] font-medium text-ink" htmlFor={`${formId}-password`}>
            {t("password")}
            <span className="relative mt-1.5 block">
              <input
                autoComplete="new-password"
                className={`${fieldClass} mt-0 pe-12`}
                id={`${formId}-password`}
                minLength={8}
                name="password"
                placeholder={t("passwordPlaceholder")}
                required
                type={showPassword ? "text" : "password"}
              />
              <button
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                className="absolute inset-y-0 end-0 grid w-11 place-items-center text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </span>
          </label>

          <label className="mt-1 flex items-start gap-3 text-[0.88rem] leading-6 text-ink">
            <input
              checked={marketing}
              className="mt-1 size-4 shrink-0 accent-brand"
              onChange={(event) => setMarketing(event.target.checked)}
              type="checkbox"
            />
            <span>{role === "client" ? t("marketingClient") : t("marketingCompany")}</span>
          </label>

          <label className="flex items-start gap-3 text-[0.88rem] leading-6 text-ink">
            <input
              checked={acceptedTerms}
              className="mt-1 size-4 shrink-0 accent-brand"
              onChange={(event) => setAcceptedTerms(event.target.checked)}
              required
              type="checkbox"
            />
            <span>
              {t.rich("terms", {
                terms: (chunks) => (
                  <Link className="font-semibold text-brand underline-offset-2 hover:underline" href={routes.terms}>
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link className="font-semibold text-brand underline-offset-2 hover:underline" href={routes.privacy}>
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </label>

          {error ? <FriendlyAlert>{error}</FriendlyAlert> : null}

          <button
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-[0.95rem] font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {submitting ? t("creating") : t("createAccount")}
          </button>
        </form>

        <p className="mt-8 text-center text-[0.92rem] text-muted">
          {t("alreadyHaveAccount")}{" "}
          <Link
            className="font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            href={routes.signIn}
          >
            {t("logIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.1A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a17.5 17.5 0 01-3.2 4.1M6.1 6.1C3.7 7.8 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.2 3.6-.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
