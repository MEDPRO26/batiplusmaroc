import type { ReactNode } from "react";

/**
 * Shared layout primitives for authenticated workspace pages, so every Company
 * page uses the same width, header rhythm, tabs, badges and button hierarchy.
 */

export const workspaceButton = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white! transition-[background-color,scale] duration-150 hover:bg-brand-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-border bg-white px-5 text-sm font-semibold text-ink transition-[background-color,border-color,scale] duration-150 hover:border-brand/40 hover:bg-brand-soft/60 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
} as const;

export function WorkspacePage({
  children,
  label,
  busy = false,
}: {
  children: ReactNode;
  label?: string;
  busy?: boolean;
}) {
  return (
    <main
      aria-busy={busy || undefined}
      aria-label={label}
      className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb] pt-8 pb-16 sm:pt-10"
    >
      <div className="mx-auto w-[calc(100%-32px)] max-w-[1240px]">{children}</div>
    </main>
  );
}

export function WorkspacePageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="m-0 text-[1.75rem] leading-tight font-semibold tracking-[-0.03em] text-balance text-ink sm:text-[2rem]">
          {title}
        </h1>
        {lead ? <p className="mt-2 mb-0 max-w-2xl text-[0.95rem] leading-6 text-pretty text-muted">{lead}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div> : null}
    </header>
  );
}

/** Underline filter tabs; each is a toggle button filtering the list below. */
export function WorkspaceTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div aria-label={label} className="flex gap-6 overflow-x-auto border-b border-brand-border" role="group">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            aria-pressed={selected}
            className="relative -mb-px inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-0 border-b-2 border-transparent bg-transparent px-0.5 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-pressed:border-brand aria-pressed:text-ink"
            key={tab.value}
            onClick={() => onChange(tab.value)}
            type="button"
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-muted",
  brand: "bg-brand-soft text-brand-dark",
  success: "bg-[#e3f4e8] text-[#1c6b3a]",
  warning: "bg-[#fff3d6] text-[#7a5200]",
  danger: "bg-[#fde8e6] text-[#9b2c20]",
};

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

/** A white panel with thin border — the one surface level used inside workspace pages. */
export function WorkspacePanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-2xl border border-brand-border bg-white ${className}`}>{children}</section>;
}
