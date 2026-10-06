"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Building2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { api } from "@/convex/_generated/api";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { workspaceButton } from "@/features/shared/components/workspace-page";
import { mapConvexFailure } from "@/lib/errors";
import { uploadCompanyCover, validateCompanyCoverFile } from "@/lib/files/company-cover";
import { PrivateCompanyCoverPreview } from "./private-company-cover-preview";

type Covers = FunctionReturnType<typeof api.companyCovers.index.getMyCovers>;

/** The existing capability query derives owner status from active membership, independently of verification status. */
export function CompanyOwnerCoverManager() {
  const sessionToken = useAuthToken();
  const user = useQuery(api.users.currentUser);
  const companySession = !!sessionToken && user?.accountType === "company";
  const access = useQuery(api.companyVerification.index.getVerificationStatus, companySession ? {} : "skip");
  if (!companySession || !access?.canManageDocuments || !user?._id) return null;
  // Account changes destroy selected files, requests and all private Blob URLs.
  return <OwnerCoverEditor key={user._id} sessionToken={sessionToken!} />;
}

function OwnerCoverEditor({ sessionToken }: { sessionToken: string }) {
  const t = useTranslations("companyCover");
  const tUx = useTranslations("ux");
  const covers = useQuery(api.companyCovers.index.getMyCovers, {});
  const generateIntent = useMutation(api.companyCovers.index.generateUploadIntent);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputId = useId();
  const guidanceId = useId();
  const selectionId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRequest = useRef<AbortController | null>(null);

  useEffect(() => () => { uploadRequest.current?.abort(); }, [sessionToken]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (uploadRequest.current) return;
    const selected = event.currentTarget.files?.[0];
    setSuccess(false);
    setError(null);
    if (!selected) return;
    try {
      validateCompanyCoverFile(selected);
      setFile(selected);
    } catch (caught) {
      setFile(null);
      event.currentTarget.value = "";
      setError(mapConvexFailure(caught, tUx).message);
    }
  }

  async function submitCover() {
    if (!file || uploadRequest.current) return;
    const controller = new AbortController();
    uploadRequest.current = controller; // Also blocks clicks before React updates disabled state.
    setUploading(true);
    setError(null);
    setSuccess(false);
    try {
      const contentType = validateCompanyCoverFile(file);
      const intent = await generateIntent({ contentType, size: file.size });
      if (controller.signal.aborted) return;
      // Ignore the returned URL: credentials can go only to the configured Convex origin.
      await uploadCompanyCover({ file, sessionToken, uploadToken: intent.uploadToken, signal: controller.signal });
      if (controller.signal.aborted) return;
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setSuccess(true); // Reactive getMyCovers supplies the authoritative pending image.
    } catch (caught) {
      if (!controller.signal.aborted) setError(mapConvexFailure(caught, tUx).message);
      // Keep the same File for a recoverable failure; retry creates a fresh intent.
    } finally {
      if (uploadRequest.current === controller) {
        uploadRequest.current = null;
        setUploading(false);
      }
    }
  }

  const submitted = covers?.submitted && covers.submitted.moderationStatus !== "approved" ? covers.submitted : null;
  return (
    <section aria-label={t("title")} className="min-w-0" data-company-cover-manager>
      <h2 className="m-0 text-[1.05rem] font-semibold text-ink">{t("title")}</h2>
      <p className="mt-2 mb-4 text-sm leading-6 text-muted" id={guidanceId}>{t("guidance")}</p>
      {covers === undefined ? (
        <div aria-busy="true" className="rounded-xl border border-brand-border bg-brand-soft p-4" role="status">
          <span>{t("loading")}</span>
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <CoverCard image={covers.approved} kind="approved" sessionToken={sessionToken} />
          <CoverCard image={submitted} kind="submitted" sessionToken={sessionToken} />
        </div>
      )}
      <div className="mt-4 min-w-0">
        <label className="block text-sm font-medium text-ink" htmlFor={inputId}>{t("chooseFile")}</label>
        <input accept="image/jpeg,image/png,image/webp" aria-describedby={`${guidanceId} ${selectionId}${error ? ` ${errorId}` : ""}`}
          className="mt-2 min-h-11 w-full min-w-0 rounded-[10px] border border-brand-border bg-white p-2 text-sm text-ink file:me-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-medium file:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={uploading || covers === undefined} id={inputId} name="companyCoverFile" onChange={selectFile} ref={inputRef} type="file" />
        <p className="mt-2 mb-0 text-xs leading-5 text-muted" id={selectionId}>{t("limits")} {t("optional")}</p>
        {file ? <p className="mt-2 mb-0 break-all text-sm text-ink">{t("selected", { name: file.name })}</p> : null}
        <button className={`${workspaceButton.primary} mt-3 min-h-11 w-full sm:w-auto`} disabled={!file || uploading || covers === undefined} onClick={() => void submitCover()} type="button">
          {uploading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {uploading ? t("uploading") : error && file ? t("retryUpload") : t("submit")}
        </button>
        {uploading ? <p className="mt-2 mb-0 text-sm text-muted" role="status">{t("uploading")}</p> : null}
        {success ? <p className="mt-3 mb-0 text-sm leading-6 text-brand" role="status">{t("success")}</p> : null}
        {error ? <div className="mt-3" id={errorId}><FriendlyAlert>{error}</FriendlyAlert></div> : null}
      </div>
    </section>
  );
}

function CoverCard({ image, kind, sessionToken }: { image: Covers["submitted"]; kind: "approved" | "submitted"; sessionToken: string }) {
  const t = useTranslations("companyCover");
  return (
    <section aria-label={t(kind === "approved" ? "approvedTitle" : "submittedTitle")} className="min-w-0 rounded-xl border border-brand-border p-4">
      <h3 className="m-0 text-sm font-semibold text-ink">{t(kind === "approved" ? "approvedTitle" : "submittedTitle")}</h3>
      <div className="mt-3">
        {image ? <PrivateCompanyCoverPreview imageId={image.imageId} sessionToken={sessionToken} alt={t(kind === "approved" ? "approvedAlt" : "submittedAlt")} /> : <GenericCover />}
      </div>
      <p className="mt-3 mb-0 text-sm font-semibold text-brand">
        {image ? t(`status.${image.moderationStatus}`) : t(kind === "approved" ? "noApproved" : "noSubmission")}
      </p>
      <p className="mt-1 mb-0 text-xs leading-5 text-muted">{t(kind === "approved" ? "approvedHelp" : image?.moderationStatus === "rejected" ? "rejectedHelp" : "pendingHelp")}</p>
      {image?.moderationStatus === "rejected" && image.reason ? <p className="mt-2 mb-0 break-words text-sm leading-6 text-[#9b2c20]">{t("reason", { reason: image.reason })}</p> : null}
    </section>
  );
}

function GenericCover() {
  const t = useTranslations("companyCover");
  return <span aria-label={t("genericAlt")} className="grid h-28 w-full place-items-center rounded-xl bg-brand-soft text-brand" role="img"><Building2 aria-hidden className="size-8" /></span>;
}
