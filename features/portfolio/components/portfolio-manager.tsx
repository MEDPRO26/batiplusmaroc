"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/features/shared/components/app-feedback";
import { EmptyState, FriendlyAlert } from "@/features/shared/components/error-state";
import { DashboardCardsSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { mapConvexFailure } from "@/lib/errors";

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageBytes = 10 * 1024 * 1024;
const maxExtraImages = 8;
const projectTypes = ["construction", "renovation", "structural", "finishing", "interior", "exterior", "other"] as const;
type ProjectType = (typeof projectTypes)[number];
type ManagerData = FunctionReturnType<typeof api.portfolio.index.getPortfolioManager>;
type PortfolioProject = ManagerData["projects"][number];

export function PortfolioManager() {
  const t = useTranslations("portfolioManager");
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const data = useQuery(api.portfolio.index.getPortfolioManager, canLoad ? {} : "skip");
  const ensurePublicSlug = useMutation(api.portfolio.index.ensurePublicSlug);
  const publish = useMutation(api.portfolio.index.publishPortfolioProject);
  const archive = useMutation(api.portfolio.index.archivePortfolioProject);
  const router = useRouter();
  const { showToast } = useToast();
  const slugRequested = useRef(false);
  const [editing, setEditing] = useState<PortfolioProject | "new" | null>(null);
  const [pendingId, setPendingId] = useState<Id<"portfolioProjects"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!(user.accountType === "company" && user.onboardingStatus === "completed")) {
      router.replace(workspaceRouteForUser(user));
    }
  }, [router, user]);

  useEffect(() => {
    if (!data || data.companySlug || slugRequested.current) return;
    slugRequested.current = true;
    void ensurePublicSlug().catch((caught) => setError(mapConvexFailure(caught, tUx).message));
  }, [data, ensurePublicSlug, tUx]);

  async function changeStatus(project: PortfolioProject, next: "published" | "hidden") {
    setPendingId(project.id);
    setError(null);
    try {
      if (next === "published") await publish({ projectId: project.id });
      else await archive({ projectId: project.id });
      showToast(t(next === "published" ? "successPublished" : "successArchived"));
    } catch (caught) {
      setError(mapConvexFailure(caught, tUx).message);
    } finally {
      setPendingId(null);
    }
  }

  if (!user || !canLoad || data === undefined) return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;

  return (
    <main className="mx-auto flex w-full max-w-[1060px] flex-1 flex-col px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="m-0 text-xs font-semibold tracking-[0.16em] text-brand uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 mb-0 text-[1.5rem] leading-7 font-semibold tracking-[-0.03em] text-ink sm:text-[1.75rem]">{t("title")}</h1>
          <p className="mt-2 mb-0 max-w-[620px] text-[0.98rem] leading-6 text-muted">{t("lead")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {data.companySlug ? <Link className="button border border-brand-border bg-white text-ink active:scale-[0.96]" href={{ pathname: "/entreprises/[slug]", params: { slug: data.companySlug } }}>{t("viewProfile")}</Link> : null}
          <button className="button button-primary active:scale-[0.96]" onClick={() => setEditing("new")} type="button">{t("add")}</button>
        </div>
      </header>

      {error ? <div className="mt-6"><FriendlyAlert>{error}</FriendlyAlert></div> : null}
      {editing ? <PortfolioForm onClose={() => setEditing(null)} project={editing === "new" ? null : editing} /> : null}

      <section aria-labelledby="portfolio-list" className="mt-10">
        <h2 className="sr-only" id="portfolio-list">{t("listTitle")}</h2>
        {data.projects.length === 0 ? (
          <EmptyState actionLabel={t("add")} className="text-center" title={t("empty")} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.projects.map((project) => (
              <article className="overflow-hidden rounded-2xl border border-brand-border bg-white" key={project.id}>
                <div className="relative aspect-[4/3] bg-brand-soft outline outline-1 outline-black/10"><Image alt={t("imageAlt", { title: project.title })} className="object-cover" fill sizes="(max-width: 640px) 100vw, 50vw" src={project.coverImageUrl} /></div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="m-0 text-xs font-semibold text-brand">{t(`projectType.${project.projectType}`)}</p><h3 className="mt-1.5 mb-0 text-base font-semibold tracking-[-0.02em]">{project.title}</h3></div>
                    <StatusBadge status={project.status} label={t(`status.${project.status}`)} />
                  </div>
                  <p className="mt-2 mb-0 line-clamp-2 text-sm leading-6 text-muted">{project.description}</p>
                  <p className="mt-3 mb-0 text-xs text-muted">{[project.city, project.year].filter(Boolean).join(" · ")}</p>
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-brand-border pt-4">
                    <button className="min-h-10 rounded-lg border border-brand-border px-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-brand-soft disabled:opacity-50" disabled={pendingId === project.id} onClick={() => setEditing(project)} type="button">{t("edit")}</button>
                    {project.status !== "published" ? <button className="min-h-10 rounded-lg bg-brand px-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-hover disabled:opacity-50" disabled={pendingId === project.id} onClick={() => void changeStatus(project, "published")} type="button">{t("publish")}</button> : null}
                    {project.status !== "hidden" ? <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted transition-colors duration-150 hover:bg-[#f8e8e6] hover:text-[#8a2f28] disabled:opacity-50" disabled={pendingId === project.id} onClick={() => void changeStatus(project, "hidden")} type="button">{t("archive")}</button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PortfolioForm({ project, onClose }: { project: PortfolioProject | null; onClose: () => void }) {
  const t = useTranslations("portfolioManager");
  const tUx = useTranslations("ux");
  const createProject = useMutation(api.portfolio.index.createPortfolioProject);
  const updateProject = useMutation(api.portfolio.index.updatePortfolioProject);
  const requestUpload = useAction(api.storage.r2.requestPublicMediaUpload);
  const verifyUpload = useAction(api.storage.r2.verifyPublicMediaUpload);
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(project?.coverImageUrl ?? null);

  useEffect(() => () => {
    if (coverPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(coverPreviewUrl);
  }, [coverPreviewUrl]);

  async function upload(file: File, kind: "cover" | "media") {
    if (!imageTypes.includes(file.type) || file.size < 1 || file.size > maxImageBytes) throw new Error("INVALID_PORTFOLIO_IMAGE");
    const intent = await requestUpload({
      purpose: kind === "cover" ? "portfolioCover" : "portfolioMedia",
      contentType: file.type,
      size: file.size,
      portfolioProjectId: project?.id,
    });
    const response = await fetch(intent.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!response.ok) throw new Error("INVALID_PORTFOLIO_IMAGE");
    await verifyUpload({ uploadToken: intent.uploadToken });
    return { uploadToken: intent.uploadToken };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const coverValue = values.get("coverImage");
    const coverFile = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
    const extras = values.getAll("extraImages").filter((file): file is File => file instanceof File && file.size > 0);
    if (!project && !coverFile) { setError(t("coverRequired")); return; }
    if (extras.length > maxExtraImages) { setError(t("tooManyImages", { count: maxExtraImages })); return; }
    const optionalNumber = (name: string) => { const value = String(values.get(name) ?? "").trim(); return value ? Number(value) : undefined; };
    setSubmitting(true);
    setError(null);
    try {
      const [coverImage, extraImages] = await Promise.all([
        coverFile ? upload(coverFile, "cover") : Promise.resolve(undefined),
        Promise.all(extras.map((file) => upload(file, "media"))),
      ]);
      const fields = {
        title: String(values.get("title") ?? ""), description: String(values.get("description") ?? ""), city: String(values.get("city") ?? ""),
        projectType: String(values.get("projectType") ?? "construction") as ProjectType,
        surface: optionalNumber("surface"), durationMonths: optionalNumber("durationMonths"), year: optionalNumber("year"), extraImages,
      };
      if (project) await updateProject({ ...fields, projectId: project.id, coverImage });
      else if (coverImage) await createProject({ ...fields, coverImage });
      showToast(t(project ? "successUpdated" : "successCreated"));
      onClose();
    } catch (caught) {
      setError(mapConvexFailure(caught, tUx).message);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "mt-1.5 w-full rounded-[10px] border border-brand-border bg-white px-3.5 py-3 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";
  return (
    <section className="mt-8 rounded-2xl border border-brand-border bg-white p-5 shadow-[0_10px_30px_rgb(23_61_99/0.06)] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg leading-6 font-semibold tracking-[-0.02em] text-ink">{t(project ? "editTitle" : "addTitle")}</h2>
          <p className="mt-1.5 mb-0 text-sm leading-6 text-muted">{t("formLead")}</p>
        </div>
        <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-brand-soft" onClick={onClose} type="button">{t("cancel")}</button>
      </div>
      <form className="mt-6 grid gap-5" onSubmit={onSubmit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink sm:col-span-2">{t("fields.title")}<input className={inputClass} defaultValue={project?.title} maxLength={120} minLength={2} name="title" required /></label>
          <label className="text-sm font-medium text-ink sm:col-span-2">{t("fields.description")}<textarea className={`${inputClass} min-h-28 resize-y`} defaultValue={project?.description} maxLength={1200} minLength={20} name="description" required /></label>
          <label className="text-sm font-medium text-ink">{t("fields.city")}<input className={inputClass} defaultValue={project?.city} maxLength={80} minLength={2} name="city" required /></label>
          <label className="text-sm font-medium text-ink">{t("fields.projectType")}<select className={inputClass} defaultValue={project?.projectType ?? "construction"} name="projectType">{projectTypes.map((type) => <option key={type} value={type}>{t(`projectType.${type}`)}</option>)}</select></label>
          <label className="text-sm font-medium text-ink">{t("fields.surface")}<input className={inputClass} defaultValue={project?.surface ?? ""} min="1" name="surface" step="1" type="number" /></label>
          <label className="text-sm font-medium text-ink">{t("fields.duration")}<input className={inputClass} defaultValue={project?.durationMonths ?? ""} min="1" name="durationMonths" step="1" type="number" /></label>
          <label className="text-sm font-medium text-ink">{t("fields.year")}<input className={inputClass} defaultValue={project?.year ?? ""} max={new Date().getFullYear()} min="1900" name="year" step="1" type="number" /></label>
          <label className="text-sm font-medium text-ink">{t("fields.cover", { optional: project ? t("optional") : "" })}<input accept={imageTypes.join(",")} className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand`} name="coverImage" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setCoverPreviewUrl(file ? URL.createObjectURL(file) : project?.coverImageUrl ?? null);
          }} required={!project} type="file" /></label>
          {coverPreviewUrl ? <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-brand-border bg-brand-soft sm:col-span-2"><Image alt={t("previewAlt")} className="object-cover" fill sizes="(max-width: 640px) 100vw, 640px" src={coverPreviewUrl} unoptimized={coverPreviewUrl.startsWith("blob:")} /></div> : null}
          <label className="text-sm font-medium text-ink sm:col-span-2">{t("fields.extra")}<input accept={imageTypes.join(",")} className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand`} multiple name="extraImages" type="file" /><span className="mt-1.5 block text-xs font-normal text-muted">{t("imageHelp", { count: maxExtraImages })}</span></label>
        </div>
        {error ? <FriendlyAlert>{error}</FriendlyAlert> : null}
        <div className="flex flex-wrap justify-end gap-3"><button className="button border border-brand-border bg-white text-ink" onClick={onClose} type="button">{t("cancel")}</button><button className="button button-primary disabled:cursor-wait disabled:opacity-60" disabled={submitting} type="submit">{submitting ? t("saving") : t("saveDraft")}</button></div>
      </form>
    </section>
  );
}

function StatusBadge({ status, label }: { status: PortfolioProject["status"]; label: string }) {
  const tone = status === "published" ? "bg-emerald-50 text-emerald-800" : status === "hidden" ? "bg-[#eef1f4] text-muted" : "bg-[#f4eee3] text-[#6a4c1d]";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${tone}`}>{label}</span>;
}
