"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { OnboardingChrome } from "@/features/auth/components/onboarding-chrome";
import { consumeOAuthSignupIntent } from "@/features/auth/lib/oauth-signup-intent";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { FormSkeleton } from "@/features/shared/components/skeletons";
import { useRouter } from "@/i18n/navigation";
import { mapConvexFailure } from "@/lib/errors";
import { focusFirstInvalidField } from "@/lib/forms/submit";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

export function ClientOnboardingForm() {
  const t = useTranslations("auth.clientOnboarding");
  const tUx = useTranslations("ux");
  const tOnboarding = useTranslations("auth.onboarding");
  const user = useQuery(api.users.currentUser);
  const profile = useQuery(
    api.clients.getOnboardingProfile,
    user?.accountType === "client" ? {} : "skip",
  );
  const finalizeOAuthSignup = useMutation(api.users.finalizeOAuthSignup);
  const completeOnboarding = useMutation(api.clients.completeOnboarding);
  const router = useRouter();
  const finalized = useRef(false);
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);

  useEffect(() => {
    if (!user || finalized.current) return;
    if (user.accountType === "client") return;
    if (user.accountType === "company" || user.accountType === "admin") {
      router.replace(
        user.accountType === "company"
          ? user.onboardingStatus === "completed"
            ? routes.companyDashboard
            : routes.companyOnboarding
          : routes.home,
      );
      return;
    }

    const intent = consumeOAuthSignupIntent();
    if (!intent || intent.accountType !== "client") {
      router.replace(routes.signUp);
      return;
    }

    finalized.current = true;
    void finalizeOAuthSignup({
      accountType: "client",
      acceptedTerms: true,
      marketingOptIn: intent.marketingOptIn,
    }).catch((caught) => {
      finalized.current = false;
      setError(mapConvexFailure(caught, tUx).message);
    });
  }, [finalizeOAuthSignup, router, tUx, user]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    setError(null);
    setFieldError(null);
    const formData = new FormData(form);

    setSubmitting(true);
    try {
      await completeOnboarding({
        firstName: String(formData.get("firstName") ?? ""),
        lastName: String(formData.get("lastName") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        city: String(formData.get("city") ?? ""),
      });
      router.replace(routes.clientDashboard);
    } catch (caught) {
      const mapped = mapConvexFailure(caught, tUx);
      if (mapped.field) setFieldError({ name: mapped.field, message: mapped.message });
      else setError(mapped.message);
      focusFirstInvalidField(form, mapped.field);
      setSubmitting(false);
    }
  }

  const chrome = <OnboardingChrome progressLabel={t("step", { current: 1, total: 1 })} progressValue={100} />;

  if (
    user === undefined ||
    profile === undefined ||
    profile === null ||
    user?.accountType !== "client"
  ) {
    return (
      <>
        {chrome}
        <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
          <FormSkeleton label={t("loading")} />
          {error ? <div className="mt-4"><FriendlyAlert>{error}</FriendlyAlert></div> : null}
        </section>
      </>
    );
  }

  const fieldClass =
    "mt-1.5 w-full rounded-[10px] border border-brand-border bg-white px-3.5 py-3 text-[0.95rem] text-ink outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted/65 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";
  const invalidClass = "border-red-400";

  function fieldMessage(name: string) {
    return fieldError?.name === name ? fieldError.message : null;
  }

  return (
    <>
      {chrome}
      <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
        <p className="m-0 text-[0.8rem] font-medium text-muted">{t("step", { current: 1, total: 1 })}</p>
        <h1 className="mt-3 mb-0 text-[1.75rem] font-semibold tracking-[-0.03em] text-ink sm:text-[2rem]">
          {t("title")}
        </h1>
        <p className="mt-2.5 mb-0 max-w-[34rem] text-[0.98rem] leading-6 text-muted">{t("lead")}</p>

        <form className="mt-8" onSubmit={onSubmit}>
          <div className="rounded-2xl border border-brand-border bg-white p-5 sm:p-7">
            <p className="m-0 text-[0.95rem] font-semibold text-ink">{t("sectionTitle")}</p>
            <p className="mt-1 mb-6 text-[0.88rem] leading-5 text-muted">{t("sectionLead")}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-first`}>
                {t("firstName")}
                <input
                  aria-invalid={fieldError?.name === "firstName"}
                  autoComplete="given-name"
                  className={joinClassNames(fieldClass, fieldError?.name === "firstName" && invalidClass)}
                  defaultValue={profile.firstName}
                  id={`${formId}-first`}
                  maxLength={80}
                  name="firstName"
                  required
                  type="text"
                />
                {fieldMessage("firstName") ? (
                  <span className="mt-1.5 block text-[0.8rem] font-normal text-red-700">{fieldMessage("firstName")}</span>
                ) : null}
              </label>
              <label className="block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-last`}>
                {t("lastName")}
                <input
                  autoComplete="family-name"
                  className={fieldClass}
                  defaultValue={profile.lastName}
                  id={`${formId}-last`}
                  maxLength={80}
                  name="lastName"
                  required
                  type="text"
                />
              </label>
            </div>

            <label className="mt-4 block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-phone`}>
              {t("phone")}
              <input
                aria-invalid={fieldError?.name === "phone"}
                autoComplete="tel"
                className={joinClassNames(fieldClass, fieldError?.name === "phone" && invalidClass)}
                defaultValue={profile.phone}
                id={`${formId}-phone`}
                inputMode="tel"
                maxLength={24}
                name="phone"
                placeholder={t("phonePlaceholder")}
                required
                type="tel"
              />
              <span className="mt-1.5 block text-[0.8rem] font-normal leading-5 text-muted">{t("phoneHint")}</span>
              {fieldMessage("phone") ? (
                <span className="mt-1 block text-[0.8rem] font-normal text-red-700">{fieldMessage("phone")}</span>
              ) : null}
            </label>

            <label className="mt-4 block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-city`}>
              {t("city")}
              <input
                aria-invalid={fieldError?.name === "city"}
                autoComplete="address-level2"
                className={joinClassNames(fieldClass, fieldError?.name === "city" && invalidClass)}
                defaultValue={profile.city}
                id={`${formId}-city`}
                maxLength={80}
                name="city"
                placeholder={t("cityPlaceholder")}
                required
                type="text"
              />
              <span className="mt-1.5 block text-[0.8rem] font-normal leading-5 text-muted">{t("cityHint")}</span>
              {fieldMessage("city") ? (
                <span className="mt-1 block text-[0.8rem] font-normal text-red-700">{fieldMessage("city")}</span>
              ) : null}
            </label>

            {error ? (
              <div className="mt-5">
                <FriendlyAlert>{error}</FriendlyAlert>
              </div>
            ) : null}

            <button
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-brand px-5 text-[0.95rem] font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-brand-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? t("saving") : t("continue")}
            </button>
          </div>
        </form>

        {user.email ? (
          <p className="mt-6 mb-0 text-center text-[0.82rem] text-muted">
            {tOnboarding("signedInAs", { email: user.email })}
          </p>
        ) : null}
      </section>
    </>
  );
}
