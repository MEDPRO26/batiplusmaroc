"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { VerifiedBadge } from "@/features/companies/components/verified-badge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";

export function ClientProjectInvitations({
  projectId,
}: {
  projectId: Id<"projects">;
}) {
  const t = useTranslations("invitations.project");
  const tCompany = useTranslations("publicCompany");
  const locale = useLocale();
  const rows = useQuery(api.invitations.index.listProjectInvitations, {
    projectId,
  });
  if (rows === undefined)
    return (
      <section
        className="mt-8 rounded-2xl border border-brand-border bg-white p-5"
        aria-busy="true"
      >
        <p className="m-0 text-sm text-muted">{t("loading")}</p>
      </section>
    );
  if (rows.length === 0) return null;
  return (
    <section className="mt-8 rounded-2xl border border-brand-border bg-white p-5 sm:p-7">
      <h2 className="m-0 text-lg font-semibold text-ink">{t("title")}</h2>
      <ul className="mt-4 grid list-none gap-3 p-0">
        {rows.map((row) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-muted p-4"
            key={row.id}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="m-0 break-words text-sm font-semibold text-ink">{row.companyName}</p>
                <VerifiedBadge isVerified={row.isVerified} label={tCompany("verified")} />
              </div>
              <p className="mt-1 mb-0 text-xs text-muted">
                {formatMarketplaceDateTime(row.createdAt, locale, {
                  dateStyle: "medium",
                })}
              </p>
            </div>
            <span className="rounded-sm bg-white px-3 py-1 text-xs font-semibold text-ink">
              {t(`status.${row.status}`)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
