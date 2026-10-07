"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { OnboardingChrome } from "@/features/auth/components/onboarding-chrome";
import { useToast } from "@/features/shared/components/app-feedback";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { FormSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { mapConvexFailure } from "@/lib/errors";
import { createSubmitLock, focusFirstInvalidField } from "@/lib/forms/submit";
import { routes } from "@/lib/routes";

/** Five wizard screens: 1–4 collect answers, 5 is review + publish. */
const totalSteps = 5;
type Wizard = FunctionReturnType<typeof api.projects.index.getWizard>;
type Draft = NonNullable<Wizard["draft"]>;
type Step = 1 | 2 | 3 | 4 | 5;
type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Screen order. Step numbers stay the saved sections (1 category, 2 location,
 * 3 details, 4 timeline, 5 review); only the order they are asked in changes,
 * so the project is named and described first.
 */
export const WIZARD_ORDER: readonly Step[] = [3, 2, 1, 4, 5];
const positionOf = (step: Step) => WIZARD_ORDER.indexOf(step) + 1;
const stepAfter = (step: Step) => WIZARD_ORDER[Math.min(WIZARD_ORDER.length - 1, WIZARD_ORDER.indexOf(step) + 1)];
const stepBefore = (step: Step) => WIZARD_ORDER[Math.max(0, WIZARD_ORDER.indexOf(step) - 1)];

/** First unanswered screen in display order; a complete draft opens on the review. */
export function wizardResumeStep(
  draft: Pick<Draft, "primaryCategory" | "customCategoryText" | "city" | "title" | "propertyType" | "surface" | "surfaceUnknown" | "description" | "timeline">,
): Step {
  const complete: Record<Exclude<Step, 5>, boolean> = {
    1: Boolean(draft.primaryCategory) && !(draft.primaryCategory === "other" && !draft.customCategoryText),
    2: Boolean(draft.city),
    3: Boolean(draft.title && draft.propertyType && draft.description) && (draft.surfaceUnknown || draft.surface !== null),
    4: Boolean(draft.timeline),
  };
  return WIZARD_ORDER.find((step) => step !== 5 && !complete[step]) ?? 5;
}

export function shouldInitializeDraft({
  submitted,
  canLoad,
  hasInitialProject,
  draftMissing,
  started,
}: {
  submitted: boolean;
  canLoad: boolean;
  hasInitialProject: boolean;
  draftMissing: boolean;
  started: boolean;
}) {
  return !submitted && canLoad && !hasInitialProject && draftMissing && !started;
}

export function ProjectWizard({ initialProjectId }: { initialProjectId?: Id<"projects"> }) {
  const typedT = useTranslations("projectWizard");
  const t: Translate = (key, values) => typedT(key as never, values as never);
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "client" && user.onboardingStatus === "completed";
  const wizard = useQuery(
    api.projects.index.getWizard,
    canLoad ? { projectId: initialProjectId } : "skip",
  );
  const initialize = useMutation(api.projects.index.initializeDraft);
  const saveCategory = useMutation(api.projects.index.saveCategory);
  const saveLocation = useMutation(api.projects.index.saveLocation);
  const saveDetails = useMutation(api.projects.index.saveDetails);
  const saveTimeline = useMutation(api.projects.index.saveTimeline);
  const publish = useMutation(api.projects.index.publishProject);
  const router = useRouter();
  const { showToast } = useToast();
  const started = useRef(false);
  const loadedDraft = useRef<string | null>(null);
  const lock = useRef(createSubmitLock());
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>(WIZARD_ORDER[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);

  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user && !(user.accountType === "client" && user.onboardingStatus === "completed")) {
      router.replace(workspaceRouteForUser(user));
    }
  }, [router, user]);

  useEffect(() => {
    if (shouldInitializeDraft({
      submitted,
      canLoad,
      hasInitialProject: Boolean(initialProjectId),
      draftMissing: wizard?.draft === null,
      started: started.current,
    })) {
      started.current = true;
      void initialize({}).catch((caught) => {
        started.current = false;
        setError(mapConvexFailure(caught, tUx).message);
      });
    }
  }, [canLoad, initialProjectId, initialize, submitted, tUx, wizard?.draft]);

  useEffect(() => {
    if (wizard?.draft && loadedDraft.current !== wizard.draft.id) {
      loadedDraft.current = wizard.draft.id;
      setStep(wizardResumeStep(wizard.draft));
    }
  }, [wizard?.draft]);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    if (!submitted) return;
    const timer = window.setTimeout(() => router.push(routes.clientDashboard), 2400);
    return () => window.clearTimeout(timer);
  }, [router, submitted]);

  const position = positionOf(step);
  const progressLabel = t("progress", { current: position, total: totalSteps });
  const progressValue = Math.round((position / totalSteps) * 100);

  if (submitted) {
    return (
      <>
        <OnboardingChrome progressLabel={t("progressComplete")} progressValue={100} />
        <main className="mx-auto flex w-full max-w-[680px] flex-1 items-center px-5 py-14">
          <section className="w-full rounded-sm border border-brand-border bg-white p-8 text-center sm:p-10" role="status">
            <span aria-hidden className="text-4xl text-emerald-700">✓</span>
            <h1 className="mt-5 text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-[-0.03em] text-ink">
              {t("success.title")}
            </h1>
            <p className="mt-3 leading-7 text-muted">{t("success.lead")}</p>
            <Link className="button button-primary mt-7" href={routes.clientDashboard}>
              {t("success.action")}
            </Link>
          </section>
        </main>
      </>
    );
  }

  if (!canLoad || wizard === undefined || wizard.draft === null) {
    return <ProjectWizardSkeleton label={t("loading")} progressLabel={progressLabel} />;
  }

  const data = wizard;
  const draft = data.draft;

  function fail(form: HTMLFormElement, name: string, message: string) {
    setFieldError({ name, message });
    focusFirstInvalidField(form, name);
    return false;
  }

  function go(next: Step) {
    setError(null);
    setFieldError(null);
    setStep(next);
  }

  async function persist(form: HTMLFormElement, exit = false) {
    if (!lock.current.tryAcquire()) return;
    setSaving(true);
    setError(null);
    setFieldError(null);
    const values = new FormData(form);
    try {
      if (step === 1) {
        const category = String(values.get("primaryCategory") ?? "") as Wizard["categoryOptions"][number];
        if (!data.categoryOptions.includes(category)) return fail(form, "primaryCategory", t("validation.category"));
        const custom = String(values.get("customCategoryText") ?? "").trim();
        if (category === "other" && custom.length < 3) {
          return fail(form, "customCategoryText", t("validation.customCategory"));
        }
        await saveCategory({
          projectId: draft.id,
          primaryCategory: category,
          customCategoryText: category === "other" ? custom : undefined,
        });
      } else if (step === 2) {
        const city = String(values.get("city") ?? "") as Wizard["cityOptions"][number];
        if (!data.cityOptions.includes(city)) return fail(form, "city", t("validation.city"));
        await saveLocation({
          projectId: draft.id,
          city,
          neighborhood: String(values.get("neighborhood") ?? ""),
        });
      } else if (step === 3) {
        const title = String(values.get("title") ?? "").trim();
        const description = String(values.get("description") ?? "").trim();
        const propertyType = String(values.get("propertyType") ?? "") as Wizard["propertyTypeOptions"][number];
        const surfaceUnknown = values.get("surfaceUnknown") === "on";
        const surface = String(values.get("surface") ?? "").trim();
        if (title.length < 5) return fail(form, "title", t("validation.title"));
        if (!data.propertyTypeOptions.includes(propertyType)) {
          return fail(form, "propertyType", t("validation.propertyType"));
        }
        if (!surfaceUnknown && (!surface || Number(surface) <= 0)) {
          return fail(form, "surface", t("validation.surface"));
        }
        if (description.length < 20) return fail(form, "description", t("validation.description"));
        await saveDetails({
          projectId: draft.id,
          title,
          propertyType,
          surfaceUnknown,
          surface: surfaceUnknown ? undefined : Number(surface),
          description,
        });
      } else if (step === 4) {
        const timeline = String(values.get("timeline") ?? "") as Wizard["timelineOptions"][number];
        if (!data.timelineOptions.includes(timeline)) return fail(form, "timeline", t("validation.timeline"));
        await saveTimeline({ projectId: draft.id, timeline });
      }

      if (exit) {
        showToast(t("draftSaved"));
        router.push(routes.clientDashboard);
      } else if (returnToReview) {
        setReturnToReview(false);
        go(5);
      } else {
        go(stepAfter(step));
      }
    } catch (caught) {
      const mapped = mapConvexFailure(caught, tUx);
      setError(mapped.message);
      if (mapped.field) {
        setFieldError({ name: mapped.field, message: mapped.message });
        focusFirstInvalidField(form, mapped.field);
      }
    } finally {
      setSaving(false);
      lock.current.release();
    }
  }

  async function submitProject() {
    if (!lock.current.tryAcquire()) return;
    setSaving(true);
    setError(null);
    started.current = true;
    try {
      await publish({ projectId: draft.id });
      setSubmitted(true);
      showToast(t("success.toast"));
    } catch (caught) {
      started.current = false;
      setError(mapConvexFailure(caught, tUx).message);
    } finally {
      setSaving(false);
      lock.current.release();
    }
  }

  const stepName = (value: Step) => t(`steps.${value}.eyebrow`);
  const footer = (
    <WizardFooter
      disabled={saving}
      first={position === 1}
      progressLabel={progressLabel}
      progressValue={progressValue}
      step={step}
      t={t}
      nextLabel={step < 5 ? t("nextStep", { step: stepName(stepAfter(step)) }) : ""}
      onBack={() => go(stepBefore(step))}
      onPublish={() => void submitProject()}
      onSave={() => {
        if (formRef.current) void persist(formRef.current, true);
      }}
    />
  );
  const intro = (
    <header className="min-w-0">
      <p className="m-0 flex items-center gap-4 text-sm text-muted">
        <span className="tabular-nums">{position}/{totalSteps}</span>
        <span>{stepName(step)}</span>
      </p>
      <h1
        className="mt-5 mb-0 text-[clamp(1.75rem,3.6vw,2.4rem)] leading-[1.1] font-semibold tracking-[-0.035em] text-balance text-ink outline-none"
        ref={headingRef}
        tabIndex={-1}
      >
        {t(`steps.${step}.title`)}
      </h1>
      <p className="mt-5 mb-0 max-w-md text-[0.95rem] leading-6 text-pretty text-muted">{t(`steps.${step}.lead`)}</p>
    </header>
  );

  return (
    <>
      <OnboardingChrome progressLabel={progressLabel} progressValue={progressValue} showProgress={false} />
      {/* Bottom padding keeps the last field clear of the fixed footer. */}
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-8 pb-40 sm:px-8 sm:pt-14 lg:pt-20">
        {step < 5 ? (
          <form
            className={WIZARD_GRID}
            noValidate
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void persist(event.currentTarget);
            }}
            ref={formRef}
          >
            {intro}
            <div className="min-w-0">
              <StepBody data={data} draft={draft} fieldError={fieldError} step={step as Exclude<Step, 5>} t={t} />
              {error ? (
                <div className="mt-6">
                  <FriendlyAlert>{error}</FriendlyAlert>
                </div>
              ) : null}
            </div>
            {footer}
          </form>
        ) : (
          <section className={WIZARD_GRID}>
            {intro}
            <Review
              draft={draft}
              error={error}
              t={t}
              onEdit={(editStep) => {
                setReturnToReview(true);
                go(editStep);
              }}
            />
            {footer}
          </section>
        )}
      </main>
    </>
  );
}

/** Question on the left, answer on the right; stacked on small screens. */
const WIZARD_GRID = "grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20";

function StepBody({
  step,
  draft,
  data,
  t,
  fieldError,
}: {
  step: Exclude<Step, 5>;
  draft: Draft;
  data: Wizard;
  t: Translate;
  fieldError: { name: string; message: string } | null;
}) {
  const message = (name: string) => (fieldError?.name === name ? fieldError.message : undefined);
  const errorId = (name: string) => `project-${name}-error`;

  if (step === 1) {
    return (
      <fieldset
        aria-describedby={message("primaryCategory") ? errorId("primaryCategory") : undefined}
        className="m-0 min-w-0 border-0 p-0"
      >
        <legend className="sr-only">{t("steps.1.title")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.categoryOptions.map((item) => (
            <Choice
              checked={draft.primaryCategory === item}
              key={item}
              label={t(`categoryOptions.${item}`)}
              name="primaryCategory"
              value={item}
            />
          ))}
        </div>
        {message("primaryCategory") ? (
          <ErrorText id={errorId("primaryCategory")}>{message("primaryCategory")}</ErrorText>
        ) : null}
        <div className="mt-6">
        <Field
          error={message("customCategoryText")}
          errorId={errorId("customCategoryText")}
          label={t("fields.customCategory")}
          optional={t("optional")}
        >
          <input
            aria-describedby={message("customCategoryText") ? errorId("customCategoryText") : undefined}
            aria-invalid={Boolean(message("customCategoryText"))}
            className={inputClass}
            defaultValue={draft.customCategoryText ?? ""}
            maxLength={120}
            name="customCategoryText"
            placeholder={t("fields.customCategoryPlaceholder")}
          />
        </Field>
        </div>
      </fieldset>
    );
  }

  if (step === 2) {
    return (
      <div className="grid gap-6">
        <Field error={message("city")} errorId={errorId("city")} label={t("fields.city")}>
          <select
            aria-describedby={message("city") ? errorId("city") : undefined}
            aria-invalid={Boolean(message("city"))}
            className={inputClass}
            defaultValue={draft.city ?? ""}
            name="city"
          >
            <option disabled value="">
              {t("fields.cityPlaceholder")}
            </option>
            {data.cityOptions.map((item) => (
              <option key={item} value={item}>
                {t(`cityOptions.${item}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("fields.neighborhood")} optional={t("optional")}>
          <input
            className={inputClass}
            defaultValue={draft.neighborhood ?? ""}
            maxLength={100}
            name="neighborhood"
          />
        </Field>
        <p className="m-0 text-sm leading-6 text-muted">{t("locationPrivacy")}</p>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="grid gap-6">
        <Field error={message("title")} errorId={errorId("title")} label={t("fields.title")}>
          <input
            aria-describedby={message("title") ? errorId("title") : undefined}
            aria-invalid={Boolean(message("title"))}
            className={inputClass}
            defaultValue={draft.title ?? ""}
            maxLength={120}
            name="title"
            placeholder={t("fields.titlePlaceholder")}
          />
        </Field>
        <div className="-mt-1 text-sm">
          <p className="m-0 font-semibold text-ink">{t("fields.titleExamplesTitle")}</p>
          <ul className="mt-2 mb-0 grid list-disc gap-1 pl-5 text-muted">
            <li>{t("fields.titleExample1")}</li>
            <li>{t("fields.titleExample2")}</li>
            <li>{t("fields.titleExample3")}</li>
          </ul>
        </div>
        <Field
          error={message("propertyType")}
          errorId={errorId("propertyType")}
          label={t("fields.propertyType")}
        >
          <select
            aria-describedby={message("propertyType") ? errorId("propertyType") : undefined}
            aria-invalid={Boolean(message("propertyType"))}
            className={inputClass}
            defaultValue={draft.propertyType ?? ""}
            name="propertyType"
          >
            <option disabled value="">
              {t("fields.propertyTypePlaceholder")}
            </option>
            {data.propertyTypeOptions.map((item) => (
              <option key={item} value={item}>
                {t(`propertyTypeOptions.${item}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field error={message("surface")} errorId={errorId("surface")} label={t("fields.surface")} optional={t("optional")}>
          <input
            aria-describedby={message("surface") ? errorId("surface") : undefined}
            aria-invalid={Boolean(message("surface"))}
            className={inputClass}
            defaultValue={draft.surface ?? ""}
            min="1"
            name="surface"
            type="number"
          />
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-normal text-ink">
            <input className="size-[18px] accent-brand" defaultChecked={draft.surfaceUnknown} name="surfaceUnknown" type="checkbox" />
            {t("fields.surfaceUnknown")}
          </label>
        </Field>
        <Field error={message("description")} errorId={errorId("description")} label={t("fields.description")}>
          <textarea
            aria-describedby={message("description") ? errorId("description") : undefined}
            aria-invalid={Boolean(message("description"))}
            className={`${inputClass} min-h-36 py-3`}
            defaultValue={draft.description ?? ""}
            maxLength={2000}
            name="description"
            placeholder={t("fields.descriptionPlaceholder")}
          />
        </Field>
      </div>
    );
  }

  const name = "timeline";
  const selected = draft.timeline;
  const values = data.timelineOptions;
  const prefix = "timelineOptions";

  return (
    <fieldset
      aria-describedby={message(name) ? errorId(name) : undefined}
      className="m-0 min-w-0 border-0 p-0"
    >
      <legend className="sr-only">{t(`steps.${step}.title`)}</legend>
      <div className="grid gap-3">
        {values.map((item) => (
          <Choice
            checked={selected === item}
            key={item}
            label={t(`${prefix}.${item}`)}
            name={name}
            value={item}
          />
        ))}
      </div>
      {message(name) ? <ErrorText id={errorId(name)}>{message(name)}</ErrorText> : null}
    </fieldset>
  );
}

function Review({
  draft,
  t,
  onEdit,
  error,
}: {
  draft: Draft;
  t: Translate;
  onEdit: (step: Exclude<Step, 5>) => void;
  error: string | null;
}) {
  const category = draft.primaryCategory
    ? `${t(`categoryOptions.${draft.primaryCategory}`)}${
        draft.primaryCategory === "other" && draft.customCategoryText
          ? ` · ${draft.customCategoryText}`
          : ""
      }`
    : t("notProvided");

  const rows: Array<{ step: Exclude<Step, 5>; label: string; value: ReactNode }> = [
    {
      step: 3,
      label: t("review.projectTitle"),
      value: draft.title ?? t("notProvided"),
    },
    {
      step: 3,
      label: t("review.propertyType"),
      value: draft.propertyType ? t(`propertyTypeOptions.${draft.propertyType}`) : t("notProvided"),
    },
    {
      step: 3,
      label: t("review.surface"),
      value: draft.surfaceUnknown
        ? t("fields.surfaceUnknown")
        : draft.surface
          ? `${draft.surface} m²`
          : t("notProvided"),
    },
    {
      step: 3,
      label: t("review.description"),
      value: draft.description ?? t("notProvided"),
    },
    {
      step: 2,
      label: t("review.location"),
      value:
        [draft.city ? t(`cityOptions.${draft.city}`) : null, draft.neighborhood]
          .filter(Boolean)
          .join(" · ") || t("notProvided"),
    },
    { step: 1, label: t("review.category"), value: category },
    {
      step: 4,
      label: t("review.timeline"),
      value: draft.timeline ? t(`timelineOptions.${draft.timeline}`) : t("notProvided"),
    },
  ];
  return (
    <div className="min-w-0">
      <div className="divide-y divide-brand-border border-y border-brand-border">
        {rows.map((row) => (
          <article className="flex items-start gap-4 py-4" key={row.label}>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-sm font-semibold text-ink">{row.label}</h2>
              <div className="mt-1 text-[0.95rem] leading-6 break-words whitespace-pre-wrap text-muted">{row.value}</div>
            </div>
            <button
              aria-label={t("editField", { field: row.label })}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-brand-border bg-white text-brand transition-[background-color,border-color,scale] duration-150 hover:border-brand/40 hover:bg-brand-soft active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => onEdit(row.step)}
              title={t("edit")}
              type="button"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          </article>
        ))}
      </div>

      {error ? (
        <div className="mt-6">
          <FriendlyAlert>{error}</FriendlyAlert>
        </div>
      ) : null}
    </div>
  );
}

/** Fixed action bar: progress on top, Back on the left, the next action on the right. */
function WizardFooter({
  step,
  first,
  disabled,
  t,
  nextLabel,
  progressLabel,
  progressValue,
  onBack,
  onSave,
  onPublish,
}: {
  step: Step;
  first: boolean;
  disabled: boolean;
  t: Translate;
  nextLabel: string;
  progressLabel: string;
  progressValue: number;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
}) {
  const secondary =
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-sm border border-brand-border bg-white px-5 text-sm font-semibold text-brand transition-[background-color,border-color,scale] duration-150 hover:border-brand/40 hover:bg-brand-soft/60 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40";
  const primary =
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-sm bg-brand px-5 text-sm font-semibold text-white transition-[background-color,scale] duration-150 hover:bg-brand-hover active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-55";
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 bg-white lg:col-span-2">
      <div
        aria-label={progressLabel}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progressValue}
        className="h-1 w-full bg-[#e8eef2]"
        role="progressbar"
      >
        <div className="h-full bg-brand transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${progressValue}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <button className={secondary} disabled={first || disabled} onClick={onBack} type="button">
          {t("back")}
        </button>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span aria-live="polite" className="hidden text-sm text-muted md:inline">
            {disabled ? t("saving") : t("autosaveHint")}
          </span>
          {step < 5 ? (
            <>
              <button
                className="inline-flex min-h-11 cursor-pointer items-center rounded-sm px-2.5 text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 sm:px-3"
                disabled={disabled}
                onClick={onSave}
                type="button"
              >
                {t("saveAndExit")}
              </button>
              <button className={primary} disabled={disabled} type="submit">
                {disabled ? t("saving") : (
                  <>
                    {/* Short label on phones; the destination is named when there is room. */}
                    <span className="sm:hidden">{step === 4 ? t("reviewProject") : t("continue")}</span>
                    <span className="hidden sm:inline">{nextLabel}</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button className={primary} disabled={disabled} onClick={onPublish} type="button">
              {disabled ? t("publishing") : t("publish")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Choice({
  name,
  value,
  label,
  checked,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="group flex min-h-14 cursor-pointer items-center gap-3 rounded-sm border border-brand-border bg-white px-4 py-3 text-[0.95rem] font-medium text-ink transition-[border-color,background-color] duration-150 hover:border-brand/40 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
      <input className="size-5 shrink-0 accent-brand" defaultChecked={checked} name={name} type="radio" value={value} />
      <span className="flex-1 leading-snug">{label}</span>
    </label>
  );
}

const inputClass =
  "mt-2 min-h-12 w-full rounded-sm border border-brand-border bg-white px-4 text-base font-normal text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15 aria-invalid:border-red-600";

function Field({
  label,
  optional,
  error,
  errorId,
  children,
}: {
  label: string;
  optional?: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-[0.95rem] font-semibold text-ink">
      {label}
      {optional ? <span className="ml-1 font-normal text-muted">({optional})</span> : null}
      {children}
      {error ? <ErrorText id={errorId}>{error}</ErrorText> : null}
    </label>
  );
}

function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span className="mt-2 block text-sm font-medium text-red-700" id={id} role="alert">
      {children}
    </span>
  );
}

export function ProjectWizardSkeleton({
  label,
  progressLabel,
}: {
  label: string;
  progressLabel: string;
}) {
  return (
    <>
      <OnboardingChrome progressLabel={progressLabel} progressValue={15} />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <FormSkeleton label={label} />
      </main>
    </>
  );
}
