"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SupportBoundary } from "@/features/client-support/components/support-thread";
import { agreementApi, type AgreementVersion, type Terms } from "../lib/agreement-ui";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";

export const PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-sm bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
export const SECONDARY = "inline-flex min-h-11 items-center justify-center rounded-sm border border-brand-border bg-white px-4 text-sm font-semibold text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
export const INPUT = "min-h-11 w-full rounded-sm border border-brand-border bg-white px-3 py-2 text-base font-normal text-ink focus:border-brand focus:outline-2 focus:outline-brand/20";

export function useAgreementClock(active = true) {
  const [asOf, setAsOf] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const refresh = () => { if (document.visibilityState === "visible") setAsOf(Date.now()); };
    const frame = window.requestAnimationFrame(refresh);
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [active]);
  return asOf;
}
export function useAlive() {
  const ref = useRef(true);
  useEffect(() => { ref.current = true; return () => { ref.current = false; }; }, []);
  return ref;
}
export function AgreementGuard({ role, projectId, children }: { role: "client" | "admin"; projectId: string; children: ReactNode }) {
  const t = useTranslations("coordinationAgreement");
  const user = useQuery(api.users.currentUser);
  if (user === undefined) return <p role="status">{t("loading")}</p>;
  if (!user || user.accountType !== role || (role === "client" && user.onboardingStatus !== "completed")) return <p role="alert">{t("denied")}</p>;
  return <SupportBoundary key={`${projectId}:${user._id}`} resetKey={`${projectId}:${user._id}`}
    fallback={retry => <p role="alert">{t("denied")} <button className={SECONDARY} onClick={retry} type="button">{t("reload")}</button></p>}>
    {children}
  </SupportBoundary>;
}
export function AgreementTime({ value }: { value: number }) {
  const locale = useLocale();
  return <time dateTime={new Date(value).toISOString()}>{formatMarketplaceDateTime(value, locale, { dateStyle: "medium", timeStyle: "short" })}</time>;
}
export function TermsView({ terms }: { terms: Terms }) {
  const t = useTranslations("coordinationAgreement");
  const format = useFormatter();
  const mad = (value: number) => format.number(value, { style: "currency", currency: "MAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  type Field = "tasks" | "exclusions" | "visits" | "availability" | "startDate" | "fee" | "basis" | "basisAmountMad" | "payer" | "paymentTerms";
  const values: [Field, string][] = [
    ["tasks", terms.tasks], ["exclusions", terms.exclusions], ["visits", terms.visits], ["availability", terms.availability], ["startDate", terms.startDate],
    ["fee", terms.fee.kind === "fixed" ? mad(terms.fee.amountMad) : `${terms.fee.rate} %`],
    ["payer", terms.payer], ["paymentTerms", terms.paymentTerms],
  ];
  if (terms.fee.kind === "percentage") {
    values.splice(6, 0, ["basis", terms.fee.basis]);
    if (terms.fee.basisAmountMad !== undefined) values.splice(7, 0, ["basisAmountMad", mad(terms.fee.basisAmountMad)]);
  }
  return <dl className="m-0 grid gap-3 text-sm">{values.map(([field, value]) => <div key={field}>
    <dt className="font-semibold text-ink">{t(`fields.${field}`)}</dt><dd className="m-0 mt-1 break-words whitespace-pre-wrap text-muted">{value}</dd>
  </div>)}</dl>;
}
export function VersionView({ version }: { version: AgreementVersion }) {
  const t = useTranslations("coordinationAgreement");
  return <div className="grid gap-4" data-agreement-version={version.id}>
    <p className="m-0 text-xs text-muted">{t("publishedBy", { name: version.publishedByDisplayName })} <AgreementTime value={version.publishedAt} /></p>
    <TermsView terms={version.terms} />
    {version.adminNotStartedDeclaredAt !== null ? <p className="m-0 text-xs text-muted">{t("adminDeclared")} <AgreementTime value={version.adminNotStartedDeclaredAt} /></p> : null}
    {version.confirmation ? <div className="grid gap-1 rounded-sm bg-brand-soft p-3 text-xs text-brand-dark">
      <p className="m-0">{t("confirmedBy", { name: version.confirmation.confirmedByDisplayName })} <AgreementTime value={version.confirmation.confirmedAt} /></p>
      <p className="m-0">{t("effectiveFrom")} <AgreementTime value={version.confirmation.effectiveFrom} /></p>
      {version.confirmation.notStartedDeclaredAt !== null ? <p className="m-0">{t("clientDeclared")} <AgreementTime value={version.confirmation.notStartedDeclaredAt} /></p> : null}
    </div> : null}
  </div>;
}
export function AgreementHistory({ projectId, role }: { projectId: Id<"projects">; role: "client" | "admin" }) {
  const t = useTranslations("coordinationAgreement");
  const { results, status, loadMore } = usePaginatedQuery(role === "admin" ? agreementApi.listAdminVersions : agreementApi.listMyVersions,
    { projectId }, { initialNumItems: 5 });
  return <div className="mt-3 grid gap-3">
    {status === "LoadingFirstPage" ? <p role="status">{t("loading")}</p> : !results.length ? <p className="text-sm text-muted">{t("noHistory")}</p> :
      results.map(version => <details className="rounded-sm border border-brand-border p-3" key={version.id}>
        <summary className="min-h-11 cursor-pointer text-sm font-semibold text-ink">{t("version", { number: version.versionNumber })} · {t(version.isCurrentConfirmed ? "current" : version.status === "confirmed" ? "previousConfirmed" : version.status === "pending" ? role === "admin" ? "pendingAdmin" : "pending" : "superseded")} <span className="font-normal text-muted tabular-nums">· <AgreementTime value={version.publishedAt} /></span></summary>
        <VersionView version={version} />
      </details>)}
    {status === "CanLoadMore" || status === "LoadingMore" ? <button className={SECONDARY} disabled={status === "LoadingMore"} onClick={() => loadMore(5)} type="button">{t(status === "LoadingMore" ? "loading" : "loadMore")}</button> : null}
  </div>;
}
