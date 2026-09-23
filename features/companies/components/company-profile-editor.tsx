"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/features/shared/components/app-feedback";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { ProfileSectionSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { mapConvexFailure } from "@/lib/errors";
import { createSubmitLock, focusFirstInvalidField } from "@/lib/forms/submit";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxLogoBytes = 5 * 1024 * 1024;
const maxCoverBytes = 10 * 1024 * 1024;

type ProfileManager = FunctionReturnType<typeof api.companies.index.getProfileManager>;
type CompanyService = ProfileManager["serviceOptions"][number];
type ServiceArea = ProfileManager["serviceAreaOptions"][number];
type CompanyLanguage = ProfileManager["languageOptions"][number];
type CompanySize = ProfileManager["companySizeOptions"][number];

export function CompanyProfileEditor() {
  const t = useTranslations("companyProfileManager");
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const profile = useQuery(api.companies.index.getProfileManager, canLoad ? {} : "skip");
  const updateProfile = useMutation(api.companies.index.updatePublicProfile);
  const requestUpload = useAction(api.storage.r2.requestPublicMediaUpload);
  const verifyUpload = useAction(api.storage.r2.verifyPublicMediaUpload);
  const router = useRouter();
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const submitLock = useRef(createSubmitLock());
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.accountType === "client") {
      router.replace(
        user.onboardingStatus === "completed" ? routes.clientDashboard : routes.clientOnboarding,
      );
      return;
    }
    if (user.accountType === "company" && user.onboardingStatus !== "completed") {
      router.replace(routes.companyOnboarding);
    }
  }, [router, user]);

  useEffect(() => () => {
    if (logoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl);
  }, [logoPreviewUrl]);

  useEffect(() => () => {
    if (coverPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(coverPreviewUrl);
  }, [coverPreviewUrl]);

  function invalid(name: string) {
    return fieldError?.name === name;
  }

  function fieldMessage(name: string) {
    return invalid(name) ? fieldError?.message : null;
  }

  const fieldClass =
    "mt-1.5 w-full rounded-[10px] border border-brand-border bg-white px-3.5 py-3 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)] disabled:cursor-not-allowed disabled:bg-[#f7f9fb] disabled:text-muted";

  function inputClass(name: string) {
    return joinClassNames(fieldClass, invalid(name) && "border-red-400");
  }

  function selectImage(
    file: File | undefined,
    setPreview: (value: string | null) => void,
  ) {
    setPreview(file && file.size > 0 ? URL.createObjectURL(file) : null);
    setError(null);
  }

  async function uploadImage(file: File, purpose: "companyLogo" | "companyCover") {
    const maximum = purpose === "companyLogo" ? maxLogoBytes : maxCoverBytes;
    if (!imageTypes.includes(file.type) || file.size < 1 || file.size > maximum) {
      throw new Error(purpose === "companyLogo" ? "INVALID_LOGO" : "INVALID_PUBLIC_MEDIA_UPLOAD");
    }
    const intent = await requestUpload({ purpose, contentType: file.type, size: file.size });
    const response = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
    await verifyUpload({ uploadToken: intent.uploadToken });
    return intent.uploadToken;
  }

  function setFriendlyFieldError(form: HTMLFormElement, name: string, message: string) {
    setFieldError({ name, message });
    focusFirstInvalidField(form, name);
  }

  function validateForm(form: HTMLFormElement, values: FormData) {
    const name = String(values.get("name") ?? "").trim();
    const description = String(values.get("description") ?? "").trim();
    const city = String(values.get("city") ?? "").trim();
    const phone = String(values.get("phone") ?? "").trim();
    if (name.length < 2) {
      setFriendlyFieldError(form, "name", t("validation.name"));
      return false;
    }
    if (description.length < 20 || description.length > 1000) {
      setFriendlyFieldError(form, "description", t("validation.description"));
      return false;
    }
    if (city.length < 2) {
      setFriendlyFieldError(form, "city", t("validation.city"));
      return false;
    }
    if (!phone) {
      setFriendlyFieldError(form, "phone", t("validation.phone"));
      return false;
    }
    for (const [name, key] of [
      ["services", "validation.services"],
      ["serviceAreas", "validation.serviceAreas"],
      ["languages", "validation.languages"],
    ] as const) {
      if (values.getAll(name).length === 0) {
        setFriendlyFieldError(form, name, t(key));
        return false;
      }
    }
    if (!String(values.get("companySize") ?? "")) {
      setFriendlyFieldError(form, "companySize", t("validation.companySize"));
      return false;
    }
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitLock.current.tryAcquire()) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setError(null);
    setFieldError(null);

    if (!validateForm(form, values)) {
      submitLock.current.release();
      return;
    }

    const logoValue = values.get("logo");
    const coverValue = values.get("coverImage");
    const logo = logoValue instanceof File && logoValue.size > 0 ? logoValue : null;
    const cover = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
    const optionalNumber = (name: string) => {
      const value = String(values.get(name) ?? "").trim();
      return value === "" ? undefined : Number(value);
    };

    setSubmitting(true);
    try {
      const [logoUploadToken, coverUploadToken] = await Promise.all([
        logo ? uploadImage(logo, "companyLogo") : Promise.resolve(undefined),
        cover ? uploadImage(cover, "companyCover") : Promise.resolve(undefined),
      ]);
      await updateProfile({
        name: String(values.get("name") ?? ""),
        description: String(values.get("description") ?? ""),
        city: String(values.get("city") ?? ""),
        phone: String(values.get("phone") ?? ""),
        website: String(values.get("website") ?? ""),
        yearsExperience: optionalNumber("yearsExperience"),
        foundedYear: optionalNumber("foundedYear"),
        companySize: String(values.get("companySize")) as CompanySize,
        languages: values.getAll("languages").map(String) as CompanyLanguage[],
        services: values.getAll("services").map(String) as CompanyService[],
        serviceAreas: values.getAll("serviceAreas").map(String) as ServiceArea[],
        logoUploadToken,
        coverUploadToken,
      });
      const logoInput = form.elements.namedItem("logo");
      const coverInput = form.elements.namedItem("coverImage");
      if (logoInput instanceof HTMLInputElement) logoInput.value = "";
      if (coverInput instanceof HTMLInputElement) coverInput.value = "";
      setLogoPreviewUrl(null);
      setCoverPreviewUrl(null);
      showToast(t("success"));
    } catch (caught) {
      const mapped = mapConvexFailure(caught, tUx);
      if (mapped.field) {
        setFieldError({ name: mapped.field, message: mapped.message });
        focusFirstInvalidField(form, mapped.field);
      } else {
        setError(mapped.message);
      }
    } finally {
      setSubmitting(false);
      submitLock.current.release();
    }
  }

  if (!user || !canLoad || profile === undefined) {
    return <CompanyProfileEditorSkeleton label={t("loading")} />;
  }

  const displayedLogo = logoPreviewUrl ?? profile.logoUrl;
  const displayedCover = coverPreviewUrl ?? profile.coverImageUrl;
  const initials = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <main className="mx-auto flex w-full max-w-[980px] flex-1 flex-col px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="m-0 text-xs font-semibold tracking-[0.16em] text-brand uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 mb-0 text-[1.55rem] leading-8 font-semibold tracking-[-0.03em] text-ink sm:text-[1.85rem]">{t("title")}</h1>
          <p className="mt-2 mb-0 max-w-[640px] text-[0.98rem] leading-6 text-muted">{t("lead")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="button border border-brand-border bg-white text-ink active:scale-[0.96]" href={routes.companyDashboard}>{t("back")}</Link>
          {profile.slug ? (
            <Link className="button border border-brand-border bg-white text-ink active:scale-[0.96]" href={{ pathname: "/entreprises/[slug]", params: { slug: profile.slug } }}>{t("viewPublicProfile")}</Link>
          ) : null}
        </div>
      </header>

      <form className="mt-8 grid gap-5" noValidate onSubmit={onSubmit} ref={formRef}>
        <EditorSection lead={t("branding.lead")} title={t("branding.title")}>
          <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div>
              <p className="m-0 text-sm font-medium text-ink">{t("branding.logo")}</p>
              <div className="relative mt-2 grid size-28 place-items-center overflow-hidden rounded-2xl bg-brand-soft text-2xl font-semibold text-brand outline outline-1 outline-black/10">
                {displayedLogo ? <Image alt={t("branding.logoAlt")} className="object-cover" fill sizes="112px" src={displayedLogo} unoptimized={displayedLogo.startsWith("blob:")} /> : <span aria-hidden>{initials}</span>}
              </div>
              <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-brand-border bg-white px-3 text-sm font-semibold text-ink active:scale-[0.96]">
                {profile.logoUrl ? t("branding.replaceLogo") : t("branding.uploadLogo")}
                <input accept={imageTypes.join(",")} className="sr-only" name="logo" onChange={(event) => selectImage(event.currentTarget.files?.[0], setLogoPreviewUrl)} type="file" />
              </label>
              <p className="mt-2 mb-0 text-xs leading-5 text-muted">{t("branding.logoHelp")}</p>
            </div>
            <div>
              <p className="m-0 text-sm font-medium text-ink">{t("branding.cover")}</p>
              <div className="relative mt-2 aspect-[16/6] min-h-36 overflow-hidden rounded-2xl bg-brand-soft outline outline-1 outline-black/10">
                {displayedCover ? <Image alt={t("branding.coverAlt")} className="object-cover" fill sizes="(max-width: 640px) 100vw, 720px" src={displayedCover} unoptimized={displayedCover.startsWith("blob:")} /> : <div className="absolute inset-0 bg-[linear-gradient(135deg,rgb(5_79_132/0.14),rgb(5_79_132/0.03))]" />}
              </div>
              <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-brand-border bg-white px-3 text-sm font-semibold text-ink active:scale-[0.96]">
                {profile.coverImageUrl ? t("branding.replaceCover") : t("branding.uploadCover")}
                <input accept={imageTypes.join(",")} className="sr-only" name="coverImage" onChange={(event) => selectImage(event.currentTarget.files?.[0], setCoverPreviewUrl)} type="file" />
              </label>
              <p className="mt-2 mb-0 text-xs leading-5 text-muted">{t("branding.coverHelp")}</p>
            </div>
          </div>
        </EditorSection>

        <EditorSection lead={t("information.lead")} title={t("information.title")}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("fields.name")} message={fieldMessage("name")}>
              <input aria-invalid={invalid("name")} className={inputClass("name")} defaultValue={profile.name} id={`${formId}-name`} maxLength={120} minLength={2} name="name" required />
            </Field>
            <Field label={t("fields.city")} message={fieldMessage("city")}>
              <input aria-invalid={invalid("city")} className={inputClass("city")} defaultValue={profile.city} id={`${formId}-city`} maxLength={80} minLength={2} name="city" required />
            </Field>
            <Field className="sm:col-span-2" label={t("fields.description")} message={fieldMessage("description")}>
              <textarea aria-invalid={invalid("description")} className={`${inputClass("description")} min-h-32 resize-y`} defaultValue={profile.description} id={`${formId}-description`} maxLength={1000} minLength={20} name="description" required />
            </Field>
            <Field label={t("fields.website")} message={fieldMessage("website")}>
              <input aria-invalid={invalid("website")} autoComplete="url" className={inputClass("website")} defaultValue={profile.website} id={`${formId}-website`} name="website" placeholder={t("fields.websitePlaceholder")} type="url" />
            </Field>
            <Field label={t("fields.phone")} message={fieldMessage("phone")}>
              <input aria-invalid={invalid("phone")} autoComplete="tel" className={inputClass("phone")} defaultValue={profile.phone} id={`${formId}-phone`} inputMode="tel" name="phone" placeholder={t("fields.phonePlaceholder")} required type="tel" />
            </Field>
          </div>
        </EditorSection>

        <EditorSection lead={t("experience.lead")} title={t("experience.title")}>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label={t("fields.yearsExperience")} message={fieldMessage("yearsExperience")}>
              <input aria-invalid={invalid("yearsExperience")} className={inputClass("yearsExperience")} defaultValue={profile.yearsExperience ?? ""} id={`${formId}-years`} max="100" min="0" name="yearsExperience" step="1" type="number" />
            </Field>
            <Field label={t("fields.foundedYear")} message={fieldMessage("foundedYear")}>
              <input aria-invalid={invalid("foundedYear")} className={inputClass("foundedYear")} defaultValue={profile.foundedYear ?? ""} id={`${formId}-founded`} max={new Date().getFullYear()} min="1800" name="foundedYear" step="1" type="number" />
            </Field>
            <Field label={t("fields.companySize")} message={fieldMessage("companySize")}>
              <select aria-invalid={invalid("companySize")} className={inputClass("companySize")} defaultValue={profile.companySize ?? ""} id={`${formId}-size`} name="companySize" required>
                <option disabled value="">{t("fields.companySizePlaceholder")}</option>
                {profile.companySizeOptions.map((size) => <option key={size} value={size}>{t(`companySize.${size}`)}</option>)}
              </select>
            </Field>
          </div>
          <CheckboxGroup error={fieldMessage("languages")} label={t("fields.languages")}>
            {profile.languageOptions.map((language) => (
              <Checkbox defaultChecked={profile.languages.includes(language)} key={language} label={t(`languages.${language}`)} name="languages" value={language} />
            ))}
          </CheckboxGroup>
        </EditorSection>

        <EditorSection lead={t("services.lead")} title={t("services.title")}>
          <CheckboxGroup error={fieldMessage("services")} label={t("fields.services")}>
            {profile.serviceOptions.map((service) => (
              <Checkbox defaultChecked={profile.services.includes(service)} key={service} label={t(`serviceOptions.${service}`)} name="services" value={service} />
            ))}
          </CheckboxGroup>
        </EditorSection>

        <EditorSection lead={t("serviceAreas.lead")} title={t("serviceAreas.title")}>
          <CheckboxGroup error={fieldMessage("serviceAreas")} label={t("fields.serviceAreas")}>
            {profile.serviceAreaOptions.map((area) => (
              <Checkbox defaultChecked={profile.serviceAreas.includes(area)} key={area} label={t(`serviceAreaOptions.${area}`)} name="serviceAreas" value={area} />
            ))}
          </CheckboxGroup>
        </EditorSection>

        <EditorSection lead={t("legal.lead")} title={t("legal.title")}>
          <FriendlyAlert tone="info">{t("legal.notice")}</FriendlyAlert>
          <p className="mt-4 mb-0 text-xs font-semibold tracking-[0.08em] text-brand uppercase">{t(`verificationStatus.${profile.legal.verificationStatus}`)}</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {([
              ["legalName", profile.legal.legalName],
              ["ice", profile.legal.ice],
              ["rcNumber", profile.legal.rcNumber],
              ["legalRepresentative", profile.legal.legalRepresentative],
              ["legalPhone", profile.legal.phone],
              ["address", profile.legal.address],
            ] as const).map(([key, value]) => (
              <label className="text-sm font-medium text-ink" key={key}>
                {t(`legal.fields.${key}`)}
                <input aria-readonly="true" className={fieldClass} readOnly value={value || t("legal.notProvided")} />
              </label>
            ))}
          </div>
          <div className="mt-6 border-t border-brand-border pt-5">
            <h3 className="m-0 text-sm font-semibold text-ink">{t("legal.documentsLabel")}</h3>
            {profile.legal.documents.length > 0 ? (
              <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2">
                {profile.legal.documents.map((document) => (
                  <li className="rounded-xl bg-[#f7f9fb] px-3.5 py-3 text-sm text-ink" key={`${document.documentType}-${document.fileName}`}>
                    <span className="block text-xs font-semibold tracking-[0.04em] text-brand uppercase">{t(`legal.documentTypes.${document.documentType}`)}</span>
                    <span className="mt-1 block break-all text-muted">{document.fileName}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 mb-0 text-sm text-muted">{t("legal.noDocuments")}</p>}
          </div>
        </EditorSection>

        {error ? <FriendlyAlert>{error}</FriendlyAlert> : null}
        <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-3 rounded-2xl border border-brand-border bg-white/95 p-3 shadow-[0_12px_36px_rgb(23_61_99/0.12)] backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          <Link className="button border border-brand-border bg-white text-ink" href={routes.companyDashboard}>{t("cancel")}</Link>
          <button className="button button-primary disabled:cursor-wait disabled:opacity-60" disabled={submitting} type="submit">{submitting ? t("saving") : t("save")}</button>
        </div>
      </form>
    </main>
  );
}

function EditorSection({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-border bg-white p-5 shadow-[0_1px_2px_rgb(23_61_99/0.04)] sm:p-7">
      <h2 className="m-0 text-lg leading-6 font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <p className="mt-1.5 mb-6 text-sm leading-6 text-muted">{lead}</p>
      {children}
    </section>
  );
}

function Field({ label, message, className, children }: { label: string; message?: string | null; className?: string; children: ReactNode }) {
  return (
    <label className={joinClassNames("text-sm font-medium text-ink", className)}>
      {label}
      {children}
      {message ? <span className="mt-1.5 block text-xs font-normal text-red-700">{message}</span> : null}
    </label>
  );
}

function CheckboxGroup({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <fieldset className="mt-6 border-0 p-0">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className={joinClassNames("mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3", error && "rounded-xl ring-2 ring-red-300 ring-offset-2")}>{children}</div>
      {error ? <p className="mt-2 mb-0 text-xs text-red-700">{error}</p> : null}
    </fieldset>
  );
}

function Checkbox({ name, value, label, defaultChecked }: { name: string; value: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-brand-border px-3.5 text-sm text-ink transition-[border-color,background-color] duration-150 hover:border-brand/40 hover:bg-brand-soft/40">
      <input className="size-4 accent-brand" defaultChecked={defaultChecked} name={name} type="checkbox" value={value} />
      <span>{label}</span>
    </label>
  );
}

export function CompanyProfileEditorSkeleton({ label }: { label: string }) {
  return (
    <main aria-busy="true" aria-live="polite" className="mx-auto grid w-full max-w-[980px] gap-5 px-5 py-10 sm:px-8 sm:py-14" role="status">
      <span className="sr-only">{label}</span>
      <ProfileSectionSkeleton />
      <ProfileSectionSkeleton />
      <ProfileSectionSkeleton />
    </main>
  );
}
