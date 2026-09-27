"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link } from "@/i18n/navigation";
import { mapAppError } from "@/lib/errors";
import { routes } from "@/lib/routes";

export function InviteCompanyButton({
  companyId,
  companyEligible = true,
  className,
}: {
  companyId: Id<"companies">;
  companyEligible?: boolean;
  className?: string;
}) {
  const t = useTranslations("invitations.client");
  const tUx = useTranslations("ux");
  const tWizard = useTranslations("projectWizard");
  const user = useQuery(api.users.currentUser);
  const [open, setOpen] = useState(false);
  const projects = useQuery(
    api.invitations.index.listMyEligibleProjectsForCompany,
    companyEligible &&
      user?.accountType === "client" &&
      user.onboardingStatus === "completed"
      ? { companyId }
      : "skip",
  );
  const invite = useMutation(api.invitations.index.inviteCompanyToProject);
  const [projectId, setProjectId] = useState<Id<"projects"> | "">("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  function start() {
    setProjectId("");
    setMessage("");
    setError("");
    setSent(false);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return setError(t("chooseProjectError"));
    setBusy(true);
    setError("");
    try {
      await invite({
        companyId,
        projectId,
        message: message.trim() || undefined,
      });
      setSent(true);
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={`${className ?? "button button-primary w-full"} disabled:cursor-not-allowed disabled:opacity-55`}
        disabled={!companyEligible}
        onClick={start}
        ref={triggerRef}
        title={!companyEligible ? t("unavailable") : undefined}
        type="button"
      >
        {t("open")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-6"
          role="presentation"
        >
          <section
            aria-describedby="invite-company-description"
            aria-labelledby="invite-company-title"
            aria-modal="true"
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
            role="dialog"
            ref={dialogRef}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  className="m-0 text-xl font-semibold text-ink"
                  id="invite-company-title"
                >
                  {t("title")}
                </h2>
                <p
                  className="mt-2 mb-0 text-sm leading-6 text-muted"
                  id="invite-company-description"
                >
                  {t("lead")}
                </p>
              </div>
              <button
                aria-label={t("close")}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-muted text-xl"
                disabled={busy}
                onClick={() => setOpen(false)}
                ref={closeRef}
                type="button"
              >
                ×
              </button>
            </div>
            {user === undefined ? (
              <p className="mt-6 text-sm text-muted" role="status">
                {t("loading")}
              </p>
            ) : user === null ? (
              <Gate
                message={t("signInRequired")}
                action={t("signIn")}
                href={routes.signIn}
              />
            ) : user?.accountType !== "client" ||
              user.onboardingStatus !== "completed" ? (
              <Gate
                message={t("clientRequired")}
                action={t("clientWorkspace")}
                href={routes.clientDashboard}
              />
            ) : projects === undefined ? (
              <p className="mt-6 text-sm text-muted" role="status">
                {t("loading")}
              </p>
            ) : projects.length === 0 ? (
              <Gate
                message={t("empty")}
                action={t("postProject")}
                href={routes.postProjectWizard}
              />
            ) : projects.every(
                (project) => project.invitationStatus !== null,
              ) ? (
              <Gate
                message={t("allInvited")}
                action={t("postProject")}
                href={routes.postProjectWizard}
              />
            ) : sent ? (
              <div
                className="mt-6 rounded-2xl border border-[#b9dac7] bg-[#eff8f2] p-5 text-[#21633d]"
                role="status"
              >
                <p className="m-0 font-semibold">{t("sent")}</p>
                <button
                  className="mt-4 min-h-11 rounded-full border border-[#8fbea2] bg-white px-5 text-sm font-semibold"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  {t("done")}
                </button>
              </div>
            ) : (
              <form className="mt-6 grid gap-5" onSubmit={submit}>
                <label
                  className="text-sm font-semibold text-ink"
                  htmlFor="invitation-project"
                >
                  {t("chooseProject")}
                  <select
                    className="mt-2 min-h-12 w-full rounded-xl border border-brand-border bg-white px-3 font-normal"
                    id="invitation-project"
                    onChange={(event) =>
                      setProjectId(event.target.value as Id<"projects"> | "")
                    }
                    required
                    value={projectId}
                  >
                    <option value="">{t("choosePlaceholder")}</option>
                    {projects.map((project) => (
                      <option
                        disabled={project.invitationStatus !== null}
                        key={project.id}
                        value={project.id}
                      >
                        {project.title}
                        {project.city
                          ? ` · ${tWizard(`cityOptions.${project.city}`)}`
                          : ""}
                        {project.invitationStatus
                          ? ` — ${t(`status.${project.invitationStatus}`)}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="text-sm font-semibold text-ink"
                  htmlFor="invitation-message"
                >
                  {t("message")}
                  <span className="ml-1 font-normal text-muted">
                    {t("optional")}
                  </span>
                  <textarea
                    className="mt-2 min-h-32 w-full resize-y rounded-xl border border-brand-border p-3 font-normal leading-6 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                    id="invitation-message"
                    maxLength={2000}
                    onChange={(event) => setMessage(event.target.value)}
                    value={message}
                  />
                </label>
                <p className="-mt-3 mb-0 text-xs text-muted">
                  {t("characterCount", { count: message.length })}
                </p>
                {error ? (
                  <p
                    className="m-0 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    className="min-h-11 rounded-full px-5 text-sm font-semibold text-ink"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={busy || !projectId}
                    type="submit"
                  >
                    {busy ? t("sending") : t("send")}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function Gate({
  message,
  action,
  href,
}: {
  message: string;
  action: string;
  href:
    | typeof routes.signIn
    | typeof routes.clientDashboard
    | typeof routes.postProjectWizard;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-brand-border bg-surface-muted p-5">
      <p className="m-0 text-sm leading-6 text-muted">{message}</p>
      <Link
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
        href={href}
      >
        {action}
      </Link>
    </div>
  );
}
