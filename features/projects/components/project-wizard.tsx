"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { OnboardingChrome } from "@/features/auth/components/onboarding-chrome";
import { useToast } from "@/features/shared/components/app-feedback";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { FormSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { mapConvexFailure } from "@/lib/errors";
import { createSubmitLock, focusFirstInvalidField } from "@/lib/forms/submit";
import { routes } from "@/lib/routes";

const totalSteps = 6;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
type Wizard = FunctionReturnType<typeof api.projects.index.getWizard>;
type Draft = NonNullable<Wizard["draft"]>;
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type LocalImage = { file: File; url: string };
type Translate = (key: string, values?: Record<string, string | number>) => string;

export function ProjectWizard() {
  const typedT = useTranslations("projectWizard");
  const t: Translate = (key, values) => typedT(key as never, values as never);
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "client" && user.onboardingStatus === "completed";
  const wizard = useQuery(api.projects.index.getWizard, canLoad ? {} : "skip");
  const initialize = useMutation(api.projects.index.initializeDraft);
  const saveCategory = useMutation(api.projects.index.saveCategory);
  const saveLocation = useMutation(api.projects.index.saveLocation);
  const saveDetails = useMutation(api.projects.index.saveDetails);
  const saveBudget = useMutation(api.projects.index.saveBudget);
  const saveTimeline = useMutation(api.projects.index.saveTimeline);
  const attachmentUrl = useMutation(api.projects.index.generateAttachmentUploadUrl);
  const saveFiles = useMutation(api.projects.index.saveFiles);
  const publish = useMutation(api.projects.index.publishProject);
  const requestImage = useAction(api.projects.media.requestImageUpload);
  const verifyImage = useAction(api.projects.media.verifyImageUpload);
  const router = useRouter();
  const { showToast } = useToast();
  const started = useRef(false);
  const loadedDraft = useRef<string | null>(null);
  const lock = useRef(createSubmitLock());
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const imageRef = useRef<LocalImage[]>([]);
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [documents, setDocuments] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);

  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user?.accountType === "company") router.replace(user.onboardingStatus === "completed" ? routes.companyDashboard : routes.companyOnboarding);
    else if (user?.accountType === "client" && user.onboardingStatus !== "completed") router.replace(routes.clientOnboarding);
  }, [router, user]);
  useEffect(() => { if (canLoad && wizard?.draft === null && !started.current) { started.current = true; void initialize({}).catch((caught) => { started.current = false; setError(mapConvexFailure(caught, tUx).message); }); } }, [canLoad, initialize, tUx, wizard?.draft]);
  useEffect(() => { if (wizard?.draft && loadedDraft.current !== wizard.draft.id) { loadedDraft.current = wizard.draft.id; setStep(Math.min(7, Math.max(1, wizard.draft.lastCompletedStep + 1)) as Step); } }, [wizard?.draft]);
  useEffect(() => { headingRef.current?.focus(); window.scrollTo({ top: 0 }); }, [step]);
  useEffect(() => { imageRef.current = images; }, [images]);
  useEffect(() => () => imageRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);
  useEffect(() => { if (!submitted) return; const timer = window.setTimeout(() => router.push(routes.clientDashboard), 2400); return () => window.clearTimeout(timer); }, [router, submitted]);

  const progressLabel = step === 7 ? t("progressReview") : t("progress", { current: step, total: totalSteps });
  if (!canLoad || wizard === undefined || wizard.draft === null) return <ProjectWizardSkeleton label={t("loading")} progressLabel={progressLabel} />;
  const data = wizard;
  const draft = data.draft;
  const fail = (form: HTMLFormElement, name: string, message: string) => { setFieldError({ name, message }); focusFirstInvalidField(form, name); return false; };
  const go = (next: Step) => { setError(null); setFieldError(null); setStep(next); };

  async function persist(form: HTMLFormElement, exit = false) {
    if (!lock.current.tryAcquire()) return;
    setSaving(true); setError(null); setFieldError(null);
    const values = new FormData(form);
    try {
      if (step === 1) {
        const category = String(values.get("primaryCategory") ?? "") as Wizard["categoryOptions"][number];
        if (!data.categoryOptions.includes(category)) return fail(form, "primaryCategory", t("validation.category"));
        const custom = String(values.get("customCategoryText") ?? "").trim();
        if (category === "other" && custom.length < 3) return fail(form, "customCategoryText", t("validation.customCategory"));
        await saveCategory({ projectId: draft.id, primaryCategory: category, customCategoryText: category === "other" ? custom : undefined });
      } else if (step === 2) {
        const city = String(values.get("city") ?? "") as Wizard["cityOptions"][number];
        if (!data.cityOptions.includes(city)) return fail(form, "city", t("validation.city"));
        await saveLocation({ projectId: draft.id, city, neighborhood: String(values.get("neighborhood") ?? "") });
      } else if (step === 3) {
        const title = String(values.get("title") ?? "").trim(); const description = String(values.get("description") ?? "").trim();
        const propertyType = String(values.get("propertyType") ?? "") as Wizard["propertyTypeOptions"][number];
        const surfaceUnknown = values.get("surfaceUnknown") === "on"; const surface = String(values.get("surface") ?? "").trim();
        if (title.length < 5) return fail(form, "title", t("validation.title"));
        if (!data.propertyTypeOptions.includes(propertyType)) return fail(form, "propertyType", t("validation.propertyType"));
        if (!surfaceUnknown && (!surface || Number(surface) <= 0)) return fail(form, "surface", t("validation.surface"));
        if (description.length < 20) return fail(form, "description", t("validation.description"));
        await saveDetails({ projectId: draft.id, title, propertyType, surfaceUnknown, surface: surfaceUnknown ? undefined : Number(surface), description });
      } else if (step === 4) {
        const budgetRange = String(values.get("budgetRange") ?? "") as Wizard["budgetOptions"][number];
        if (!data.budgetOptions.includes(budgetRange)) return fail(form, "budgetRange", t("validation.budget"));
        await saveBudget({ projectId: draft.id, budgetRange });
      } else if (step === 5) {
        const timeline = String(values.get("timeline") ?? "") as Wizard["timelineOptions"][number];
        if (!data.timelineOptions.includes(timeline)) return fail(form, "timeline", t("validation.timeline"));
        await saveTimeline({ projectId: draft.id, timeline });
      } else if (step === 6) {
        setUploading(images.length + documents.length > 0);
        const [imageTokens, uploadedDocs] = await Promise.all([
          Promise.all(images.map(async ({ file }) => { const intent = await requestImage({ projectId: draft.id, contentType: file.type, size: file.size }); const response = await fetch(intent.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file }); if (!response.ok) throw new Error("PROJECT_IMAGE_UPLOAD_FAILED"); await verifyImage({ uploadToken: intent.uploadToken }); return intent.uploadToken; })),
          Promise.all(documents.map(async (file) => { const intent = await attachmentUrl({ projectId: draft.id }); const response = await fetch(intent.uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file }); if (!response.ok) throw new Error("PROJECT_DOCUMENT_UPLOAD_FAILED"); const payload = await response.json() as { storageId?: string }; if (!payload.storageId) throw new Error("PROJECT_DOCUMENT_UPLOAD_FAILED"); return { uploadToken: intent.uploadToken, storageId: payload.storageId as Id<"_storage">, fileName: file.name }; })),
        ]);
        await saveFiles({ projectId: draft.id, imageUploadTokens: imageTokens, documents: uploadedDocs }); images.forEach((item) => URL.revokeObjectURL(item.url)); setImages([]); setDocuments([]);
      }
      if (exit) { showToast(t("draftSaved")); router.push(routes.clientDashboard); }
      else if (returnToReview) { setReturnToReview(false); go(7); }
      else go(Math.min(7, step + 1) as Step);
    } catch (caught) { const mapped = mapConvexFailure(caught, tUx); setError(mapped.message); if (mapped.field) { setFieldError({ name: mapped.field, message: mapped.message }); focusFirstInvalidField(form, mapped.field); } }
    finally { setUploading(false); setSaving(false); lock.current.release(); }
  }

  async function submitProject() { if (!lock.current.tryAcquire()) return; setSaving(true); setError(null); try { await publish({ projectId: draft.id }); setSubmitted(true); showToast(t("success.toast")); } catch (caught) { setError(mapConvexFailure(caught, tUx).message); } finally { setSaving(false); lock.current.release(); } }
  if (submitted) return <><OnboardingChrome progressLabel={t("progressComplete")} progressValue={100} /><main className="mx-auto flex w-full max-w-[680px] flex-1 items-center px-5 py-14"><section className="w-full rounded-3xl border border-brand-border bg-white p-8 text-center" role="status"><span aria-hidden className="text-4xl text-emerald-700">✓</span><h1 className="mt-5 text-3xl font-semibold text-ink">{t("success.title")}</h1><p className="mt-3 leading-7 text-muted">{t("success.lead")}</p><Link className="button button-primary mt-7" href={routes.clientDashboard}>{t("success.action")}</Link></section></main></>;

  const inputStep = step as Exclude<Step, 7>;
  return <><OnboardingChrome progressLabel={progressLabel} progressValue={step === 7 ? 100 : Math.round(step / totalSteps * 100)} /><main className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-5 py-8 sm:px-8 sm:py-12"><div className="mb-5 flex justify-between gap-3 text-sm text-muted"><span>{progressLabel}</span><span aria-live="polite">{saving ? t(uploading ? "uploading" : "saving") : t("autosaveHint")}</span></div>{step < 7 ? <form className="flex min-h-[560px] flex-1 flex-col" noValidate onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void persist(event.currentTarget); }} ref={formRef}><div className="flex-1 rounded-3xl border border-brand-border bg-white p-5 sm:p-9"><header><p className="m-0 text-xs font-semibold tracking-[0.15em] text-brand uppercase">{t(`steps.${step}.eyebrow`)}</p><h1 className="mt-3 text-3xl font-semibold text-ink outline-none" ref={headingRef} tabIndex={-1}>{t(`steps.${step}.title`)}</h1><p className="mt-3 leading-7 text-muted">{t(`steps.${step}.lead`)}</p></header><StepBody data={data} documents={documents} draft={draft} fieldError={fieldError} images={images} setDocuments={setDocuments} setError={setError} setImages={setImages} step={inputStep} t={t} />{error ? <div className="mt-6"><FriendlyAlert>{error}</FriendlyAlert></div> : null}</div><Actions disabled={saving} step={inputStep} t={t} uploading={uploading} onBack={() => go((step - 1) as Step)} onSave={() => { showToast(t("draftSaved")); router.push(routes.clientDashboard); }} /></form> : <Review draft={draft} error={error} publishing={saving} t={t} onEdit={(editStep) => { setReturnToReview(true); go(editStep); }} onPublish={() => void submitProject()} />}</main></>;
}

function StepBody({ step, draft, data, t, fieldError, images, documents, setImages, setDocuments, setError }: { step: Exclude<Step, 7>; draft: Draft; data: Wizard; t: Translate; fieldError: { name: string; message: string } | null; images: LocalImage[]; documents: File[]; setImages: React.Dispatch<React.SetStateAction<LocalImage[]>>; setDocuments: React.Dispatch<React.SetStateAction<File[]>>; setError: (value: string | null) => void }) {
  const message = (name: string) => fieldError?.name === name ? fieldError.message : undefined;
  const errorId = (name: string) => `project-${name}-error`;
  if (step === 1) return <fieldset aria-describedby={message("primaryCategory") ? errorId("primaryCategory") : undefined} className="mt-8 border-0 p-0"><legend className="sr-only">{t("steps.1.title")}</legend><div className="grid gap-3 sm:grid-cols-2">{data.categoryOptions.map((item) => <Choice key={item} checked={draft.primaryCategory === item} label={t(`categoryOptions.${item}`)} name="primaryCategory" value={item} />)}</div>{message("primaryCategory") ? <ErrorText id={errorId("primaryCategory")}>{message("primaryCategory")}</ErrorText> : null}<Field error={message("customCategoryText")} errorId={errorId("customCategoryText")} label={t("fields.customCategory")} optional={t("optional")}><input aria-describedby={message("customCategoryText") ? errorId("customCategoryText") : undefined} aria-invalid={Boolean(message("customCategoryText"))} className={inputClass} defaultValue={draft.customCategoryText ?? ""} maxLength={120} name="customCategoryText" placeholder={t("fields.customCategoryPlaceholder")} /></Field></fieldset>;
  if (step === 2) return <div className="mt-8 grid gap-6"><Field error={message("city")} errorId={errorId("city")} label={t("fields.city")}><select aria-describedby={message("city") ? errorId("city") : undefined} aria-invalid={Boolean(message("city"))} className={inputClass} defaultValue={draft.city ?? ""} name="city"><option disabled value="">{t("fields.cityPlaceholder")}</option>{data.cityOptions.map((item) => <option key={item} value={item}>{t(`cityOptions.${item}`)}</option>)}</select></Field><Field label={t("fields.neighborhood")} optional={t("optional")}><input className={inputClass} defaultValue={draft.neighborhood ?? ""} maxLength={100} name="neighborhood" /></Field><p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">{t("locationPrivacy")}</p></div>;
  if (step === 3) return <div className="mt-8 grid gap-6"><Field error={message("title")} errorId={errorId("title")} label={t("fields.title")}><input aria-describedby={message("title") ? errorId("title") : undefined} aria-invalid={Boolean(message("title"))} className={inputClass} defaultValue={draft.title ?? ""} maxLength={120} name="title" placeholder={t("fields.titlePlaceholder")} /></Field><Field error={message("propertyType")} errorId={errorId("propertyType")} label={t("fields.propertyType")}><select aria-describedby={message("propertyType") ? errorId("propertyType") : undefined} aria-invalid={Boolean(message("propertyType"))} className={inputClass} defaultValue={draft.propertyType ?? ""} name="propertyType"><option disabled value="">{t("fields.propertyTypePlaceholder")}</option>{data.propertyTypeOptions.map((item) => <option key={item} value={item}>{t(`propertyTypeOptions.${item}`)}</option>)}</select></Field><Field error={message("surface")} errorId={errorId("surface")} label={t("fields.surface")}><input aria-describedby={message("surface") ? errorId("surface") : undefined} aria-invalid={Boolean(message("surface"))} className={inputClass} defaultValue={draft.surface ?? ""} min="1" name="surface" type="number" /><label className="mt-3 flex min-h-11 items-center gap-2"><input defaultChecked={draft.surfaceUnknown} name="surfaceUnknown" type="checkbox" />{t("fields.surfaceUnknown")}</label></Field><Field error={message("description")} errorId={errorId("description")} label={t("fields.description")}><textarea aria-describedby={message("description") ? errorId("description") : undefined} aria-invalid={Boolean(message("description"))} className={`${inputClass} min-h-40 py-3`} defaultValue={draft.description ?? ""} maxLength={2000} name="description" placeholder={t("fields.descriptionPlaceholder")} /></Field></div>;
  if (step === 4 || step === 5) { const name = step === 4 ? "budgetRange" : "timeline"; const selected = step === 4 ? draft.budgetRange : draft.timeline; const values = step === 4 ? data.budgetOptions : data.timelineOptions; const prefix = step === 4 ? "budgetOptions" : "timelineOptions"; return <fieldset aria-describedby={message(name) ? errorId(name) : undefined} className="mt-8 border-0 p-0"><legend className="sr-only">{t(`steps.${step}.title`)}</legend><div className="grid gap-3">{values.map((item) => <Choice key={item} checked={selected === item} label={t(`${prefix}.${item}`)} name={name} value={item} />)}</div>{message(name) ? <ErrorText id={errorId(name)}>{message(name)}</ErrorText> : null}</fieldset>; }
  const chooseImages = (files: FileList | null) => { if (!files) return; const selected = Array.from(files).slice(0, Math.max(0, data.limits.maxImages - draft.images.length - images.length)); if (selected.some((file) => !imageTypes.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024)) { setError(t("validation.image")); return; } setImages((current) => [...current, ...selected.map((file) => ({ file, url: URL.createObjectURL(file) }))]); };
  const chooseDocs = (files: FileList | null) => { if (!files) return; const selected = Array.from(files).slice(0, Math.max(0, data.limits.maxDocuments - draft.attachments.length - documents.length)); if (selected.some((file) => file.type !== "application/pdf" || file.size < 1 || file.size > 15 * 1024 * 1024)) { setError(t("validation.document")); return; } setDocuments((current) => [...current, ...selected]); };
  return <div className="mt-8 grid gap-7"><section><h2 className="text-base font-semibold text-ink">{t("files.imagesTitle")}</h2><p className="text-sm leading-6 text-muted">{t("files.imagesHelp")}</p><label className="mt-4 flex min-h-28 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-brand/50 bg-brand-soft/40 px-5 text-sm font-semibold text-brand">{t("files.chooseImages")}<input accept="image/jpeg,image/png,image/webp" className="sr-only" multiple onChange={(e) => chooseImages(e.currentTarget.files)} type="file" /></label><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{draft.images.map((item) => item.url ? <div className="relative aspect-square overflow-hidden rounded-xl" key={item.id}><Image alt={t("files.existingImageAlt")} fill src={item.url} /></div> : null)}{images.map((item, index) => <div className="relative aspect-square overflow-hidden rounded-xl" key={item.url}><Image alt={t("files.previewAlt", { number: index + 1 })} fill src={item.url} unoptimized /><button aria-label={t("files.removeImage", { number: index + 1 })} className="absolute top-2 right-2 size-11 rounded-full bg-white" onClick={() => { URL.revokeObjectURL(item.url); setImages((current) => current.filter((_, i) => i !== index)); }} type="button">×</button></div>)}</div></section><section className="border-t border-brand-border pt-7"><h2 className="text-base font-semibold text-ink">{t("files.documentsTitle")}</h2><p className="text-sm leading-6 text-muted">{t("files.documentsHelp")}</p><label className="mt-4 inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-brand-border px-4 text-sm font-semibold">{t("files.chooseDocuments")}<input accept="application/pdf" className="sr-only" multiple onChange={(e) => chooseDocs(e.currentTarget.files)} type="file" /></label><ul className="mt-4 grid list-none gap-2 p-0">{draft.attachments.map((item) => <li key={item.id}>{item.fileName}</li>)}{documents.map((item, index) => <li className="flex items-center justify-between rounded-xl bg-surface-muted px-4 py-2" key={`${item.name}-${item.lastModified}`}><span>{item.name}</span><button className="min-h-11 text-brand" onClick={() => setDocuments((current) => current.filter((_, i) => i !== index))} type="button">{t("remove")}</button></li>)}</ul></section></div>;
}

function Review({ draft, t, onEdit, onPublish, publishing, error }: { draft: Draft; t: Translate; onEdit: (step: Step) => void; onPublish: () => void; publishing: boolean; error: string | null }) {
  const category = draft.primaryCategory
    ? `${t(`categoryOptions.${draft.primaryCategory}`)}${draft.primaryCategory === "other" && draft.customCategoryText ? ` · ${draft.customCategoryText}` : ""}`
    : t("notProvided");
  const details = (
    <div className="grid gap-1.5">
      <strong className="font-semibold text-ink">{draft.title ?? t("notProvided")}</strong>
      <span>
        {draft.propertyType ? t(`propertyTypeOptions.${draft.propertyType}`) : t("notProvided")}
        {" · "}
        {draft.surfaceUnknown ? t("fields.surfaceUnknown") : draft.surface ? `${draft.surface} m²` : t("notProvided")}
      </span>
      <span>{draft.description ?? t("notProvided")}</span>
    </div>
  );
  const rows: Array<{ step: Step; label: string; value: ReactNode }> = [
    { step: 1, label: t("review.category"), value: category },
    { step: 2, label: t("review.location"), value: [draft.city ? t(`cityOptions.${draft.city}`) : null, draft.neighborhood].filter(Boolean).join(" · ") || t("notProvided") },
    { step: 3, label: t("review.details"), value: details },
    { step: 4, label: t("review.budget"), value: draft.budgetRange ? t(`budgetOptions.${draft.budgetRange}`) : t("notProvided") },
    { step: 5, label: t("review.timeline"), value: draft.timeline ? t(`timelineOptions.${draft.timeline}`) : t("notProvided") },
    { step: 6, label: t("review.files"), value: t("review.fileCount", { images: draft.images.length, documents: draft.attachments.length }) },
  ];
  return (
    <section className="rounded-3xl border border-brand-border bg-white p-5 sm:p-9">
      <p className="text-xs font-semibold tracking-widest text-brand uppercase">{t("review.eyebrow")}</p>
      <h1 className="mt-3 text-3xl font-semibold text-ink">{t("review.title")}</h1>
      <p className="leading-7 text-muted">{t("review.lead")}</p>
      <div className="mt-7 divide-y divide-brand-border border-y border-brand-border">
        {rows.map((row) => (
          <article className="grid gap-3 py-5 sm:grid-cols-[140px_1fr_auto]" key={row.label}>
            <h2 className="text-sm font-semibold">{row.label}</h2>
            <div className="text-sm leading-6 text-muted">{row.value}</div>
            <button className="min-h-11 text-sm font-semibold text-brand" onClick={() => onEdit(row.step)} type="button">{t("edit")}</button>
          </article>
        ))}
      </div>
      {error ? <div className="mt-6"><FriendlyAlert>{error}</FriendlyAlert></div> : null}
      <div className="mt-7 flex justify-end"><button className="button button-primary min-h-12" disabled={publishing} onClick={onPublish} type="button">{publishing ? t("publishing") : t("publish")}</button></div>
    </section>
  );
}

function Actions({ step, disabled, uploading, t, onBack, onSave }: { step: Exclude<Step, 7>; disabled: boolean; uploading: boolean; t: Translate; onBack: () => void; onSave: () => void }) { return <div className="sticky bottom-0 z-20 -mx-5 mt-6 border-t border-brand-border bg-white/95 px-5 py-4 sm:mx-0 sm:flex sm:justify-between sm:border-0 sm:bg-transparent sm:px-0"><button className="min-h-12 px-3 font-semibold disabled:opacity-40" disabled={step === 1 || disabled} onClick={onBack} type="button">{t("back")}</button><div className="grid grid-cols-2 gap-3"><button className="min-h-12 rounded-xl border border-brand-border px-4 font-semibold" disabled={disabled} onClick={onSave} type="button">{t("saveAndExit")}</button><button className="button button-primary min-h-12" disabled={disabled} type="submit">{disabled ? t(uploading ? "uploading" : "saving") : step === 6 ? t("reviewProject") : t("continue")}</button></div></div>; }
function Choice({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) { return <label className="group flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-brand-border px-4 py-3 font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft focus-within:outline-2 focus-within:outline-brand"><input className="size-5 accent-brand" defaultChecked={checked} name={name} type="radio" value={value} />{label}<span aria-hidden className="ml-auto opacity-0 group-has-[:checked]:opacity-100">✓</span></label>; }
const inputClass = "mt-2 min-h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
function Field({ label, optional, error, errorId, children }: { label: string; optional?: string; error?: string; errorId?: string; children: ReactNode }) { return <label className="mt-5 block text-sm font-semibold text-ink">{label}{optional ? <span className="ml-1 font-normal text-muted">({optional})</span> : null}{children}{error ? <ErrorText id={errorId}>{error}</ErrorText> : null}</label>; }
function ErrorText({ children, id }: { children: ReactNode; id?: string }) { return <span className="mt-2 block text-sm font-medium text-red-700" id={id} role="alert">{children}</span>; }
export function ProjectWizardSkeleton({ label, progressLabel }: { label: string; progressLabel: string }) { return <><OnboardingChrome progressLabel={progressLabel} progressValue={15} /><main className="mx-auto w-full max-w-[820px] flex-1 px-5 py-10"><FormSkeleton label={label} /></main></>; }
