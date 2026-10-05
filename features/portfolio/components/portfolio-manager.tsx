"use client";

import { ApprovedPortfolioImage } from "@/features/portfolio/components/approved-portfolio-image";

import { useAuthToken } from "@convex-dev/auth/react";
import { CompanyOwnerPortfolioImages } from "./company-owner-portfolio-images";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/features/shared/components/app-feedback";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { DashboardCardsSkeleton } from "@/features/shared/components/skeletons";
import {
  StatusBadge,
  WorkspacePage,
  WorkspacePageHeader,
  workspaceButton,
  type BadgeTone,
} from "@/features/shared/components/workspace-page";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { mapConvexFailure } from "@/lib/errors";

const projectTypes = ["construction", "renovation", "structural", "finishing", "interior", "exterior", "other"] as const;
type ProjectType = (typeof projectTypes)[number];
type ManagerData = FunctionReturnType<typeof api.portfolio.index.getPortfolioManager>;
type PortfolioProject = ManagerData["projects"][number];

const STATUS_TONE: Record<PortfolioProject["status"], BadgeTone> = {
  published: "success",
  draft: "warning",
  hidden: "neutral",
};

export function PortfolioManager() {
  const token = useAuthToken();
  const user = useQuery(api.users.currentUser);
  const tUx = useTranslations("ux");
  const router = useRouter();
  const eligible = !!token && user?.accountType === "company" && user.onboardingStatus === "completed";
  const access = useQuery(api.companyVerification.index.getVerificationStatus, eligible ? {} : "skip");
  useEffect(() => {
    if (user && !(user.accountType === "company" && user.onboardingStatus === "completed")) router.replace(workspaceRouteForUser(user));
  }, [router, user]);
  if (!eligible || access === undefined) return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;
  if (!access?.canManageDocuments) return <FriendlyAlert>{tUx("error.codes.COMPANY_OWNER_REQUIRED")}</FriendlyAlert>;
  return <OwnerPortfolioManager key={`${user._id}:${token}`} />;
}

function OwnerPortfolioManager() {
  const t = useTranslations("portfolioManager");
  const tImages = useTranslations("portfolioImages");
  const tUx = useTranslations("ux");
  const data = useQuery(api.portfolio.index.getPortfolioManager, {});
  const ensurePublicSlug = useMutation(api.portfolio.index.ensurePublicSlug);
  const publish = useMutation(api.portfolio.index.publishPortfolioProject);
  const archive = useMutation(api.portfolio.index.archivePortfolioProject);
  const { showToast } = useToast();
  const slugRequested = useRef(false);
  const formRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState<PortfolioProject | "new" | null>(null);
  const [pendingId, setPendingId] = useState<Id<"portfolioProjects"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || data.companySlug || slugRequested.current) return;
    slugRequested.current = true;
    void ensurePublicSlug().catch((caught) => setError(mapConvexFailure(caught, tUx).message));
  }, [data, ensurePublicSlug, tUx]);

  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);

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

  if (data === undefined) return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        actions={
          <>
            {data.companySlug ? (
              <Link className={workspaceButton.secondary} href={{ pathname: "/entreprises/[slug]", params: { slug: data.companySlug } }}>
                {t("viewProfile")}
              </Link>
            ) : null}
            <button className={workspaceButton.primary} onClick={() => setEditing("new")} type="button">
              <PlusIcon />
              {t("add")}
            </button>
          </>
        }
        lead={t("lead")}
        title={t("title")}
      />

      <p className="mt-4 text-sm leading-6 text-muted">{tImages("publicationHelp")}</p>
      {error ? <div className="mt-6"><FriendlyAlert>{error}</FriendlyAlert></div> : null}
      {editing ? (
        <PortfolioForm
          key={editing === "new" ? "new" : editing.id}
          onClose={() => setEditing(null)}
          project={editing === "new" ? null : data.projects.find(project => project.id === editing.id) ?? editing}
          projects={data.projects}
          sectionRef={formRef}
        />
      ) : null}

      <section aria-labelledby="portfolio-list" className="mt-8">
        <h2 className="sr-only" id="portfolio-list">{t("listTitle")}</h2>
        <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((project) => (
            <li key={project.id}>
              <PortfolioCard
                busy={pendingId === project.id}
                onArchive={() => void changeStatus(project, "hidden")}
                onEdit={() => setEditing(project)}
                onPublish={() => void changeStatus(project, "published")}
                project={project}
              />
            </li>
          ))}
          {/* An add tile keeps a sparse portfolio from leaving one card adrift in an empty canvas. */}
          <li className={data.projects.length === 0 ? "sm:col-span-2 lg:col-span-3" : undefined}>
            <button
              className="group flex h-full min-h-72 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-border bg-white/60 px-6 py-10 text-center transition-colors hover:border-brand/50 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => setEditing("new")}
              type="button"
            >
              <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand transition-transform group-hover:scale-105">
                <PlusIcon className="size-5" />
              </span>
              <span className="text-[0.95rem] font-semibold text-ink">{data.projects.length === 0 ? t("empty") : t("add")}</span>
              <span className="max-w-xs text-sm leading-6 text-muted">{t("addTileLead")}</span>
            </button>
          </li>
        </ul>
      </section>
    </WorkspacePage>
  );
}

function PortfolioCard({
  project,
  busy,
  onEdit,
  onPublish,
  onArchive,
}: {
  project: PortfolioProject;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  const t = useTranslations("portfolioManager");
  const format = useFormatter();
  const facts = [
    project.city,
    project.year ? String(project.year) : null,
    project.surface ? t("surfaceValue", { value: format.number(project.surface) }) : null,
  ].filter(Boolean);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-brand-border bg-white transition-shadow duration-200 hover:shadow-[0_12px_32px_rgb(23_61_99/0.10)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-brand-soft">
        <ApprovedPortfolioImage
          alt={t("imageAlt", { title: project.title })}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
          url={project.coverImageUrl}
        />
        <div className="absolute top-3 left-3">
          <StatusBadge tone={STATUS_TONE[project.status]}>{t(`status.${project.status}`)}</StatusBadge>
        </div>
        {project.media.length > 0 ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-[#0f1f2e]/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            {t("photoCount", { count: project.media.length + 1 })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-4 pt-4 pb-3">
        <p className="m-0 text-xs font-semibold text-brand">{t(`projectType.${project.projectType}`)}</p>
        <h3 className="mt-1 mb-0 line-clamp-1 text-base font-semibold tracking-[-0.01em] text-ink">{project.title}</h3>
        <p className="mt-1 mb-0 text-sm text-muted">{facts.join(" · ")}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <button className={workspaceButton.ghost} disabled={busy} onClick={onEdit} type="button">
            {t("edit")}
          </button>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger
              aria-label={t("moreActions", { title: project.title })}
              className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted transition-colors hover:bg-brand-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              disabled={busy}
            >
              <MoreIcon />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-[60] min-w-44 rounded-[12px] border border-brand-border bg-white p-1.5 shadow-[0_14px_40px_rgb(23_61_99_/_0.14)]"
                sideOffset={6}
              >
                {project.status !== "published" ? (
                  <DropdownMenu.Item
                    className="flex min-h-10 cursor-pointer items-center rounded-[8px] px-3 text-sm text-ink outline-none data-[highlighted]:bg-brand-soft data-[highlighted]:text-brand"
                    onSelect={onPublish}
                  >
                    {t("publish")}
                  </DropdownMenu.Item>
                ) : null}
                {project.status !== "hidden" ? (
                  <DropdownMenu.Item
                    className="flex min-h-10 cursor-pointer items-center rounded-[8px] px-3 text-sm text-[#9b2c20] outline-none data-[highlighted]:bg-[#fde8e6]"
                    onSelect={onArchive}
                  >
                    {t("archive")}
                  </DropdownMenu.Item>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </article>
  );
}

function PortfolioForm({
  project,
  onClose,
  sectionRef,
  projects,
}: {
  projects: PortfolioProject[];
  project: PortfolioProject | null;
  onClose: () => void;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("portfolioManager");
  const tUx = useTranslations("ux");
  const createProject = useMutation(api.portfolio.index.createPortfolioProject);
  const updateProject = useMutation(api.portfolio.index.updatePortfolioProject);
  const tImages = useTranslations("portfolioImages");
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<Id<"portfolioProjects"> | null>(null);
  const saveRequest = useRef<AbortController | null>(null);
  const currentProject = project ?? projects.find(item => item.id === createdId) ?? null;
  const projectId = project?.id ?? createdId;
  useEffect(() => () => { saveRequest.current?.abort(); }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveRequest.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const optionalNumber = (name: string) => { const value = String(values.get(name) ?? "").trim(); return value ? Number(value) : undefined; };
    const controller = new AbortController(); saveRequest.current = controller;
    setSubmitting(true);
    setError(null);
    try {
      const fields = {
        title: String(values.get("title") ?? ""), description: String(values.get("description") ?? ""), city: String(values.get("city") ?? ""),
        projectType: String(values.get("projectType") ?? "construction") as ProjectType,
        surface: optionalNumber("surface"), durationMonths: optionalNumber("durationMonths"), year: optionalNumber("year"),
      };
      if (projectId) await updateProject({ ...fields, projectId });
      else {
        const id = await createProject(fields);
        if (!controller.signal.aborted) setCreatedId(id);
      }
      if (!controller.signal.aborted) showToast(t(projectId ? "successUpdated" : "successCreated"));
    } catch (caught) {
      if (!controller.signal.aborted) setError(mapConvexFailure(caught, tUx).message);
    } finally {
      if (!controller.signal.aborted) { saveRequest.current = null; setSubmitting(false); }
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-[10px] border border-brand-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";
  const labelClass = "block text-sm font-medium text-ink";

  return (
    <section
      aria-labelledby="portfolio-form-title"
      className="mt-8 scroll-mt-24 rounded-2xl border border-brand-border bg-white"
      ref={sectionRef}
    >
      <div className="flex items-start justify-between gap-4 border-b border-brand-border px-5 py-4 sm:px-7">
        <div>
          <h2 className="m-0 text-lg leading-6 font-semibold tracking-[-0.02em] text-ink" id="portfolio-form-title">
            {t(projectId ? "editTitle" : "addTitle")}
          </h2>
          <p className="mt-1 mb-0 text-sm leading-6 text-muted">{t("formLead")}</p>
        </div>
        <button aria-label={t("cancel")} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:bg-brand-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={onClose} type="button">
          <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <FormSection lead={t("sections.basicsLead")} title={t("sections.basics")}>
          <label className={`${labelClass} sm:col-span-2`}>{t("fields.title")}<input className={inputClass} defaultValue={project?.title} maxLength={120} minLength={2} name="title" placeholder={t("placeholders.title")} required /></label>
          <label className={`${labelClass} sm:col-span-2`}>{t("fields.description")}<textarea className={`${inputClass} min-h-28 resize-y`} defaultValue={project?.description} maxLength={1200} minLength={20} name="description" placeholder={t("placeholders.description")} required /></label>
          <label className={labelClass}>{t("fields.city")}<input className={inputClass} defaultValue={project?.city} maxLength={80} minLength={2} name="city" required /></label>
          <label className={labelClass}>{t("fields.projectType")}<select className={inputClass} defaultValue={project?.projectType ?? "construction"} name="projectType">{projectTypes.map((type) => <option key={type} value={type}>{t(`projectType.${type}`)}</option>)}</select></label>
        </FormSection>

        <FormSection columns={3} lead={t("sections.detailsLead")} title={t("sections.details")}>
          <label className={labelClass}>{t("fields.surface")}<input className={inputClass} defaultValue={project?.surface ?? ""} inputMode="numeric" min="1" name="surface" step="1" type="number" /></label>
          <label className={labelClass}>{t("fields.duration")}<input className={inputClass} defaultValue={project?.durationMonths ?? ""} inputMode="numeric" min="1" name="durationMonths" step="1" type="number" /></label>
          <label className={labelClass}>{t("fields.year")}<input className={inputClass} defaultValue={project?.year ?? ""} inputMode="numeric" max={new Date().getFullYear()} min="1900" name="year" step="1" type="number" /></label>
        </FormSection>

        {error ? <div className="px-5 pb-2 sm:px-7"><FriendlyAlert>{error}</FriendlyAlert></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border px-5 py-4 sm:px-7">
          <p className="m-0 text-xs text-muted">{projectId ? null : t("draftHint")}</p>
          <div className="flex flex-wrap gap-2.5">
            <button className={workspaceButton.secondary} onClick={onClose} type="button">{t("cancel")}</button>
            <button className={workspaceButton.primary} disabled={submitting} type="submit">{submitting ? t("saving") : t("saveDraft")}</button>
          </div>
        </div>
      </form>
      <FormSection lead={tImages("saveHelp")} title={t("sections.media")}>
        <div className="min-w-0 sm:col-span-2">
          {projectId ? <CompanyOwnerPortfolioImages portfolioProjectId={projectId} publicUrls={[currentProject?.coverImageUrl, ...(currentProject?.media.map(image => image.url) ?? [])].filter((url): url is string => !!url)} /> : <p className="m-0 text-sm leading-6 text-muted">{tImages("saveFirst")}</p>}
        </div>
      </FormSection>
    </section>
  );
}

function FormSection({ title, lead, columns = 2, children }: { title: string; lead: string; columns?: 2 | 3; children: ReactNode }) {
  const titleId = useId();
  return (
    <div aria-labelledby={titleId} className="grid gap-x-8 gap-y-4 border-b border-brand-border px-5 py-6 sm:px-7 lg:grid-cols-[220px_1fr]" role="group">
      <div>
        <h3 className="m-0 text-sm font-semibold text-ink" id={titleId}>{title}</h3>
        <p className="mt-1 mb-0 text-xs leading-5 text-muted">{lead}</p>
      </div>
      <div className={`grid min-w-0 gap-4 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>{children}</div>
    </div>
  );
}

function PlusIcon({ className = "size-4" }: { className?: string }) {
  return <svg aria-hidden className={className} fill="none" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>;
}
function MoreIcon() {
  return <svg aria-hidden className="size-5" fill="currentColor" viewBox="0 0 20 20"><circle cx="4.5" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="15.5" cy="10" r="1.4" /></svg>;
}
