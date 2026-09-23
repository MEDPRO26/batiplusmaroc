"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ExternalLink, MapPin, Pencil } from "lucide-react";
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
    "mt-1.5 w-full rounded-[10px] border border-[#d5d9dc] bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)] disabled:cursor-not-allowed disabled:bg-[#f7f9fb] disabled:text-muted";

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
  const isVerified = profile.legal.verificationStatus === "verified";

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#f2f4f5]">
      <form className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8" noValidate onSubmit={onSubmit} ref={formRef}>
        <div className="overflow-hidden rounded-2xl border border-[#d5d9dc] bg-white shadow-[0_1px_2px_rgb(23_61_99/0.04)]">
          {/* Cover */}
          <div className="relative aspect-[3.2/1] min-h-[140px] bg-[#e8eef3] sm:min-h-[180px]">
            {displayedCover ? (
              <Image
                alt={t("branding.coverAlt")}
                className="object-cover"
                fill
                sizes="(max-width: 1120px) 100vw, 1120px"
                src={displayedCover}
                unoptimized={displayedCover.startsWith("blob:")}
              />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgb(5_79_132/0.18),rgb(5_79_132/0.04))]" />
            )}
            <label className="absolute right-3 bottom-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3.5 text-sm font-semibold text-ink shadow-sm backdrop-blur transition-transform duration-150 active:scale-[0.96] sm:right-5 sm:bottom-4">
              <Pencil aria-hidden className="size-3.5 text-brand" strokeWidth={2} />
              {profile.coverImageUrl ? t("branding.replaceCover") : t("branding.uploadCover")}
              <input
                accept={imageTypes.join(",")}
                className="sr-only"
                name="coverImage"
                onChange={(event) => selectImage(event.currentTarget.files?.[0], setCoverPreviewUrl)}
                type="file"
              />
            </label>
          </div>

          {/* Identity header */}
          <div className="relative border-b border-[#e4e8eb] px-4 pt-0 pb-5 sm:px-6 sm:pb-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
                <div className="-mt-10 shrink-0 sm:-mt-12">
                  <div className="relative grid size-[88px] place-items-center overflow-hidden rounded-full border-[3px] border-white bg-brand-soft text-2xl font-semibold text-brand shadow-[0_2px_8px_rgb(10_25_38/0.12)] sm:size-[112px]">
                    {displayedLogo ? (
                      <Image
                        alt={t("branding.logoAlt")}
                        className="object-cover"
                        fill
                        sizes="112px"
                        src={displayedLogo}
                        unoptimized={displayedLogo.startsWith("blob:")}
                      />
                    ) : (
                      <span aria-hidden>{initials || "?"}</span>
                    )}
                  </div>
                  <label className="mt-2 flex cursor-pointer items-center justify-center gap-1 text-xs font-semibold text-brand hover:underline">
                    <Pencil aria-hidden className="size-3" strokeWidth={2} />
                    {profile.logoUrl ? t("branding.replaceLogo") : t("branding.uploadLogo")}
                    <input
                      accept={imageTypes.join(",")}
                      className="sr-only"
                      name="logo"
                      onChange={(event) => selectImage(event.currentTarget.files?.[0], setLogoPreviewUrl)}
                      type="file"
                    />
                  </label>
                </div>

                <div className="min-w-0 flex-1 pt-3 sm:pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`${formId}-name`}>{t("fields.name")}</label>
                    <input
                      aria-invalid={invalid("name")}
                      className={joinClassNames(
                        "m-0 w-full max-w-[520px] border-0 bg-transparent p-0 text-[1.45rem] leading-8 font-semibold tracking-[-0.03em] text-ink outline-none focus:ring-0 sm:text-[1.75rem] sm:leading-9",
                        invalid("name") && "text-red-700",
                      )}
                      defaultValue={profile.name}
                      id={`${formId}-name`}
                      maxLength={120}
                      minLength={2}
                      name="name"
                      required
                    />
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
                        <Check aria-hidden className="size-3.5" strokeWidth={2.4} />
                        {t("badge.verified")}
                      </span>
                    ) : null}
                  </div>
                  {fieldMessage("name") ? <p className="mt-1 mb-0 text-xs text-red-700">{fieldMessage("name")}</p> : null}

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                    <MapPin aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
                    <label className="sr-only" htmlFor={`${formId}-city`}>{t("fields.city")}</label>
                    <input
                      aria-invalid={invalid("city")}
                      className={joinClassNames(
                        "min-w-[8rem] border-0 bg-transparent p-0 text-sm text-muted outline-none focus:text-ink",
                        invalid("city") && "text-red-700",
                      )}
                      id={`${formId}-city`}
                      maxLength={80}
                      minLength={2}
                      name="city"
                      placeholder={t("fields.city")}
                      required
                      defaultValue={profile.city}
                    />
                  </div>
                  {fieldMessage("city") ? <p className="mt-1 mb-0 text-xs text-red-700">{fieldMessage("city")}</p> : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:justify-end">
                {profile.slug ? (
                  <Link
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-brand bg-white px-4 text-sm font-semibold text-brand transition-transform duration-150 hover:bg-brand-soft active:scale-[0.96]"
                    href={{ pathname: "/entreprises/[slug]", params: { slug: profile.slug } }}
                  >
                    {t("viewPublicProfile")}
                    <ExternalLink aria-hidden className="size-3.5" strokeWidth={1.8} />
                  </Link>
                ) : null}
                <Link
                  className="inline-flex min-h-10 items-center rounded-full border border-[#c5c8cb] bg-white px-4 text-sm font-semibold text-ink transition-transform duration-150 hover:border-[#9aa3ab] active:scale-[0.96]"
                  href={routes.companyDashboard}
                >
                  {t("back")}
                </Link>
              </div>
            </div>
          </div>

          {/* Two-column body */}
          <div className="grid lg:grid-cols-[minmax(240px,28%)_minmax(0,1fr)]">
            <aside className="border-b border-[#e4e8eb] px-4 py-6 lg:border-r lg:border-b-0 sm:px-6 lg:px-6 lg:py-7">
              <SidebarSection title={t("sidebar.stats")}>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <StatBox
                    label={t("sidebar.years")}
                    value={
                      <input
                        aria-invalid={invalid("yearsExperience")}
                        aria-label={t("fields.yearsExperience")}
                        className="w-full border-0 bg-transparent p-0 text-center text-base font-semibold text-ink outline-none"
                        defaultValue={profile.yearsExperience ?? ""}
                        id={`${formId}-years`}
                        max="100"
                        min="0"
                        name="yearsExperience"
                        placeholder="—"
                        step="1"
                        type="number"
                      />
                    }
                  />
                  <StatBox
                    label={t("sidebar.founded")}
                    value={
                      <input
                        aria-invalid={invalid("foundedYear")}
                        aria-label={t("fields.foundedYear")}
                        className="w-full border-0 bg-transparent p-0 text-center text-base font-semibold text-ink outline-none"
                        defaultValue={profile.foundedYear ?? ""}
                        id={`${formId}-founded`}
                        max={new Date().getFullYear()}
                        min="1800"
                        name="foundedYear"
                        placeholder="—"
                        step="1"
                        type="number"
                      />
                    }
                  />
                  <StatBox
                    label={t("sidebar.team")}
                    value={
                      <select
                        aria-invalid={invalid("companySize")}
                        aria-label={t("fields.companySize")}
                        className="w-full max-w-full border-0 bg-transparent p-0 text-center text-[0.7rem] font-semibold text-ink outline-none"
                        defaultValue={profile.companySize ?? ""}
                        id={`${formId}-size`}
                        name="companySize"
                        required
                      >
                        <option disabled value="">{t("fields.companySizePlaceholder")}</option>
                        {profile.companySizeOptions.map((size) => (
                          <option key={size} value={size}>{t(`companySize.${size}`)}</option>
                        ))}
                      </select>
                    }
                  />
                </div>
                {fieldMessage("companySize") ? <p className="mt-2 mb-0 text-xs text-red-700">{fieldMessage("companySize")}</p> : null}
              </SidebarSection>

              <SidebarSection title={t("fields.languages")}>
                <CheckboxGroup compact error={fieldMessage("languages")} legend={t("fields.languages")}>
                  {profile.languageOptions.map((language) => (
                    <Checkbox
                      defaultChecked={profile.languages.includes(language)}
                      key={language}
                      label={t(`languages.${language}`)}
                      name="languages"
                      value={language}
                    />
                  ))}
                </CheckboxGroup>
              </SidebarSection>

              <SidebarSection title={t("sidebar.contact")}>
                <Field label={t("fields.phone")} message={fieldMessage("phone")}>
                  <input
                    aria-invalid={invalid("phone")}
                    autoComplete="tel"
                    className={inputClass("phone")}
                    defaultValue={profile.phone}
                    id={`${formId}-phone`}
                    inputMode="tel"
                    name="phone"
                    placeholder={t("fields.phonePlaceholder")}
                    required
                    type="tel"
                  />
                </Field>
                <Field className="mt-3" label={t("fields.website")} message={fieldMessage("website")}>
                  <input
                    aria-invalid={invalid("website")}
                    autoComplete="url"
                    className={inputClass("website")}
                    defaultValue={profile.website}
                    id={`${formId}-website`}
                    name="website"
                    placeholder={t("fields.websitePlaceholder")}
                    type="url"
                  />
                </Field>
              </SidebarSection>

              <SidebarSection title={t("sidebar.verifications")}>
                <p className="m-0 flex items-center gap-2 text-sm text-ink">
                  {isVerified ? (
                    <Check aria-hidden className="size-4 text-brand" strokeWidth={2.4} />
                  ) : (
                    <span aria-hidden className="grid size-4 place-items-center rounded-full border border-[#c5c8cb] text-[0.6rem] text-muted">!</span>
                  )}
                  <span className="font-medium">{t(`verificationStatus.${profile.legal.verificationStatus}`)}</span>
                </p>
                {!isVerified ? (
                  <Link className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand hover:underline" href={routes.companyVerification}>
                    {t("sidebar.verifyAction")}
                  </Link>
                ) : null}
              </SidebarSection>
            </aside>

            <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
              <ProfileSection lead={t("overview.lead")} title={t("overview.title")}>
                <Field label={t("fields.description")} message={fieldMessage("description")}>
                  <textarea
                    aria-invalid={invalid("description")}
                    className={`${inputClass("description")} min-h-36 resize-y leading-7`}
                    defaultValue={profile.description}
                    id={`${formId}-description`}
                    maxLength={1000}
                    minLength={20}
                    name="description"
                    required
                  />
                </Field>
              </ProfileSection>

              <ProfileSection lead={t("services.lead")} title={t("services.title")}>
                <CheckboxGroup error={fieldMessage("services")} legend={t("fields.services")}>
                  {profile.serviceOptions.map((service) => (
                    <Checkbox
                      defaultChecked={profile.services.includes(service)}
                      key={service}
                      label={t(`serviceOptions.${service}`)}
                      name="services"
                      value={service}
                    />
                  ))}
                </CheckboxGroup>
              </ProfileSection>

              <ProfileSection lead={t("serviceAreas.lead")} title={t("serviceAreas.title")}>
                <CheckboxGroup error={fieldMessage("serviceAreas")} legend={t("fields.serviceAreas")}>
                  {profile.serviceAreaOptions.map((area) => (
                    <Checkbox
                      defaultChecked={profile.serviceAreas.includes(area)}
                      key={area}
                      label={t(`serviceAreaOptions.${area}`)}
                      name="serviceAreas"
                      value={area}
                    />
                  ))}
                </CheckboxGroup>
              </ProfileSection>

              <ProfileSection lead={t("portfolio.lead")} title={t("portfolio.title")}>
                <div className="rounded-xl border border-[#e4e8eb] bg-[#fafbfc] px-4 py-5 sm:px-5">
                  <p className="m-0 text-sm leading-6 text-muted">{t("portfolio.body")}</p>
                  <Link
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-brand bg-white px-5 text-sm font-semibold text-brand transition-transform duration-150 hover:bg-brand-soft active:scale-[0.96]"
                    href={routes.companyPortfolio}
                  >
                    {t("portfolio.manage")}
                  </Link>
                </div>
              </ProfileSection>

              <ProfileSection lead={t("legal.lead")} title={t("legal.title")}>
                <FriendlyAlert tone="info">{t("legal.notice")}</FriendlyAlert>
                <p className="mt-4 mb-0 text-xs font-semibold tracking-[0.08em] text-brand uppercase">
                  {t(`verificationStatus.${profile.legal.verificationStatus}`)}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                <div className="mt-6 border-t border-[#e4e8eb] pt-5">
                  <h3 className="m-0 text-sm font-semibold text-ink">{t("legal.documentsLabel")}</h3>
                  {profile.legal.documents.length > 0 ? (
                    <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2">
                      {profile.legal.documents.map((document) => (
                        <li className="rounded-xl bg-[#f7f9fb] px-3.5 py-3 text-sm text-ink" key={`${document.documentType}-${document.fileName}`}>
                          <span className="block text-xs font-semibold tracking-[0.04em] text-brand uppercase">
                            {t(`legal.documentTypes.${document.documentType}`)}
                          </span>
                          <span className="mt-1 block break-all text-muted">{document.fileName}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 mb-0 text-sm text-muted">{t("legal.noDocuments")}</p>
                  )}
                </div>
              </ProfileSection>
            </div>
          </div>
        </div>

        {error ? <div className="mt-4"><FriendlyAlert>{error}</FriendlyAlert></div> : null}

        <div className="sticky bottom-3 z-10 mt-5 flex flex-col-reverse gap-3 rounded-2xl border border-[#d5d9dc] bg-white/95 p-3 shadow-[0_12px_36px_rgb(23_61_99/0.12)] backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          <Link className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-ink hover:underline" href={routes.companyDashboard}>
            {t("cancel")}
          </Link>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.96] disabled:cursor-wait disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? t("saving") : t("save")}
          </button>
        </div>
      </form>
    </main>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#e4e8eb] py-5 first:pt-0 last:border-b-0 last:pb-0">
      <h2 className="m-0 text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ProfileSection({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#e4e8eb] py-7 first:pt-0 last:border-b-0 last:pb-0">
      <h2 className="m-0 text-[1.15rem] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <p className="mt-1.5 mb-5 text-sm leading-6 text-muted">{lead}</p>
      {children}
    </section>
  );
}

function StatBox({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-[#f7f9fb] px-1.5 py-3">
      <div className="min-h-6">{value}</div>
      <p className="mt-1 mb-0 text-[0.65rem] leading-4 font-medium tracking-[0.02em] text-muted uppercase">{label}</p>
    </div>
  );
}

function Field({
  label,
  message,
  className,
  children,
}: {
  label: string;
  message?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={joinClassNames("block text-sm font-medium text-ink", className)}>
      {label}
      {children}
      {message ? <span className="mt-1.5 block text-xs font-normal text-red-700">{message}</span> : null}
    </label>
  );
}

function CheckboxGroup({
  error,
  children,
  compact = false,
  legend,
}: {
  error?: string | null;
  children: ReactNode;
  compact?: boolean;
  legend: string;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      <div
        className={joinClassNames(
          "grid gap-2",
          compact ? "grid-cols-1" : "sm:grid-cols-2",
          error && "rounded-xl ring-2 ring-red-300 ring-offset-2",
        )}
      >
        {children}
      </div>
      {error ? <p className="mt-2 mb-0 text-xs text-red-700">{error}</p> : null}
    </fieldset>
  );
}

function Checkbox({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-full border border-[#d5d9dc] bg-white px-3.5 text-sm text-ink transition-[border-color,background-color] duration-150 hover:border-brand/40 hover:bg-brand-soft/30 has-[:checked]:border-brand has-[:checked]:bg-brand-soft/50">
      <input className="size-3.5 accent-brand" defaultChecked={defaultChecked} name={name} type="checkbox" value={value} />
      <span>{label}</span>
    </label>
  );
}

export function CompanyProfileEditorSkeleton({ label }: { label: string }) {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-[calc(100dvh-4.5rem)] bg-[#f2f4f5]"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div className="mx-auto grid w-full max-w-[1120px] gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-2xl border border-[#d5d9dc] bg-white">
          <div className="aspect-[3.2/1] min-h-[140px] animate-pulse bg-[#e6eef3]" />
          <div className="grid gap-5 p-6 lg:grid-cols-[28%_1fr]">
            <ProfileSectionSkeleton />
            <ProfileSectionSkeleton />
          </div>
        </div>
      </div>
    </main>
  );
}
