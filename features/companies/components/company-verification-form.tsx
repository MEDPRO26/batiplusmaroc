"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Clock3, FileCheck2, FileText, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { FormSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { mapConvexFailure } from "@/lib/errors";
import { saveVerificationBlob, uploadVerificationFile } from "@/lib/files/company-verification";
import { focusFirstInvalidField } from "@/lib/forms/submit";
import { routes } from "@/lib/routes";
import { VerificationDocumentDownload } from "./verification-document-download";
import { VerifiedBadge, VerifiedGlyph, type VerificationStatus } from "./verified-badge";

const documentTypes = ["tax_compliance", "rc", "ice", "insurance", "other"] as const;
type DocumentType = (typeof documentTypes)[number];
type Verification = FunctionReturnType<typeof api.companyVerification.index.getVerificationForm>;
type UploadedFile = { file: File; storageId: Id<"_storage">; uploadToken: string; uploadedAt: number };
type FileState = { file: File; uploading: boolean; uploaded?: UploadedFile; error?: string };
const primaryClass = "inline-flex min-h-12 items-center justify-center rounded-[10px] bg-brand px-5 text-[0.95rem] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-brand/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand";
const actionClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-brand-border px-3 text-sm font-semibold text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function CompanyVerificationForm() {
  const t = useTranslations("auth.companyVerification");
  const tUx = useTranslations("ux");
  const router = useRouter();
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const access = useQuery(api.companyVerification.index.getVerificationStatus, canLoad ? {} : "skip");
  // Staff never subscribe to an owner-only DTO, even though the backend also guards it.
  const verification = useQuery(api.companyVerification.index.getVerificationForm, canLoad && access?.canManageDocuments ? {} : "skip");
  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user && !canLoad) router.replace(workspaceRouteForUser(user));
  }, [router, user, canLoad]);

  return <>
    <VerificationHeader />
    <section className="mx-auto w-full min-w-0 max-w-[760px] flex-1 px-5 py-10 sm:px-6 sm:py-14">
      {!canLoad || !access || (access.canManageDocuments && !verification)
        ? <FormSkeleton label={tUx("loading.form")} />
        : !access.canManageDocuments
          ? <VerificationStatusScreen status={access.status} staff />
          : <VerificationEditor key={`${verification!.status}:${verification!.submittedAt}`} verification={verification!} />}
      <p className="mt-7 flex items-start justify-center gap-2 text-center text-xs leading-5 text-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t("privacy")}
      </p>
    </section>
  </>;
}

function VerificationHeader() {
  const tBrand = useTranslations("brand");
  const t = useTranslations("auth.companyVerification");
  return <header className="border-b border-brand-border bg-white">
    <div className="mx-auto flex min-h-16 max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
      <Link href={routes.home} aria-label={tBrand("homeAria")} className="text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"><BrandLogo className="text-[1.4rem]" name={tBrand("name")} /></Link>
      <div className="flex flex-wrap items-center gap-4"><LanguageSwitcher /><Link className="text-sm font-medium text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" href={routes.companyDashboard}>{t("backToWorkspace")}</Link></div>
    </div>
  </header>;
}

export function VerificationStatusScreen({ status, staff = false }: { status: VerificationStatus; staff?: boolean }) {
  const t = useTranslations("auth.companyVerification");
  const verified = status === "verified";
  return <div className="mx-auto max-w-[560px] rounded-2xl border border-brand-border bg-white p-6 text-center sm:p-10">
    {verified ? <VerifiedGlyph className="mx-auto size-20" /> : <div className="mx-auto grid size-16 place-items-center rounded-full bg-brand-soft text-brand"><Clock3 aria-hidden="true" className="size-8" /></div>}
    <div className="mt-5"><StatusBadge status={status} /></div>
    <h1 className="mt-4 text-[1.75rem] font-semibold tracking-[-0.03em] text-ink sm:text-[2rem]">{t(status === "pending" || verified ? `${status}.title` : `status.${status}`)}</h1>
    <p className="mt-3 text-[0.98rem] leading-6 text-muted">{t(status === "pending" || verified ? `${status}.lead` : "staffLead")}</p>
    {status === "pending" ? <p className="mt-3 text-sm leading-6 text-muted">{t("pending.noAction")}</p> : null}
    {staff && (status === "pending" || verified) ? <p className="mt-3 text-sm leading-6 text-muted">{t("staffLead")}</p> : null}
    <Link className={`${primaryClass} mt-8 w-full`} href={routes.companyDashboard}>{t("backToWorkspace")}</Link>
  </div>;
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  const t = useTranslations("auth.companyVerification");
  if (status === "verified") return <VerifiedBadge label={t("verified.badge")} verificationStatus={status} />;
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status === "rejected" ? "bg-red-50 text-red-800" : "bg-brand-soft text-brand"}`}>{t(`status.${status}`)}</span>;
}

function ExistingDocumentDownload({ document }: { document: Verification["documents"][number] }) {
  const t = useTranslations("auth.companyVerification");
  const url = useQuery(api.companyVerification.index.getDocumentDownloadUrl, { documentId: document.documentId });
  return url ? <VerificationDocumentDownload className={actionClass} url={url} fileName={document.fileName} label={t("viewDocument")} /> : null;
}

function VerificationEditor({ verification }: { verification: Verification }) {
  const t = useTranslations("auth.companyVerification");
  const tUx = useTranslations("ux");
  const sessionToken = useAuthToken();
  const generateUpload = useMutation(api.companyVerification.index.generateDocumentUploadUrl);
  const submit = useMutation(api.companyVerification.index.submitVerification);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<Partial<Record<DocumentType, FileState>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ status: VerificationStatus; submittedAt: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);
  const uploading = Object.values(files).some(file => file?.uploading);
  const uploadFailed = Object.values(files).some(file => file?.error);
  const hasTax = Boolean(files.tax_compliance?.uploaded || verification.documents.some(doc => doc.documentType === "tax_compliance"));

  async function upload(documentType: DocumentType, file: File): Promise<UploadedFile> {
    const { uploadUrl, uploadToken } = await generateUpload({ documentType });
    const storageId = await uploadVerificationFile({ uploadUrl, uploadToken, sessionToken, file });
    return { file, storageId, uploadToken, uploadedAt: Date.now() };
  }

  async function chooseFile(documentType: DocumentType, file?: File) {
    if (!file) return;
    setError(null);
    if (!file.size || file.size > 10 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setFiles(previous => ({ ...previous, [documentType]: { file, uploading: false, error: t("validation.document") } }));
      return;
    }
    setFiles(previous => ({ ...previous, [documentType]: { file, uploading: true } }));
    try {
      const uploaded = await upload(documentType, file);
      setFiles(previous => ({ ...previous, [documentType]: { file, uploading: false, uploaded } }));
    } catch (caught) {
      setFiles(previous => ({ ...previous, [documentType]: { file, uploading: false, error: mapConvexFailure(caught, tUx).message } }));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || uploading || uploadFailed || !hasTax) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null); setFieldError(null);
    for (const name of ["legalName", "ice", "rcNumber", "legalRepresentative", "phone", "address"] as const) {
      if (!String(data.get(name) ?? "").trim()) {
        setFieldError({ name, message: t("validation.required") }); focusFirstInvalidField(form, name); return;
      }
    }
    if (!/^\d{15}$/.test(String(data.get("ice")).replace(/\s/g, ""))) {
      setFieldError({ name: "ice", message: t("validation.ice") }); focusFirstInvalidField(form, "ice"); return;
    }
    setSubmitting(true);
    try {
      const documents = await Promise.all(documentTypes.flatMap(documentType => {
        const uploaded = files[documentType]?.uploaded;
        if (!uploaded) return [];
        return [(async () => {
          // Refresh a staged upload before its backend token expires.
          const current = Date.now() - uploaded.uploadedAt >= 14 * 60 * 1000 ? await upload(documentType, uploaded.file) : uploaded;
          setFiles(previous => ({ ...previous, [documentType]: { file: current.file, uploading: false, uploaded: current } }));
          return { documentType, storageId: current.storageId, uploadToken: current.uploadToken, fileName: current.file.name };
        })()];
      }));
      await submit({ legalName: String(data.get("legalName")), ice: String(data.get("ice")), rcNumber: String(data.get("rcNumber")), legalRepresentative: String(data.get("legalRepresentative")), phone: String(data.get("phone")), address: String(data.get("address")), documents });
      setSubmitted({ status: verification.status, submittedAt: verification.submittedAt });
    } catch (caught) {
      const mapped = mapConvexFailure(caught, tUx);
      if (mapped.field) setFieldError({ name: mapped.field, message: mapped.message });
      setError(mapped.message); focusFirstInvalidField(form, mapped.field);
    } finally { setSubmitting(false); }
  }

  // The optimistic pending screen applies only to the previous submission snapshot.
  // A later Admin rejection must immediately restore the editable rejected screen.
  const waitingForPending = submitted?.status === verification.status && submitted?.submittedAt === verification.submittedAt;
  if (verification.status === "pending" || verification.status === "verified" || waitingForPending) {
    return <VerificationStatusScreen status={verification.status === "verified" ? "verified" : "pending"} />;
  }
  const rejected = verification.status === "rejected";
  return <>
    <StatusBadge status={verification.status} />
    <h1 className="mt-4 mb-0 text-[1.75rem] font-semibold tracking-[-0.03em] text-ink sm:text-[2rem]">{t(rejected ? "rejected.title" : "title")}</h1>
    <p className="mt-3 text-[0.98rem] leading-6 text-muted">{t(rejected ? "rejectedLead" : "lead")}</p>
    {rejected ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4" role="status"><h2 className="text-sm font-semibold text-red-900">{t("rejectionReason")}</h2><p className="mt-2 break-words text-sm leading-6 text-red-800">{verification.rejectionReason || t("rejected.noReason")}</p></div> : null}
    <form className="mt-7 space-y-5" noValidate onSubmit={onSubmit} ref={formRef} aria-busy={submitting}>
      <fieldset disabled={submitting} className="min-w-0 rounded-2xl border border-brand-border bg-white p-5 sm:p-7">
        <legend className="sr-only">{t("legalSection")}</legend><h2 className="text-base font-semibold text-ink">{t("legalSection")}</h2><p className="mt-1 text-sm leading-5 text-muted">{t("legalSectionLead")}</p>
        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
          {(["legalName", "ice", "rcNumber", "legalRepresentative", "phone", "address"] as const).map(name => <label key={name} htmlFor={`${formId}-${name}`} className={`min-w-0 text-sm font-medium text-ink ${name === "address" ? "sm:col-span-2" : ""}`}>
            {t(`fields.${name}`)} <span className="text-brand" aria-hidden="true">*</span>
            <input id={`${formId}-${name}`} name={name} defaultValue={verification[name]} required maxLength={name === "address" ? 300 : name === "legalName" || name === "legalRepresentative" ? 160 : 80} type={name === "phone" ? "tel" : "text"} inputMode={name === "ice" ? "numeric" : name === "phone" ? "tel" : "text"} autoComplete={name === "legalName" ? "organization" : name === "phone" ? "tel" : "off"} aria-invalid={fieldError?.name === name} aria-describedby={fieldError?.name === name ? `${formId}-${name}-error` : undefined} className="mt-2 min-h-12 w-full min-w-0 rounded-[10px] border border-brand-border px-3.5 text-base font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
            {fieldError?.name === name ? <span id={`${formId}-${name}-error`} className="mt-1 block text-xs text-red-700" role="alert">{fieldError.message}</span> : null}
          </label>)}
        </div>
      </fieldset>
      <fieldset disabled={submitting} className="min-w-0 rounded-2xl border border-brand-border bg-white p-5 sm:p-7">
        <legend className="sr-only">{t("documentsSection")}</legend><h2 className="text-base font-semibold text-ink">{t("documentsSection")}</h2><p className="mt-1 text-sm leading-5 text-muted">{t("documentsOptional")}</p><p id={`${formId}-formats`} className="mt-2 text-xs leading-5 text-muted">{t("documentHint")}</p>
        <ul className="mt-5 space-y-3">
          {documentTypes.map(documentType => {
            const existing = verification.documents.find(doc => doc.documentType === documentType);
            const selected = files[documentType];
            const shownName = selected?.file.name ?? existing?.fileName;
            const title = t(`documents.${documentType}`);
            return <li key={documentType} className={`min-w-0 rounded-xl border p-4 ${documentType === "tax_compliance" ? "border-brand/25 bg-brand-soft/20" : "border-brand-border"}`}>
              <div className="flex items-start gap-3"><FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 break-words text-sm font-semibold text-ink">{title}</h3><span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[0.7rem] font-semibold text-brand">{t(documentType === "tax_compliance" ? "required" : "optional")}</span></div><p className="mt-2 break-all text-xs leading-5 text-muted">{shownName || t("noFile")}</p>
                <p id={`${formId}-${documentType}-state`} className="mt-1 flex items-center gap-1 text-xs text-brand" role="status">{selected?.uploading ? t("uploading") : selected?.error ? selected.error : selected?.uploaded || existing ? <><FileCheck2 aria-hidden="true" className="size-3.5 shrink-0" />{t("uploaded")}</> : t("awaitingFile")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className={`${actionClass} relative cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${selected?.uploading ? "pointer-events-none opacity-50" : ""}`} htmlFor={`${formId}-document-${documentType}`}>
                    {t(shownName ? "replaceFile" : "chooseFile")}<span className="sr-only">{` — ${title}`}</span>
                    <input id={`${formId}-document-${documentType}`} name={`document-${documentType}`} aria-label={t(shownName ? "replaceDocument" : "chooseDocument", { document: title })} aria-describedby={`${formId}-formats ${formId}-${documentType}-state`} className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={selected?.uploading || submitting} onChange={event => { void chooseFile(documentType, event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
                  </label>
                  {selected?.uploaded ? <button className={actionClass} type="button" onClick={() => saveVerificationBlob(selected.uploaded!.file, selected.uploaded!.file.name)}>{t("viewDocument")}</button> : existing ? <ExistingDocumentDownload document={existing} /> : null}
                  {selected ? <button className={actionClass} disabled={selected.uploading} type="button" onClick={() => setFiles(previous => ({ ...previous, [documentType]: undefined }))}>{t(existing ? "keepCurrentFile" : "removeFile")}</button> : null}
                </div>
              </div></div>
            </li>;
          })}
        </ul>
      </fieldset>
      {!hasTax ? <p className="text-sm text-muted" role="status">{t("validation.taxCertificate")}</p> : null}
      {error ? <FriendlyAlert>{error}</FriendlyAlert> : null}
      <button className={`${primaryClass} w-full`} disabled={!hasTax || uploading || uploadFailed || submitting} type="submit">{t(submitting ? "submitting" : rejected ? "resubmit" : "submit")}</button>
    </form>
  </>;
}
