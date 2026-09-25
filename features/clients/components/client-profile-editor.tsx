"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/features/shared/components/app-feedback";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { ProfileSectionSkeleton } from "@/features/shared/components/skeletons";
import { useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { mapConvexFailure } from "@/lib/errors";
import { createSubmitLock, focusFirstInvalidField } from "@/lib/forms/submit";
import { joinClassNames } from "@/lib/utils";

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxAvatarBytes = 5 * 1024 * 1024;

type ClientProfile = NonNullable<FunctionReturnType<typeof api.clients.getMyProfile>>;

export function ClientProfileEditor() {
  const t = useTranslations("clientProfileManager");
  const tUx = useTranslations("ux");
  const locale = useLocale();
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "client" && user.onboardingStatus === "completed";
  const profile = useQuery(api.clients.getMyProfile, canLoad ? {} : "skip");
  const updateProfile = useMutation(api.clients.updateMyProfile);
  const requestUpload = useAction(api.clientAvatarMedia.requestAvatarUpload);
  const verifyUpload = useAction(api.clientAvatarMedia.verifyAvatarUpload);
  const router = useRouter();
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const submitLock = useRef(createSubmitLock());
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [editing, setEditing] = useState<"account" | "contact" | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!(user.accountType === "client" && user.onboardingStatus === "completed")) {
      router.replace(workspaceRouteForUser(user));
    }
  }, [router, user]);

  useEffect(
    () => () => {
      if (photoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(photoPreviewUrl);
    },
    [photoPreviewUrl],
  );

  if (!user || !canLoad || profile === undefined) {
    return <ClientProfileEditorSkeleton label={t("loading")} />;
  }

  if (profile === null) {
    return <ClientProfileEditorSkeleton label={t("loading")} />;
  }

  const displayedPhoto = removePhoto ? null : photoPreviewUrl ?? profile.profilePhotoUrl;
  const showInitials = !displayedPhoto;

  function invalid(name: string) {
    return fieldError?.name === name;
  }

  function fieldMessage(name: string) {
    return invalid(name) ? fieldError?.message : null;
  }

  const fieldClass =
    "mt-1.5 w-full rounded-[10px] border border-brand-border bg-white px-3.5 py-3 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/65 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)] disabled:cursor-not-allowed disabled:bg-[#f7f9fb] disabled:text-muted";

  function inputClass(name: string) {
    return joinClassNames(fieldClass, invalid(name) && "border-red-400");
  }

  function selectPhoto(file: File | undefined) {
    if (photoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(photoPreviewUrl);
    if (!file || file.size < 1) {
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      return;
    }
    setRemovePhoto(false);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setFieldError(null);
  }

  function clearPhoto() {
    if (photoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setRemovePhoto(true);
    setError(null);
    setFieldError(null);
  }

  async function uploadPhoto(file: File) {
    if (!imageTypes.includes(file.type) || file.size < 1 || file.size > maxAvatarBytes) {
      throw new Error("INVALID_CLIENT_AVATAR");
    }
    const intent = await requestUpload({ contentType: file.type, size: file.size });
    const response = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("CLIENT_AVATAR_UPLOAD_FAILED");
    await verifyUpload({ uploadToken: intent.uploadToken });
    return intent.uploadToken;
  }

  function setFriendlyFieldError(form: HTMLFormElement, name: string, message: string) {
    setFieldError({ name, message });
    focusFirstInvalidField(form, name);
  }

  function validateForm(form: HTMLFormElement, values: FormData) {
    const firstName = String(values.get("firstName") ?? "").trim();
    const lastName = String(values.get("lastName") ?? "").trim();
    const phone = String(values.get("phone") ?? "").trim();
    const city = String(values.get("city") ?? "").trim();
    if (firstName.length < 1) {
      setFriendlyFieldError(form, "firstName", t("validation.firstName"));
      return false;
    }
    if (lastName.length < 1) {
      setFriendlyFieldError(form, "lastName", t("validation.lastName"));
      return false;
    }
    if (!phone) {
      setFriendlyFieldError(form, "phone", t("validation.phone"));
      return false;
    }
    if (city.length < 2) {
      setFriendlyFieldError(form, "city", t("validation.city"));
      return false;
    }
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitLock.current.tryAcquire() || submitting) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setError(null);
    setFieldError(null);
    if (!validateForm(form, values)) {
      submitLock.current.release();
      return;
    }

    setSubmitting(true);
    try {
      let avatarUploadToken: string | undefined;
      if (photoFile) {
        avatarUploadToken = await uploadPhoto(photoFile);
      }
      await updateProfile({
        firstName: String(values.get("firstName") ?? ""),
        lastName: String(values.get("lastName") ?? ""),
        phone: String(values.get("phone") ?? ""),
        city: String(values.get("city") ?? ""),
        ...(avatarUploadToken ? { avatarUploadToken } : {}),
        ...(removePhoto && !avatarUploadToken ? { removeAvatar: true } : {}),
      });
      if (photoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      setRemovePhoto(false);
      showToast(t("success"), "success");
    } catch (caught) {
      const mapped = mapConvexFailure(caught, tUx);
      if (mapped.field) {
        setFriendlyFieldError(form, mapped.field, mapped.message);
      } else {
        setError(mapped.message);
      }
    } finally {
      setSubmitting(false);
      submitLock.current.release();
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-5 py-8 sm:px-8 sm:py-12 lg:flex-row lg:gap-12 lg:py-14">
      <aside aria-label={t("settingsNav")} className="shrink-0 lg:w-52">
        <h1 className="m-0 text-[1.85rem] font-semibold tracking-[-0.04em] text-ink">{t("settingsTitle")}</h1>
        <nav className="mt-5 flex flex-col gap-1">
          <span
            aria-current="page"
            className="border-l-[3px] border-brand py-1.5 pl-3 text-sm font-semibold text-ink"
          >
            {t("myInfo")}
          </span>
        </nav>
      </aside>

      <div className="mt-8 min-w-0 flex-1 lg:mt-1">
        <h2 className="m-0 text-[1.65rem] font-semibold tracking-[-0.035em] text-ink">{t("title")}</h2>
        <p className="mt-1 mb-6 text-sm text-muted">{t("accountTypeLead")}</p>

        <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit} ref={formRef}>
          {error ? <FriendlyAlert>{error}</FriendlyAlert> : null}

          <SettingsCard
            action={
              <EditButton
                label={t("edit")}
                onClick={() => setEditing(editing === "account" ? null : "account")}
                pressed={editing === "account"}
              />
            }
            title={t("account.title")}
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="relative flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-border bg-brand-soft text-xl font-semibold text-brand-dark">
                {showInitials ? (
                  <span aria-hidden>{profile.initials}</span>
                ) : (
                  <Image
                    alt={t("photo.alt")}
                    className="object-cover"
                    fill
                    sizes="72px"
                    src={displayedPhoto!}
                    unoptimized={displayedPhoto?.startsWith("blob:")}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {editing === "account" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2 flex flex-wrap gap-3">
                      <label className="button button-primary cursor-pointer">
                        {profile.profilePhotoUrl || photoFile ? t("photo.replace") : t("photo.upload")}
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={submitting}
                          name="photo"
                          onChange={(event) => selectPhoto(event.target.files?.[0])}
                          type="file"
                        />
                      </label>
                      {(profile.profilePhotoUrl || photoFile) && !removePhoto ? (
                        <button
                          className="button border border-brand-border bg-white text-ink"
                          disabled={submitting}
                          onClick={clearPhoto}
                          type="button"
                        >
                          {t("photo.remove")}
                        </button>
                      ) : null}
                    </div>
                    {fieldMessage("photo") ? (
                      <p className="sm:col-span-2 m-0 text-xs text-red-700">{fieldMessage("photo")}</p>
                    ) : null}
                    <Field label={t("fields.firstName")} message={fieldMessage("firstName")}>
                      <input
                        aria-invalid={invalid("firstName")}
                        autoComplete="given-name"
                        className={inputClass("firstName")}
                        defaultValue={profile.firstName}
                        disabled={submitting}
                        id={`${formId}-firstName`}
                        maxLength={80}
                        name="firstName"
                        required
                      />
                    </Field>
                    <Field label={t("fields.lastName")} message={fieldMessage("lastName")}>
                      <input
                        aria-invalid={invalid("lastName")}
                        autoComplete="family-name"
                        className={inputClass("lastName")}
                        defaultValue={profile.lastName}
                        disabled={submitting}
                        id={`${formId}-lastName`}
                        maxLength={80}
                        name="lastName"
                        required
                      />
                    </Field>
                  </div>
                ) : (
                  <>
                    <p className="m-0 text-base font-semibold text-ink">
                      {profile.firstName} {profile.lastName}
                    </p>
                    <p className="mt-1 mb-0 text-sm text-muted">{t("account.role")}</p>
                    <p className="mt-1 mb-0 text-sm text-ink">{profile.email}</p>
                    <input name="firstName" type="hidden" value={profile.firstName} />
                    <input name="lastName" type="hidden" value={profile.lastName} />
                  </>
                )}
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            action={
              <EditButton
                label={t("edit")}
                onClick={() => setEditing(editing === "contact" ? null : "contact")}
                pressed={editing === "contact"}
              />
            }
            title={t("contact.title")}
          >
            {editing === "contact" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("fields.phone")} message={fieldMessage("phone")}>
                  <input
                    aria-invalid={invalid("phone")}
                    autoComplete="tel"
                    className={inputClass("phone")}
                    defaultValue={profile.phone}
                    disabled={submitting}
                    id={`${formId}-phone`}
                    inputMode="tel"
                    name="phone"
                    placeholder={t("fields.phonePlaceholder")}
                    required
                    type="tel"
                  />
                </Field>
                <Field label={t("fields.city")} message={fieldMessage("city")}>
                  <input
                    aria-invalid={invalid("city")}
                    autoComplete="address-level2"
                    className={inputClass("city")}
                    defaultValue={profile.city}
                    disabled={submitting}
                    id={`${formId}-city`}
                    maxLength={80}
                    name="city"
                    required
                  />
                </Field>
                <Field label={t("fields.email")}>
                  <input
                    className={fieldClass}
                    disabled
                    id={`${formId}-email`}
                    name="email"
                    readOnly
                    type="email"
                    value={profile.email}
                  />
                  <span className="mt-1.5 block text-xs font-normal text-muted">{t("contact.emailHelp")}</span>
                </Field>
              </div>
            ) : (
              <dl className="m-0 grid gap-3 text-sm">
                <div>
                  <dt className="text-muted">{t("fields.phone")}</dt>
                  <dd className="mt-0.5 mb-0 font-medium text-ink">{profile.phone}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("fields.city")}</dt>
                  <dd className="mt-0.5 mb-0 font-medium text-ink">{profile.city}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("fields.email")}</dt>
                  <dd className="mt-0.5 mb-0 font-medium text-ink">{profile.email}</dd>
                </div>
                <input name="phone" type="hidden" value={profile.phone} />
                <input name="city" type="hidden" value={profile.city} />
              </dl>
            )}
          </SettingsCard>

          <SettingsCard title={t("activity.title")}>
            <dl className="m-0 grid gap-4 sm:grid-cols-3">
              <Stat
                label={t("activity.joined")}
                value={formatMarketplaceDateTime(profile.joinedAt, locale, { dateStyle: "medium" })}
              />
              <Stat label={t("activity.projectsPosted")} value={String(profile.projectsPostedCount)} />
              <Stat
                label={t("activity.projectsCompleted")}
                value={String(profile.projectsCompletedCount)}
              />
            </dl>
          </SettingsCard>

          {editing ? (
            <div className="flex flex-wrap gap-3 pt-1">
              <button className="button button-primary" disabled={submitting} type="submit">
                {submitting ? t("saving") : t("save")}
              </button>
              <button
                className="button border border-brand-border bg-white text-ink"
                disabled={submitting}
                onClick={() => {
                  setEditing(null);
                  setError(null);
                  setFieldError(null);
                  if (photoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(photoPreviewUrl);
                  setPhotoFile(null);
                  setPhotoPreviewUrl(null);
                  setRemovePhoto(false);
                }}
                type="button"
              >
                {t("cancel")}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}

function SettingsCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-brand-border bg-white p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <h3 className="m-0 text-base font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function EditButton({
  label,
  onClick,
  pressed,
}: {
  label: string;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="grid size-9 place-items-center rounded-full border-0 bg-transparent text-brand transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      onClick={onClick}
      type="button"
    >
      <PencilIcon />
    </button>
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
    <label className={joinClassNames("text-sm font-medium text-ink", className)}>
      {label}
      {children}
      {message ? <span className="mt-1.5 block text-xs font-normal text-red-700">{message}</span> : null}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 mb-0 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16">
      <path
        d="M11.2 2.4 13.6 4.8 5.5 12.9 2.8 13.2l.3-2.7 8.1-8.1Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path d="m9.8 3.8 2.4 2.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function ClientProfileEditorSkeleton({ label }: { label: string }) {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1080px] gap-5 px-5 py-10 sm:px-8 sm:py-14"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <ProfileSectionSkeleton />
      <ProfileSectionSkeleton />
      <ProfileSectionSkeleton />
    </main>
  );
}

// Keep the profile type available for tests without exporting unused locals.
export type { ClientProfile };
