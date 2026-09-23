"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { OnboardingChrome } from "@/features/auth/components/onboarding-chrome";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { FormSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { mapConvexFailure } from "@/lib/errors";
import { focusFirstInvalidField } from "@/lib/forms/submit";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

const documentTypes = ["rc", "ice", "insurance", "other"] as const;
type DocumentType = (typeof documentTypes)[number];
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maxDocumentSize = 10 * 1024 * 1024;
const totalSteps = 2;
type Step = 1 | 2;

export function CompanyVerificationForm() {
  const t = useTranslations("auth.companyVerification");
  const tUx = useTranslations("ux");
  const router = useRouter();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const verification = useQuery(api.companyVerification.index.getVerificationForm, canLoad ? {} : "skip");
  const generateUploadUrl = useMutation(api.companyVerification.index.generateDocumentUploadUrl);
  const submitVerification = useMutation(api.companyVerification.index.submitVerification);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileNames, setFileNames] = useState<Partial<Record<DocumentType, string>>>({});

  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user && !(user.accountType === "company" && user.onboardingStatus === "completed")) {
      router.replace(workspaceRouteForUser(user));
    }
  }, [router, user]);

  useEffect(() => {
    if (!verification) return;
    window.scrollTo({ top: 0, behavior: "auto" });
    const form = formRef.current;
    const first = form?.querySelector<HTMLElement>(`[data-step="${step}"] input, [data-step="${step}"] textarea`);
    first?.focus();
  }, [step, verification]);

  const chrome = (
    <OnboardingChrome
      progressLabel={t("step", { current: step, total: totalSteps })}
      progressValue={verification?.status === "pending" || verification?.status === "verified" ? 100 : Math.round((step / totalSteps) * 100)}
    />
  );

  if (!canLoad || verification === undefined) {
    return (
      <>
        {chrome}
        <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
          <FormSkeleton label={tUx("loading.form")} />
        </section>
      </>
    );
  }

  if (verification.status === "pending" || verification.status === "verified") {
    const isVerified = verification.status === "verified";
    return (
      <>
        {chrome}
        <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
          <div className="step-enter rounded-2xl border border-brand-border bg-white p-6 sm:p-8">
            <StatusGlyph verified={isVerified} />
            <p className="mt-5 mb-0 text-[0.8rem] font-semibold tracking-[0.04em] text-brand uppercase">
              {t(`status.${verification.status}`)}
            </p>
            <h1 className="mt-2 mb-0 text-[1.75rem] font-semibold tracking-[-0.03em] text-ink sm:text-[2rem]">
              {t(`${verification.status}.title`)}
            </h1>
            <p className="mt-3 mb-0 text-[0.98rem] leading-6 text-muted">{t(`${verification.status}.lead`)}</p>
            <Link
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-brand px-5 text-[0.95rem] font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-brand-hover active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              href={routes.companyDashboard}
            >
              {t("backToWorkspace")}
            </Link>
          </div>
        </section>
      </>
    );
  }

  function invalid(name: string) {
    return fieldError?.name === name;
  }

  const fieldClass =
    "mt-1.5 min-h-12 w-full rounded-[10px] border border-brand-border bg-white px-3.5 py-2.5 text-[0.95rem] text-ink outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted/65 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";

  function inputClass(name: string) {
    return joinClassNames(fieldClass, invalid(name) && "border-red-400");
  }

  function goToStep(next: Step) {
    setError(null);
    setFieldError(null);
    setStep(next);
  }

  function validateLegal(form: HTMLFormElement) {
    const formData = new FormData(form);
    const required = ["legalName", "ice", "rcNumber", "legalRepresentative", "phone", "address"] as const;
    for (const name of required) {
      const value = String(formData.get(name) ?? "").trim();
      if (!value) {
        setFieldError({ name, message: t("validation.required") });
        focusFirstInvalidField(form, name);
        return false;
      }
    }
    const ice = String(formData.get("ice") ?? "").replace(/\s/g, "");
    if (!/^\d{15}$/.test(ice)) {
      setFieldError({ name: "ice", message: t("validation.ice") });
      focusFirstInvalidField(form, "ice");
      return false;
    }
    return true;
  }

  function validateFiles(form: HTMLFormElement) {
    for (const type of documentTypes) {
      const input = form.elements.namedItem(`document-${type}`);
      const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
      if (file && (!allowedMimeTypes.has(file.type) || file.size > maxDocumentSize)) {
        setFieldError({ name: `document-${type}`, message: t("validation.document") });
        setError(t("validation.document"));
        if (input instanceof HTMLInputElement) input.focus();
        return false;
      }
    }
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    setError(null);
    setFieldError(null);

    if (step === 1) {
      if (validateLegal(form)) goToStep(2);
      return;
    }
    if (!validateLegal(form)) {
      goToStep(1);
      return;
    }
    if (!validateFiles(form)) return;

    const formData = new FormData(form);
    setSubmitting(true);
    try {
      const selectedFiles = documentTypes.flatMap((documentType) => {
        const value = formData.get(`document-${documentType}`);
        return value instanceof File && value.size > 0 ? [{ documentType, file: value }] : [];
      });
      const documents = await Promise.all(
        selectedFiles.map(async ({ documentType, file }) => {
          const { uploadUrl, uploadToken } = await generateUploadUrl({ documentType });
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!response.ok) throw new Error("DOCUMENT_UPLOAD_FAILED");
          const payload = (await response.json()) as { storageId?: string };
          if (!payload.storageId) throw new Error("DOCUMENT_UPLOAD_FAILED");
          return {
            documentType,
            fileName: file.name,
            uploadToken,
            storageId: payload.storageId as never,
          };
        }),
      );

      await submitVerification({
        legalName: String(formData.get("legalName") ?? ""),
        ice: String(formData.get("ice") ?? ""),
        rcNumber: String(formData.get("rcNumber") ?? ""),
        legalRepresentative: String(formData.get("legalRepresentative") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        address: String(formData.get("address") ?? ""),
        documents,
      });
      router.replace(routes.companyDashboard);
    } catch (caught) {
      const mapped = mapConvexFailure(caught, tUx);
      if (mapped.field) {
        const fieldStep = mapped.field.startsWith("document-") ? 2 : 1;
        if (fieldStep !== step) setStep(fieldStep as Step);
        setFieldError({ name: mapped.field, message: mapped.message });
      } else {
        setError(mapped.message);
      }
      focusFirstInvalidField(form, mapped.field);
      setSubmitting(false);
    }
  }

  const heading = step === 1 ? t("titleLegal") : t("titleDocuments");
  const lead = step === 1 ? t("leadLegal") : t("leadDocuments");
  const legalFields = [
    { name: "legalName" as const, autoComplete: "organization", type: "text", hint: null, inputMode: undefined },
    { name: "ice" as const, autoComplete: "off", type: "text", hint: t("iceHint"), inputMode: "numeric" as const },
    { name: "rcNumber" as const, autoComplete: "off", type: "text", hint: null, inputMode: undefined },
    { name: "legalRepresentative" as const, autoComplete: "name", type: "text", hint: null, inputMode: undefined },
    { name: "phone" as const, autoComplete: "tel", type: "tel", hint: t("phoneHint"), inputMode: "tel" as const },
  ];

  return (
    <>
      {chrome}
      <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-10 sm:px-6 sm:py-14">
        <p className="step-enter m-0 text-[0.8rem] font-medium text-muted">
          {t("step", { current: step, total: totalSteps })}
        </p>
        <h1 className="step-enter step-enter-delay mt-3 mb-0 text-[1.75rem] font-semibold tracking-[-0.03em] text-ink sm:text-[2rem]">
          {heading}
        </h1>
        <p className="step-enter step-enter-delay mt-2.5 mb-0 max-w-[34rem] text-[0.98rem] leading-6 text-muted">{lead}</p>
        {verification.status === "rejected" ? (
          <p className="mt-4 mb-0 rounded-[10px] bg-red-50 px-3.5 py-3 text-[0.88rem] leading-5 text-red-800" role="status">
            {t("rejectedLead")}
          </p>
        ) : null}

        <form className="mt-8" noValidate onSubmit={onSubmit} ref={formRef}>
          <div
            className={joinClassNames(
              "rounded-2xl border border-brand-border bg-white p-5 sm:p-7",
              step !== 1 && "hidden",
            )}
            data-step="1"
          >
            <p className="m-0 text-[0.95rem] font-semibold text-ink">{t("legalSection")}</p>
            <p className="mt-1 mb-6 text-[0.88rem] leading-5 text-muted">{t("legalSectionLead")}</p>

            {legalFields.map((field) => (
              <label
                className="mt-4 block text-[0.88rem] font-medium text-ink first:mt-0"
                htmlFor={`${formId}-${field.name}`}
                key={field.name}
              >
                <span>
                  {t(`fields.${field.name}`)}
                  <span className="text-brand"> *</span>
                </span>
                <input
                  aria-describedby={field.hint ? `${formId}-${field.name}-hint` : undefined}
                  aria-invalid={invalid(field.name)}
                  autoComplete={field.autoComplete}
                  className={inputClass(field.name)}
                  defaultValue={verification[field.name]}
                  id={`${formId}-${field.name}`}
                  inputMode={field.inputMode}
                  maxLength={field.name === "ice" ? 15 : 160}
                  name={field.name}
                  required
                  type={field.type}
                />
                {field.hint ? (
                  <span className="mt-1.5 block text-[0.8rem] font-normal leading-5 text-muted" id={`${formId}-${field.name}-hint`}>
                    {field.hint}
                  </span>
                ) : null}
                {invalid(field.name) ? (
                  <span className="mt-1.5 block text-[0.8rem] font-normal text-red-700" role="alert">
                    {fieldError?.message}
                  </span>
                ) : null}
              </label>
            ))}

            <label className="mt-4 block text-[0.88rem] font-medium text-ink" htmlFor={`${formId}-address`}>
              <span>
                {t("fields.address")}
                <span className="text-brand"> *</span>
              </span>
              <textarea
                aria-invalid={invalid("address")}
                className={`${inputClass("address")} min-h-24 resize-y`}
                defaultValue={verification.address}
                id={`${formId}-address`}
                maxLength={300}
                name="address"
                required
              />
              {invalid("address") ? (
                <span className="mt-1.5 block text-[0.8rem] font-normal text-red-700" role="alert">
                  {fieldError?.message}
                </span>
              ) : null}
            </label>
          </div>

          <div
            className={joinClassNames(
              "rounded-2xl border border-brand-border bg-white p-5 sm:p-7",
              step !== 2 && "hidden",
            )}
            data-step="2"
          >
            <p className="m-0 text-[0.95rem] font-semibold text-ink">{t("documentsSection")}</p>
            <p className="mt-1 mb-5 text-[0.88rem] leading-5 text-muted">{t("documentsOptional")}</p>

            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {documentTypes.map((documentType) => {
                const existing = verification.documents.find((item) => item.documentType === documentType);
                const name = `document-${documentType}`;
                const selectedName = fileNames[documentType];
                const shownName = selectedName ?? existing?.fileName;
                return (
                  <li key={documentType}>
                    <label
                      className="flex cursor-pointer flex-col gap-2 rounded-[10px] border border-brand-border px-4 py-3.5 transition-[border-color,background-color] duration-150 ease-out hover:border-brand/45 hover:bg-brand-soft/40 has-[:focus-visible]:border-brand"
                      htmlFor={`${formId}-${name}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-[0.9rem] font-medium text-ink">{t(`documents.${documentType}`)}</span>
                        <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-[0.7rem] font-semibold text-brand">
                          {t("optional")}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[0.8rem] font-normal text-muted">
                          {shownName ? t("currentFile", { name: shownName }) : t("noFile")}
                        </span>
                        <span className="shrink-0 rounded-md bg-brand-soft px-3 py-1.5 text-[0.78rem] font-semibold text-brand">
                          {shownName ? t("replaceFile") : t("chooseFile")}
                        </span>
                      </span>
                      <input
                        accept="application/pdf,image/jpeg,image/png"
                        aria-invalid={invalid(name)}
                        className="sr-only"
                        id={`${formId}-${name}`}
                        name={name}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          setFileNames((current) => ({ ...current, [documentType]: file?.name }));
                        }}
                        type="file"
                      />
                    </label>
                    {invalid(name) ? (
                      <p className="mt-1.5 mb-0 px-1 text-[0.8rem] text-red-700" role="alert">
                        {fieldError?.message}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 mb-0 text-[0.8rem] leading-5 text-muted">{t("documentHint")}</p>
          </div>

          {error ? (
            <div className="mt-5">
              <FriendlyAlert>{error}</FriendlyAlert>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
            {step > 1 ? (
              <button
                className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-[10px] border border-brand-border bg-white px-5 text-[0.95rem] font-semibold text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-brand-soft active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                onClick={() => goToStep(1)}
                type="button"
              >
                {t("back")}
              </button>
            ) : (
              <Link
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-brand-border bg-white px-5 text-center text-[0.95rem] font-semibold text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-brand-soft active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                href={routes.companyDashboard}
              >
                {t("cancel")}
              </Link>
            )}
            <button
              className="inline-flex min-h-12 flex-[2] cursor-pointer items-center justify-center rounded-[10px] bg-brand px-5 text-[0.95rem] font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-brand-hover active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? t("submitting") : step === totalSteps ? t("submit") : t("continue")}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function StatusGlyph({ verified }: { verified: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand"
    >
      <svg className="size-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        {verified ? (
          <path d="M5 12.5l4.2 4.2L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7.5v5l3 1.8" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
    </span>
  );
}
