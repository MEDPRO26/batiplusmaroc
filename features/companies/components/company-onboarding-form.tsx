"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

const logoTypes = ["image/jpeg", "image/png", "image/webp"];
const maxLogoBytes = 5 * 1024 * 1024;
const totalSteps = 3;
type Step = 1 | 2 | 3;
type CompanyOnboardingProfile = NonNullable<
  FunctionReturnType<typeof api.companies.index.getOnboardingProfile>
>;
type CompanyService = CompanyOnboardingProfile["serviceOptions"][number];

export function CompanyOnboardingForm() {
  const t = useTranslations("auth.companyOnboarding");
  const tUx = useTranslations("ux");
  const tOnboarding = useTranslations("auth.onboarding");
  const user = useQuery(api.users.currentUser);
  const profile = useQuery(
    api.companies.index.getOnboardingProfile,
    user?.accountType === "company" ? {} : "skip",
  );
  const finalizeOAuthSignup = useMutation(api.users.finalizeOAuthSignup);
  const completeOnboarding = useMutation(api.companies.index.completeOnboarding);
  const requestUpload = useAction(api.storage.r2.requestPublicMediaUpload);
  const verifyUpload = useAction(api.storage.r2.verifyPublicMediaUpload);
  const router = useRouter();
  const finalized = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (logoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl);
  }, [logoPreviewUrl]);

  useEffect(() => {
    if (!user || finalized.current) return;
    if (user.accountType === "company") return;
    if (user.accountType !== null) {
      router.replace(workspaceRouteForUser(user));
      return;
    }

    const intent = consumeOAuthSignupIntent();
    if (!intent || intent.accountType !== "company") {
      router.replace(routes.signUp);
      return;
    }

    finalized.current = true;
    void finalizeOAuthSignup({
      accountType: "company",
      acceptedTerms: true,
      marketingOptIn: intent.marketingOptIn,
    }).catch((caught) => {
      finalized.current = false;
      setError(mapConvexFailure(caught, tUx).message);
    });
  }, [finalizeOAuthSignup, router, tUx, user]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const form = formRef.current;
    if (!form) return;
    const first = form.querySelector<HTMLElement>(`[data-step="${step}"] input, [data-step="${step}"] textarea`);
    first?.focus();
  }, [step]);

  async function uploadLogo(file: File) {
    if (file.size > maxLogoBytes || !logoTypes.includes(file.type)) {
      throw new Error("INVALID_LOGO");
    }
    const intent = await requestUpload({
      purpose: "companyLogo",
      contentType: file.type,
      size: file.size,
    });
    const response = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("INVALID_LOGO");
    await verifyUpload({ uploadToken: intent.uploadToken });
    return intent.uploadToken;
  }

  function invalid(name: string) {
    return fieldError?.name === name;
  }

  function fieldMessage(name: string) {
    return invalid(name) ? fieldError?.message : null;
  }

  const fieldClass =
    "mt-1.5 w-full rounded-[10px] border border-brand-border bg-white px-3.5 py-3 text-[0.95rem] text-ink outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted/65 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";

  function inputClass(name: string) {
    return joinClassNames(fieldClass, invalid(name) && "border-red-400");
  }

  function goToStep(next: Step) {
    setError(null);
    setFieldError(null);
    setStep(next);
  }

  function validateCurrentStep(form: HTMLFormElement): boolean {
    const formData = new FormData(form);
    if (step === 1) {
      const name = String(formData.get("name") ?? "").trim();
      const description = String(formData.get("description") ?? "").trim();
      if (name.length < 2) {
        setFieldError({ name: "name", message: t("validation.companyName") });
        focusFirstInvalidField(form, "name");
        return false;
      }
      if (description.length < 20 || description.length > 1000) {
        setFieldError({ name: "description", message: t("validation.description") });
        focusFirstInvalidField(form, "description");
        return false;
      }
      return true;
    }
    if (step === 2) {
      if (formData.getAll("services").length === 0) {
        setFieldError({ name: "services", message: t("validation.services") });
        return false;
      }
      return true;
    }
    const phone = String(formData.get("phone") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    if (!phone) {
      setFieldError({ name: "phone", message: t("validation.phone") });
      focusFirstInvalidField(form, "phone");
      return false;
    }
    if (city.length < 2) {
      setFieldError({ name: "city", message: t("validation.city") });
      focusFirstInvalidField(form, "city");
      return false;
    }
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    setError(null);
    setFieldError(null);

    if (step < totalSteps) {
      if (validateCurrentStep(form)) goToStep((step + 1) as Step);
      return;
    }
    if (!validateCurrentStep(form)) return;

    const formData = new FormData(form);
    const yearsValue = String(formData.get("yearsExperience") ?? "").trim();
    const logo = formData.get("logo");

    setSubmitting(true);
    try {
      const logoUploadToken =
        logo instanceof File && logo.size > 0 ? await uploadLogo(logo) : undefined;
      await completeOnboarding({
        name: String(formData.get("name") ?? ""),
        legalName: String(formData.get("legalName") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        city: String(formData.get("city") ?? ""),
        description: String(formData.get("description") ?? ""),
        services: formData.getAll("services").map(String) as CompanyService[],
        yearsExperience: yearsValue === "" ? undefined : Number(yearsValue),
        website: String(formData.get("website") ?? ""),
        logoUploadToken,
      });
      router.replace(routes.companyDashboard);
    } catch (caught) {
      const mapped = mapConvexFailure(caught, tUx);
      if (mapped.field) {
        const fieldStep = stepForField(mapped.field);
        if (fieldStep !== step) setStep(fieldStep);
        setFieldError({ name: mapped.field, message: mapped.message });
      } else {
        setError(mapped.message);
      }
      focusFirstInvalidField(form, mapped.field);
      setSubmitting(false);
    }
  }

  const chrome = (
    <OnboardingChrome
      progressLabel={t("step", { current: step, total: totalSteps })}
      progressValue={Math.round((step / totalSteps) * 100)}
    />
  );

  if (
    user === undefined ||
    profile === undefined ||
    profile === null ||
    user?.accountType !== "company"
  ) {
    return (
      <>
        {chrome}
        <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
          <FormSkeleton label={t("loading")} />
          {error ? (
            <div className="mt-4">
              <FriendlyAlert>{error}</FriendlyAlert>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  const ownerName = [profile.ownerFirstName, profile.ownerLastName].filter(Boolean).join(" ");
  const heading = step === 1 ? t("titleProfile") : step === 2 ? t("titleServices") : t("titleContact");
  const lead = step === 1 ? t("leadProfile") : step === 2 ? t("leadServices") : t("leadContact");

  return (
    <>
      {chrome}
      <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
        <p className="m-0 text-[0.8rem] font-medium text-muted">{t("step", { current: step, total: totalSteps })}</p>
        <h1 className="mt-3 mb-0 text-[1.75rem] font-semibold tracking-[-0.03em] text-ink sm:text-[2rem]">{heading}</h1>
        <p className="mt-2.5 mb-0 max-w-[34rem] text-[0.98rem] leading-6 text-muted">{lead}</p>

        <form className="mt-8" noValidate onSubmit={onSubmit} ref={formRef}>
          <div className={joinClassNames("rounded-2xl border border-brand-border bg-white p-5 sm:p-7", step !== 1 && "hidden")} data-step="1">
            <p className="m-0 text-[0.95rem] font-semibold text-ink">{t("detailsTitle")}</p>
            <p className="mt-1 mb-6 text-[0.88rem] leading-5 text-muted">{t("detailsLead")}</p>

            <label className="block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-name`}>
              {t("companyName")}
              <input
                aria-invalid={invalid("name")}
                className={inputClass("name")}
                defaultValue={profile.name}
                id={`${formId}-name`}
                maxLength={120}
                name="name"
                required
                type="text"
              />
              {fieldMessage("name") ? (
                <span className="mt-1.5 block text-[0.8rem] font-normal text-red-700">{fieldMessage("name")}</span>
              ) : null}
            </label>
            <label className="mt-4 block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-legal-name`}>
              {t("legalName")}
              <input
                aria-invalid={invalid("legalName")}
                className={inputClass("legalName")}
                defaultValue={profile.legalName}
                id={`${formId}-legal-name`}
                maxLength={160}
                name="legalName"
                type="text"
              />
              {fieldMessage("legalName") ? (
                <span className="mt-1.5 block text-[0.8rem] font-normal text-red-700">{fieldMessage("legalName")}</span>
              ) : null}
            </label>
            <label className="mt-4 block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-description`}>
              {t("description")}
              <textarea
                aria-invalid={invalid("description")}
                className={`${inputClass("description")} min-h-32 resize-y`}
                defaultValue={profile.description}
                id={`${formId}-description`}
                maxLength={1000}
                name="description"
                placeholder={t("descriptionPlaceholder")}
                required
              />
              <span className="mt-1.5 block text-[0.8rem] font-normal leading-5 text-muted">{t("descriptionHint")}</span>
              {fieldMessage("description") ? (
                <span className="mt-1 block text-[0.8rem] font-normal text-red-700">{fieldMessage("description")}</span>
              ) : null}
            </label>
          </div>

          <div className={joinClassNames("rounded-2xl border border-brand-border bg-white p-5 sm:p-7", step !== 2 && "hidden")} data-step="2">
            <p className="m-0 text-[0.95rem] font-semibold text-ink">{t("servicesTitle")}</p>
            <p className="mt-1 mb-5 text-[0.88rem] leading-5 text-muted">{t("servicesLead")}</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {profile.serviceOptions.map((service) => (
                <label className="block" key={service}>
                  <input
                    className="peer sr-only"
                    defaultChecked={profile.services.includes(service)}
                    name="services"
                    type="checkbox"
                    value={service}
                  />
                  <span className="flex min-h-12 cursor-pointer items-center rounded-[10px] border border-brand-border px-3.5 py-2.5 text-sm font-medium text-ink transition-colors peer-checked:border-brand peer-checked:bg-brand-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand hover:border-brand/50">
                    {t(`services.${service}`)}
                  </span>
                </label>
              ))}
            </div>
            {fieldMessage("services") ? (
              <p className="mt-3 mb-0 text-[0.8rem] text-red-700">{fieldMessage("services")}</p>
            ) : null}
          </div>

          <div className={joinClassNames("rounded-2xl border border-brand-border bg-white p-5 sm:p-7", step !== 3 && "hidden")} data-step="3">
            <p className="m-0 text-[0.95rem] font-semibold text-ink">{t("contactTitle")}</p>
            <p className="mt-1 mb-6 text-[0.88rem] leading-5 text-muted">{t("contactLead")}</p>
            {ownerName ? (
              <p className="mb-5 rounded-lg bg-brand-soft px-3 py-2 text-sm text-ink">{t("owner", { name: ownerName })}</p>
            ) : null}

            <label className="block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-phone`}>
              {t("phone")}
              <input
                aria-invalid={invalid("phone")}
                autoComplete="tel"
                className={inputClass("phone")}
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
                aria-invalid={invalid("city")}
                autoComplete="address-level2"
                className={inputClass("city")}
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

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-years`}>
                {t("yearsExperience")}
                <input
                  aria-invalid={invalid("yearsExperience")}
                  className={inputClass("yearsExperience")}
                  defaultValue={profile.yearsExperience ?? ""}
                  id={`${formId}-years`}
                  max={100}
                  min={0}
                  name="yearsExperience"
                  type="number"
                />
                {fieldMessage("yearsExperience") ? (
                  <span className="mt-1.5 block text-[0.8rem] font-normal text-red-700">{fieldMessage("yearsExperience")}</span>
                ) : null}
              </label>
              <label className="block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-website`}>
                {t("website")}
                <input
                  aria-invalid={invalid("website")}
                  className={inputClass("website")}
                  defaultValue={profile.website}
                  id={`${formId}-website`}
                  maxLength={2048}
                  name="website"
                  placeholder={t("websitePlaceholder")}
                  type="text"
                />
                {fieldMessage("website") ? (
                  <span className="mt-1.5 block text-[0.8rem] font-normal text-red-700">{fieldMessage("website")}</span>
                ) : null}
              </label>
            </div>

            <label className="mt-4 block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-logo`}>
              {t("logo")}
              <input
                accept={logoTypes.join(",")}
                aria-invalid={invalid("logo")}
                className={`${inputClass("logo")} file:me-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-medium file:text-brand`}
                id={`${formId}-logo`}
                name="logo"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
                }}
                type="file"
              />
              <span className="mt-1.5 block text-[0.8rem] font-normal leading-5 text-muted">{t("logoHint")}</span>
              {fieldMessage("logo") ? (
                <span className="mt-1 block text-[0.8rem] font-normal text-red-700">{fieldMessage("logo")}</span>
              ) : null}
            </label>
            {logoPreviewUrl || profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={t("logoPreviewAlt")}
                className="mt-3 h-16 w-16 rounded-lg border border-brand-border object-contain"
                src={logoPreviewUrl ?? profile.logoUrl ?? undefined}
              />
            ) : null}
          </div>

          {error ? (
            <div className="mt-5">
              <FriendlyAlert>{error}</FriendlyAlert>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
            {step > 1 ? (
              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-brand-border bg-white px-5 text-[0.95rem] font-semibold text-ink transition-colors duration-150 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                onClick={() => goToStep((step - 1) as Step)}
                type="button"
              >
                {t("back")}
              </button>
            ) : null}
            <button
              className="inline-flex min-h-12 flex-[2] items-center justify-center rounded-[10px] bg-brand px-5 text-[0.95rem] font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-brand-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? t("saving") : step === totalSteps ? t("createProfile") : t("continue")}
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

function stepForField(field: string): Step {
  if (field === "services") return 2;
  if (field === "phone" || field === "city" || field === "yearsExperience" || field === "website" || field === "logo") {
    return 3;
  }
  return 1;
}
