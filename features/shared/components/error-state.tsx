import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { AppRoute } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

export function RetryButton({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <button className="button button-primary" onClick={onRetry} type="button">
      {label}
    </button>
  );
}

export function ErrorState({
  title,
  description,
  retryLabel,
  backLabel,
  backHref,
  onRetry,
}: {
  title: string;
  description: string;
  retryLabel: string;
  backLabel?: string;
  backHref?: AppRoute;
  onRetry?: () => void;
}) {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-[720px] flex-col justify-center px-5 py-16 sm:px-8">
      <p className="eyebrow">{title}</p>
      <h1 className="max-w-xl text-[clamp(1.7rem,4vw,2.6rem)] leading-[1.05]">{description}</h1>
      <div className="mt-8 flex flex-wrap gap-3">
        {onRetry ? <RetryButton label={retryLabel} onRetry={onRetry} /> : null}
        {backHref && backLabel ? (
          <Link className="button border border-brand-border bg-white text-ink" href={backHref}>
            {backLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  className,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: AppRoute;
  className?: string;
}) {
  return (
    <div className={joinClassNames("rounded-2xl border border-dashed border-brand-border bg-white px-5 py-10 sm:px-8", className)}>
      <h2 className="m-0 text-base leading-6 font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      {description ? <p className="mt-3 mb-0 max-w-xl text-[0.98rem] leading-6 text-muted">{description}</p> : null}
      {actionHref && actionLabel ? (
        <Link className="button button-primary mt-6" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function FriendlyAlert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "info"
        ? "bg-brand-soft text-brand-dark"
        : "bg-red-50 text-red-700";

  return (
    <p className={joinClassNames("mb-0 rounded-lg px-3 py-2 text-[0.88rem]", toneClass)} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
