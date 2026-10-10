"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Component, useId, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { workspaceButton } from "@/features/shared/components/workspace-page";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

/** The owner read model validates explicit scopes; legacy cities are not coverage. */
export function CompanyCoverageReminder({
  coverageScopeKeys,
  className,
}: {
  coverageScopeKeys: readonly string[] | undefined;
  className?: string;
}) {
  const t = useTranslations("companyProfileManager.coverage.reminder");
  const titleId = useId();
  if (coverageScopeKeys === undefined || coverageScopeKeys.length !== 0) return null;

  return (
    <section aria-labelledby={titleId} className={joinClassNames("grid min-w-0 gap-3 rounded-xl border border-brand-border bg-brand-soft p-4", className)}>
      <h2 className="m-0 text-base font-semibold leading-6 text-ink" id={titleId}>{t("title")}</h2>
      <p className="m-0 text-sm leading-6 text-muted">{t("lead")}</p>
      <p className="m-0 text-sm leading-6 text-ink">{t("discovery")}</p>
      <Link
        className={`${workspaceButton.primary} max-w-full justify-self-start px-4 py-2 whitespace-normal`}
        href={{ pathname: routes.companyProfileManagement, query: { edit: "coverage" } }}
      >
        {t("action")}
      </Link>
    </section>
  );
}

function DashboardCoverageRead() {
  const coverageScopeKeys = useQuery(api.companies.index.getMyGeographicCoverage, {});
  return <CompanyCoverageReminder className="lg:col-span-2" coverageScopeKeys={coverageScopeKeys} />;
}

/** An optional reminder must not replace the dashboard when its private read fails. */
class ReminderReadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function CompanyDashboardCoverageReminder() {
  return <ReminderReadBoundary><DashboardCoverageRead /></ReminderReadBoundary>;
}
