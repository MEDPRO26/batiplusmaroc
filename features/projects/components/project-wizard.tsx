"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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

/** Six wizard screens: 1–5 collect answers, 6 is review + publish. */
const totalSteps = 6;
type Wizard = FunctionReturnType<typeof api.projects.index.getWizard>;
type Draft = NonNullable<Wizard["draft"]>;
type Step = 1 | 2 | 3 | 4 | 5 | 6;
type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Resume after timeline (5) or older files step (6+) lands on review. */
export function resumeWizardStep(lastCompletedStep: number): Step {
  if (lastCompletedStep >= 5) return 6;
  return Math.max(1, lastCompletedStep + 1) as Step;
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
  const saveBudget = useMutation(api.projects.index.saveBudget);
  const saveTimeline = useMutation(api.projects.index.saveTimeline);
  const publish = useMutation(api.projects.index.publishProject);
  const router = useRouter();
  const { showToast } = useToast();
  const started = useRef(false);
  const loadedDraft = useRef<string | null>(null);
  const lock = useRef(createSubmitLock());
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>(1);
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
      setStep(resumeWizardStep(wizard.draft.lastCompletedStep));
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

  const progressLabel = t("progress", { current: step, total: totalSteps });
  const progressValue = Math.round((step / totalSteps) * 100);

  if (submitted) {
    return (
      <>
        <OnboardingChrome progressLabel={t("progressComplete")} progressValue={100} />
        <main className="mx-auto flex w-full max-w-[680px] flex-1 items-center px-5 py-14">
          <section className="w-full rounded-3xl border border-brand-border bg-white p-8 text-center sm:p-10" role="status">
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
        const budgetRange = String(values.get("budgetRange") ?? "") as Wizard["budgetOptions"][number];
        if (!data.budgetOptions.includes(budgetRange)) return fail(form, "budgetRange", t("validation.budget"));
        await saveBudget({ projectId: draft.id, budgetRange });
      } else if (step === 5) {
        const timeline = String(values.get("timeline") ?? "") as Wizard["timelineOptions"][number];
        if (!data.timelineOptions.includes(timeline)) return fail(form, "timeline", t("validation.timeline"));
        await saveTimeline({ projectId: draft.id, timeline });
      }

      if (exit) {
        showToast(t("draftSaved"));
        router.push(routes.clientDashboard);
      } else if (returnToReview) {
        setReturnToReview(false);
        go(6);
      } else {
        go(Math.min(6, (step + 1) as Step) as Step);
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

  return (
    <>
      <OnboardingChrome progressLabel={progressLabel} progressValue={progressValue} />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-5 py-8 sm:px-8 sm:py-14">
        <div className="mb-8 flex justify-between gap-3 text-sm text-muted">
          <span>{progressLabel}</span>
          <span aria-live="polite">{saving ? t("saving") : t("autosaveHint")}</span>
        </div>

        {step < 6 ? (
          <form
            className="flex min-h-[520px] flex-1 flex-col"
            noValidate
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void persist(event.currentTarget);
            }}
            ref={formRef}
          >
            <div className="flex-1">
              <header className="max-w-xl">
                <p className="m-0 text-xs font-semibold tracking-[0.15em] text-brand uppercase">
                  {t(`steps.${step}.eyebrow`)}
                </p>
                <h1
                  className="mt-4 text-[clamp(1.85rem,4.5vw,2.75rem)] font-semibold tracking-[-0.045em] text-ink outline-none"
                  ref={headingRef}
                  tabIndex={-1}
                >
                  {t(`steps.${step}.title`)}
                </h1>
                <p className="mt-4 mb-0 text-base leading-7 text-muted sm:text-lg">
                  {t(`steps.${step}.lead`)}
                </p>
              </header>

              <StepBody data={data} draft={draft} fieldError={fieldError} step={step as Exclude<Step, 6>} t={t} />
              {error ? (
                <div className="mt-8">
                  <FriendlyAlert>{error}</FriendlyAlert>
                </div>
              ) : null}
            </div>

            <Actions
              disabled={saving}
              step={step as Exclude<Step, 6>}
              t={t}
              onBack={() => go((step - 1) as Step)}
              onSave={() => {
                if (formRef.current) void persist(formRef.current, true);
              }}
            />
          </form>
        ) : (
          <Review
            draft={draft}
            error={error}
            publishing={saving}
            t={t}
            onEdit={(editStep) => {
              setReturnToReview(true);
              go(editStep);
            }}
            onPublish={() => void submitProject()}
          />
        )}
      </main>
    </>
  );
}

function StepBody({
  step,
  draft,
  data,
  t,
  fieldError,
}: {
  step: Exclude<Step, 6>;
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
        className="mt-10 border-0 p-0"
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
      </fieldset>
    );
  }

  if (step === 2) {
    return (
      <div className="mt-10 grid max-w-lg gap-7">
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
      <div className="mt-10 grid max-w-xl gap-7">
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
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-normal text-ink">
            <input defaultChecked={draft.surfaceUnknown} name="surfaceUnknown" type="checkbox" />
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

  const name = step === 4 ? "budgetRange" : "timeline";
  const selected = step === 4 ? draft.budgetRange : draft.timeline;
  const values = step === 4 ? data.budgetOptions : data.timelineOptions;
  const prefix = step === 4 ? "budgetOptions" : "timelineOptions";

  return (
    <fieldset
      aria-describedby={message(name) ? errorId(name) : undefined}
      className="mt-10 border-0 p-0"
    >
      <legend className="sr-only">{t(`steps.${step}.title`)}</legend>
      <div className="grid max-w-xl gap-3">
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
  onPublish,
  publishing,
  error,
}: {
  draft: Draft;
  t: Translate;
  onEdit: (step: Exclude<Step, 6>) => void;
  onPublish: () => void;
  publishing: boolean;
  error: string | null;
}) {
  const category = draft.primaryCategory
    ? `${t(`categoryOptions.${draft.primaryCategory}`)}${
        draft.primaryCategory === "other" && draft.customCategoryText
          ? ` · ${draft.customCategoryText}`
          : ""
      }`
    : t("notProvided");

  const rows: Array<{ step: Exclude<Step, 6>; label: string; value: ReactNode }> = [
    { step: 1, label: t("review.category"), value: category },
    {
      step: 2,
      label: t("review.location"),
      value:
        [draft.city ? t(`cityOptions.${draft.city}`) : null, draft.neighborhood]
          .filter(Boolean)
          .join(" · ") || t("notProvided"),
    },
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
      step: 4,
      label: t("review.budget"),
      value: draft.budgetRange ? t(`budgetOptions.${draft.budgetRange}`) : t("notProvided"),
    },
    {
      step: 5,
      label: t("review.timeline"),
      value: draft.timeline ? t(`timelineOptions.${draft.timeline}`) : t("notProvided"),
    },
  ];

  return (
    <section>
      <header className="max-w-xl">
        <p className="m-0 text-xs font-semibold tracking-[0.15em] text-brand uppercase">
          {t("steps.6.eyebrow")}
        </p>
        <h1 className="mt-4 text-[clamp(1.85rem,4.5vw,2.75rem)] font-semibold tracking-[-0.045em] text-ink">
          {t("steps.6.title")}
        </h1>
        <p className="mt-4 mb-0 text-base leading-7 text-muted sm:text-lg">{t("steps.6.lead")}</p>
      </header>

      <div className="mt-10 divide-y divide-brand-border border-y border-brand-border">
        {rows.map((row) => (
          <article className="grid gap-3 py-6 sm:grid-cols-[160px_1fr_auto] sm:items-start" key={row.label}>
            <h2 className="m-0 text-sm font-semibold text-ink">{row.label}</h2>
            <div className="text-base leading-7 text-muted">{row.value}</div>
            <button
              className="min-h-11 justify-self-start text-sm font-semibold text-brand sm:justify-self-end"
              onClick={() => onEdit(row.step)}
              type="button"
            >
              {t("edit")}
            </button>
          </article>
        ))}
      </div>

      {error ? (
        <div className="mt-6">
          <FriendlyAlert>{error}</FriendlyAlert>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-20 -mx-5 mt-8 border-t border-brand-border bg-white/95 px-5 py-4 sm:static sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <button
          className="button button-primary min-h-12 w-full sm:w-auto sm:min-w-[12rem]"
          disabled={publishing}
          onClick={onPublish}
          type="button"
        >
          {publishing ? t("publishing") : t("publish")}
        </button>
      </div>
    </section>
  );
}

function Actions({
  step,
  disabled,
  t,
  onBack,
  onSave,
}: {
  step: Exclude<Step, 6>;
  disabled: boolean;
  t: Translate;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-5 mt-10 border-t border-brand-border bg-white/95 px-5 py-4 sm:mx-0 sm:mt-12 sm:flex sm:items-center sm:justify-between sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      <button
        className="mb-3 min-h-12 px-1 font-semibold text-ink disabled:opacity-40 sm:mb-0"
        disabled={step === 1 || disabled}
        onClick={onBack}
        type="button"
      >
        {t("back")}
      </button>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <button
          className="min-h-12 rounded-xl border border-brand-border px-4 font-semibold text-ink"
          disabled={disabled}
          onClick={onSave}
          type="button"
        >
          {t("saveAndExit")}
        </button>
        <button className="button button-primary min-h-12" disabled={disabled} type="submit">
          {disabled ? t("saving") : step === 5 ? t("reviewProject") : t("continue")}
        </button>
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
    <label className="group flex min-h-[3.75rem] cursor-pointer items-center gap-3 rounded-2xl border border-brand-border px-4 py-3.5 text-[0.95rem] font-semibold text-ink transition-[border-color,background-color] duration-150 has-[:checked]:border-brand has-[:checked]:bg-brand-soft focus-within:outline-2 focus-within:outline-brand">
      <input className="size-5 accent-brand" defaultChecked={checked} name={name} type="radio" value={value} />
      <span className="flex-1 leading-snug">{label}</span>
      <span aria-hidden className="opacity-0 group-has-[:checked]:opacity-100">
        ✓
      </span>
    </label>
  );
}

const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

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
    <label className="block text-sm font-semibold text-ink">
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
      <main className="mx-auto w-full max-w-[720px] flex-1 px-5 py-10">
        <FormSkeleton label={label} />
      </main>
    </>
  );
}
