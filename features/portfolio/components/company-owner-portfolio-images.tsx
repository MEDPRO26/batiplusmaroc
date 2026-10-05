"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Component, useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { workspaceButton } from "@/features/shared/components/workspace-page";
import { mapConvexFailure } from "@/lib/errors";
import { isApprovedPortfolioImageUrl, uploadPortfolioImage, validatePortfolioImageFile } from "@/lib/files/portfolio-image";
import { ApprovedPortfolioImage } from "./approved-portfolio-image";
import { PrivatePortfolioImagePreview } from "./private-portfolio-image-preview";

type Images = FunctionReturnType<typeof api.portfolioImages.index.getMyImages>;
type Pair = Images["cover"];
type Props = { portfolioProjectId: Id<"portfolioProjects">; publicUrls: string[] };

/** The active membership capability is independent of Company verification. */
export function CompanyOwnerPortfolioImages(props: Props) {
  const token = useAuthToken();
  const user = useQuery(api.users.currentUser);
  const eligible = !!token && user?.accountType === "company" && user.onboardingStatus === "completed";
  const access = useQuery(api.companyVerification.index.getVerificationStatus, eligible ? {} : "skip");
  const t = useTranslations("portfolioImages");
  if (!eligible || !access?.canManageDocuments || !user?._id) return null;
  return <ImagesBoundary key={`${user._id}:${token}:${props.portfolioProjectId}`} errorCopy={t("loadError")} retryCopy={t("retry")}>
    <OwnerImages {...props} sessionToken={token!} />
  </ImagesBoundary>;
}

class ImagesBoundary extends Component<{ children: ReactNode; errorCopy: string; retryCopy: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div><FriendlyAlert>{this.props.errorCopy}</FriendlyAlert><button className={workspaceButton.secondary} onClick={() => this.setState({ failed: false })} type="button">{this.props.retryCopy}</button></div>;
  }
}

function OwnerImages({ portfolioProjectId, publicUrls, sessionToken }: Props & { sessionToken: string }) {
  const t = useTranslations("portfolioImages");
  const tUx = useTranslations("ux");
  const images = useQuery(api.portfolioImages.index.getMyImages, { portfolioProjectId });
  const createSlot = useMutation(api.portfolioImages.index.createGallerySlot);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedSlot, setAddedSlot] = useState<Id<"portfolioMedia"> | null>(null);
  const request = useRef<AbortController | null>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const focusedSlot = useRef<Id<"portfolioMedia"> | null>(null);
  const guidanceId = useId();
  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (addedSlot && focusedSlot.current !== addedSlot && images?.gallery.some(slot => slot.slotId === addedSlot)) {
      gallery.current?.querySelector<HTMLInputElement>(`[data-slot-id="${addedSlot}"] input[type="file"]`)?.focus();
      focusedSlot.current = addedSlot;
    }
  }, [addedSlot, images]);

  async function addSlot() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setAdding(true); setError(null);
    try {
      const id = await createSlot({ portfolioProjectId });
      if (!controller.signal.aborted) setAddedSlot(id);
    } catch (caught) {
      if (!controller.signal.aborted) setError(mapConvexFailure(caught, tUx).message);
    } finally {
      if (!controller.signal.aborted) { request.current = null; setAdding(false); }
    }
  }

  return <section className="min-w-0" data-owner-portfolio-images aria-label={t("title")}>
    <p className="mt-0 mb-3 text-sm leading-6 text-muted" id={guidanceId}>{t("guidance")}</p>
    <p className="mb-4 text-sm leading-6 text-brand">{t("publicationHelp")}</p>
    {images === undefined ? <p aria-busy="true" role="status">{t("loading")}</p> : <>
      <ImageSlot title={t("cover")} pair={images.cover} purpose="cover" portfolioProjectId={portfolioProjectId} publicUrls={publicUrls} sessionToken={sessionToken} guidanceId={guidanceId} />
      <div className="mt-6 min-w-0" ref={gallery}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="m-0 text-sm font-semibold text-ink">{t("gallery")}</h3>
          <span className="text-xs text-muted">{t("slotCount", { count: images.gallery.length, max: 8 })}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">{t("galleryHelp")}</p>
        {images.gallery.length === 0 ? <p className="text-sm text-muted">{t("emptyGallery")}</p> : null}
        <div className="grid min-w-0 gap-4">
          {images.gallery.map((slot, index) => <ImageSlot key={slot.slotId} title={t("slot", { number: index + 1 })} pair={slot} gallerySlotId={slot.slotId} purpose="gallery" portfolioProjectId={portfolioProjectId} publicUrls={publicUrls} sessionToken={sessionToken} guidanceId={guidanceId} />)}
        </div>
        {images.gallery.length < 8 ? <button className={`${workspaceButton.secondary} mt-3 min-h-11 w-full sm:w-auto`} disabled={adding} onClick={() => void addSlot()} type="button">{adding ? t("adding") : t("addSlot")}</button> : null}
        {error ? <div className="mt-3"><FriendlyAlert>{error}</FriendlyAlert></div> : null}
      </div>
    </>}
  </section>;
}

function ImageSlot({ title, pair, purpose, portfolioProjectId, gallerySlotId, publicUrls, sessionToken, guidanceId }: Props & {
  title: string; pair: Pair; purpose: "cover" | "gallery"; gallerySlotId?: Id<"portfolioMedia">; sessionToken: string; guidanceId: string;
}) {
  const t = useTranslations("portfolioImages");
  const tUx = useTranslations("ux");
  const generateIntent = useMutation(api.portfolioImages.index.generateUploadIntent);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Id<"portfolioImages"> | null>(null);
  const inputId = useId(); const hintId = useId(); const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    if (request.current) return;
    const selected = event.currentTarget.files?.[0];
    setSuccess(null); setError(null);
    if (!selected) return;
    try { validatePortfolioImageFile(selected); setFile(selected); }
    catch (caught) { setFile(null); event.currentTarget.value = ""; setError(mapConvexFailure(caught, tUx).message); }
  }
  async function upload() {
    if (!file || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setUploading(true); setSuccess(null); setError(null);
    try {
      const contentType = validatePortfolioImageFile(file);
      const intent = await generateIntent({ portfolioProjectId, purpose, gallerySlotId, contentType, size: file.size });
      if (controller.signal.aborted) return;
      // A returned URL cannot select the credential destination.
      const imageId = await uploadPortfolioImage({ file, sessionToken, uploadToken: intent.uploadToken, signal: controller.signal });
      if (controller.signal.aborted) return;
      setFile(null); if (input.current) input.current.value = ""; setSuccess(imageId);
    } catch (caught) {
      if (!controller.signal.aborted) setError(mapConvexFailure(caught, tUx).message);
      // Retain this File and stable slot for a fresh-intent retry.
    } finally {
      if (!controller.signal.aborted) { request.current = null; setUploading(false); }
    }
  }
  const submission = pair.submitted?.moderationStatus !== "approved" ? pair.submitted : null;
  const waitingSuccess = success === submission?.imageId && submission?.moderationStatus === "pending";
  return <section className="min-w-0 rounded-xl border border-brand-border p-3 sm:p-4" aria-label={title} data-slot-id={gallerySlotId ?? "cover"}>
    <h3 className="mt-0 mb-3 text-sm font-semibold text-ink">{title}</h3>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <ImageCard image={pair.approved} kind="approved" purpose={purpose} publicUrls={publicUrls} sessionToken={sessionToken} />
      <ImageCard image={submission} kind="submitted" purpose={purpose} publicUrls={publicUrls} sessionToken={sessionToken} />
    </div>
    <label className="mt-4 block text-sm font-medium text-ink" htmlFor={inputId}>{t("chooseFile")}</label>
    <input accept="image/jpeg,image/png,image/webp" aria-describedby={`${guidanceId} ${hintId}${error ? ` ${errorId}` : ""}`} className="mt-2 min-h-11 w-full min-w-0 rounded-[10px] border border-brand-border p-2 text-sm file:me-2 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50" disabled={uploading} id={inputId} onChange={selectFile} ref={input} type="file" />
    <p className="mt-2 text-xs leading-5 text-muted" id={hintId}>{t("limits")}</p>
    {file ? <p className="break-all text-sm text-ink">{t("selected", { name: file.name })}</p> : null}
    <button className={`${workspaceButton.primary} min-h-11 w-full sm:w-auto`} disabled={!file || uploading} onClick={() => void upload()} type="button">
      {uploading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}{uploading ? t("uploading") : error && file ? t("retryUpload") : t("submit")}
    </button>
    {uploading || waitingSuccess ? <p className="mt-3 mb-0 text-sm leading-6 text-brand" role="status">{t(uploading ? "uploading" : "success")}</p> : null}
    {error ? <div className="mt-3" id={errorId}><FriendlyAlert>{error}</FriendlyAlert></div> : null}
  </section>;
}

function ImageCard({ image, kind, purpose, publicUrls, sessionToken }: { image: Pair["submitted"]; kind: "approved" | "submitted"; purpose: "cover" | "gallery"; publicUrls: string[]; sessionToken: string }) {
  const t = useTranslations("portfolioImages");
  // Only a URL returned by the approved-only backend DTO may use public delivery.
  const publicUrl = image && kind === "approved" ? publicUrls.find(url => isApprovedPortfolioImageUrl(url) && new URL(url).pathname === `/portfolio-images/public/${image.imageId}`) : undefined;
  const title = t(kind === "approved" ? "approvedTitle" : "submittedTitle");
  return <section aria-label={title} className="min-w-0 rounded-lg bg-brand-soft/40 p-3">
    <h4 className="mt-0 mb-3 text-xs font-semibold text-ink">{title}</h4>
    {image && !publicUrl ? <PrivatePortfolioImagePreview imageId={image.imageId} sessionToken={sessionToken} alt={title} /> : <div className="size-20 overflow-hidden rounded-xl"><ApprovedPortfolioImage url={publicUrl} alt={title} width={80} height={80} className="size-20 object-contain" /></div>}
    <p className="mt-3 mb-1 text-sm font-semibold text-brand">{image ? t(`status.${image.moderationStatus}`) : t(kind === "approved" ? "noApproved" : "noSubmission")}</p>
    <p className="m-0 text-xs leading-5 text-muted">{t(kind === "approved" ? "approvedHelp" : image?.moderationStatus === "rejected" ? "rejectedHelp" : "pendingHelp")}</p>
    {!image && kind === "approved" && purpose === "gallery" ? <p className="mt-1 mb-0 text-xs text-muted">{t("omittedGallery")}</p> : null}
    {image?.moderationStatus === "rejected" && image.reason ? <p className="mt-2 mb-0 break-words text-sm text-[#9b2c20]">{t("reason", { reason: image.reason })}</p> : null}
  </section>;
}
