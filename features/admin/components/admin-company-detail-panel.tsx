"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ADMIN_PRESS, AdminPage } from "@/features/admin/components/admin-shell";
import { CompanyAdminNotes } from "@/features/admin/components/company-admin-notes";
import { CompanyActivityTimeline } from "@/features/admin/components/company-activity-timeline";
import { OperationalConversation } from "@/features/operations/components/operational-conversation";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export type AdminCompanyTab = "overview" | "verification" | "projectsDeals" | "commissions" | "reviews" | "activity" | "messages" | "internalNotes";
type Summary = NonNullable<FunctionReturnType<typeof api.admin.companies.getCompanySummary>>;
type Commission = FunctionReturnType<typeof api.admin.deals.listCommissionObligations>[number];
type Review = FunctionReturnType<typeof api.admin.companies.listCompanyReviews>["page"][number];

const TABS: AdminCompanyTab[] = ["overview", "verification", "projectsDeals", "commissions", "reviews", "activity", "messages", "internalNotes"];

export function AdminCompanyDetailPanel({ companyId, initialTab = "overview" }: { companyId: Id<"companies">; initialTab?: AdminCompanyTab }) {
  const t = useTranslations("adminCompanies");
  const tMessaging = useTranslations("operationalMessaging");
  const router = useRouter();
  const summary = useQuery(api.admin.companies.getCompanySummary, { companyId });
  const operationalSummary = useQuery(api.adminCompanyMessaging.getAdminConversation, { companyId });
  const [tab, setTab] = useState<AdminCompanyTab>(initialTab);

  function selectTab(nextTab: AdminCompanyTab) {
    setTab(nextTab);
    router.replace({
      pathname: routes.adminCompany,
      params: { companyId },
      query: nextTab === "overview" ? {} : { tab: nextTab },
    }, { scroll: false });
  }

  function moveTab(current: AdminCompanyTab, direction: -1 | 1) {
    const currentIndex = TABS.indexOf(current);
    const next = TABS[(currentIndex + direction + TABS.length) % TABS.length];
    selectTab(next);
    document.getElementById(`company-tab-${next}`)?.focus();
  }

  if (summary === undefined) {
    return <AdminPage breadcrumb={t("detail.breadcrumb")} title={t("detail.loading")}><div aria-busy="true" className="h-56 animate-pulse rounded-[20px] bg-white" role="status"><span className="sr-only">{t("loading")}</span></div></AdminPage>;
  }
  if (summary === null) {
    return <AdminPage breadcrumb={t("detail.breadcrumb")} title={t("detail.notFoundTitle")}><section className="rounded-[20px] border border-[#e7eaee] bg-white p-6"><p className="text-sm text-[#626970]">{t("detail.notFoundLead")}</p><Link className={`mt-5 inline-flex min-h-11 items-center rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white ${ADMIN_PRESS}`} href={routes.adminCompanies}>{t("detail.back")}</Link></section></AdminPage>;
  }

  return (
    <AdminPage breadcrumb={summary.name} title={summary.name}>
      <CompanyHeader summary={summary} />
      <div className="overflow-x-auto pb-1">
        <div aria-label={t("detail.tabsLabel")} className="flex min-w-max gap-1 rounded-[16px] bg-white p-1.5" role="tablist">
          {TABS.map((item) => (
            <button
              aria-controls={`company-panel-${item}`}
              aria-selected={tab === item}
              className={`min-h-11 rounded-[12px] px-4 text-sm font-semibold ${ADMIN_PRESS} ${tab === item ? "bg-[#2f6bff] text-white" : "text-[#626970] hover:bg-[#f4f6f8]"}`}
              id={`company-tab-${item}`}
              key={item}
              onClick={() => selectTab(item)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(item, -1); }
                if (event.key === "ArrowRight") { event.preventDefault(); moveTab(item, 1); }
                if (event.key === "Home") { event.preventDefault(); selectTab(TABS[0]); document.getElementById(`company-tab-${TABS[0]}`)?.focus(); }
                if (event.key === "End") { event.preventDefault(); selectTab(TABS.at(-1)!); document.getElementById(`company-tab-${TABS.at(-1)!}`)?.focus(); }
              }}
              role="tab"
              tabIndex={tab === item ? 0 : -1}
              type="button"
            >
              {t(`detail.tabs.${item}`)}
              {item === "messages" && operationalSummary?.unreadCount ? <span aria-label={tMessaging("thread.unreadBadge", { count: operationalSummary.unreadCount })} className={`ml-2 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[11px] ${tab === item ? "bg-white text-[#2456c7]" : "bg-[#2f6bff] text-white"}`}>{operationalSummary.unreadCount > 99 ? "99+" : operationalSummary.unreadCount}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <section aria-labelledby={`company-tab-${tab}`} id={`company-panel-${tab}`} role="tabpanel">
        {tab === "overview" ? <Overview summary={summary} /> : null}
        {tab === "verification" ? <VerificationPanel companyId={companyId} /> : null}
        {tab === "projectsDeals" ? <ProjectsDeals companyId={companyId} /> : null}
        {tab === "commissions" ? <Commissions companyId={companyId} /> : null}
        {tab === "reviews" ? <Reviews companyId={companyId} /> : null}
        {tab === "activity" ? <CompanyActivityTimeline companyId={companyId} /> : null}
        {tab === "messages" ? operationalSummary === undefined ? <Loading /> : <AdminOperationalMessages companyId={companyId} companyName={summary.name} conversation={operationalSummary} /> : null}
        {tab === "internalNotes" ? <CompanyAdminNotes companyId={companyId} /> : null}
      </section>
    </AdminPage>
  );
}

function AdminOperationalMessages({ companyId, companyName, conversation }: {
  companyId: Id<"companies">;
  companyName: string;
  conversation: FunctionReturnType<typeof api.adminCompanyMessaging.getAdminConversation> | null;
}) {
  const t = useTranslations("operationalMessaging");
  const send = useMutation(api.adminCompanyMessaging.sendAdminMessage);
  const markRead = useMutation(api.adminCompanyMessaging.markAdminConversationRead);
  return (
    <OperationalConversation
      conversation={conversation}
      emptyAction={t("admin.emptyAction")}
      emptyLead={t("admin.emptyLead")}
      emptyTitle={t("admin.emptyTitle")}
      lead={t("admin.lead", { company: companyName })}
      onMarkRead={(readThroughMessageId) => markRead({ conversationId: conversation!.id, readThroughMessageId })}
      onSend={(body, idempotencyKey) => send({ companyId, body, idempotencyKey })}
      role="admin"
      title={t("admin.title")}
    />
  );
}

function CompanyHeader({ summary }: { summary: Summary }) {
  const t = useTranslations("adminCompanies");
  return (
    <section className="flex flex-col gap-5 rounded-[20px] border border-[#e7eaee] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {summary.logoUrl ? <Image alt="" className="size-16 shrink-0 rounded-[16px] object-cover" height={64} src={summary.logoUrl} unoptimized width={64} /> : <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-[16px] bg-[#eef4ff] text-xl font-semibold text-[#2456c7]">{summary.name.slice(0, 1).toLocaleUpperCase()}</span>}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{summary.name}</p>
          <p className="mt-1 text-sm text-[#626970]">{summary.city ?? "—"} · {t(`status.verification.${summary.verificationStatus}`)} · {t(`status.onboarding.${summary.onboardingStatus}`)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${ADMIN_PRESS}`} href={routes.adminCompanies}>{t("detail.back")}</Link>
        {summary.publicProfileSlug ? <Link className={`inline-flex min-h-11 items-center rounded-full bg-[#2f6bff] px-4 text-sm font-semibold text-white ${ADMIN_PRESS}`} href={{ pathname: routes.companyProfile, params: { slug: summary.publicProfileSlug } }}>{t("detail.publicProfile")}</Link> : null}
      </div>
    </section>
  );
}

function Overview({ summary }: { summary: Summary }) {
  const t = useTranslations("adminCompanies");
  const locale = useLocale();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
      <CompanyOperationalStatus companyId={summary.companyId} />
      <section className="rounded-[16px] border border-[#eef1f4] bg-white p-5">
        <h2 className="font-semibold">{t("overview.profile")}</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#626970]">{summary.description || t("overview.noDescription")}</p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2"><Field label={t("overview.legalName")} value={summary.legalName ?? "—"} /><Field label={t("overview.created")} value={date(summary.createdAt, locale)} /><Field label={t("overview.services")} value={summary.services.length ? summary.services.map((service) => t(`services.${service}`)).join(", ") : "—"} /><Field label={t("overview.serviceAreas")} value={summary.serviceAreas.join(", ") || "—"} /></dl>
      </section>
      <section className="rounded-[16px] border border-[#eef1f4] bg-white p-5">
        <h2 className="font-semibold">{t("overview.operations")}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4"><Metric label={t("overview.members")} value={summary.activeMemberCount} /><Metric label={t("overview.reviews")} value={summary.reviewSummary.count} /><Metric label={t("overview.activeDeals")} value={summary.dealSummary.activeCount} /><Metric label={t("overview.completedDeals")} value={summary.dealSummary.completedCount} /><Metric label={t("overview.commissionsDue")} value={summary.commissionSummary.dueCount} /><Metric label={t("overview.amountDue")} value={money(summary.commissionSummary.dueAmountMad, locale)} /></dl>
        {summary.dealSummary.truncated || summary.commissionSummary.truncated ? <p className="mt-3 text-xs text-[#8b919a]">{t("overview.boundedSummary")}</p> : null}
      </section>
      <section className="rounded-[16px] border border-[#eef1f4] bg-white p-5 xl:col-span-2">
        <h2 className="font-semibold">{t("overview.membersTitle")}</h2>
        {summary.members.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{summary.members.map((member) => <li className="rounded-[12px] bg-[#f8fafb] p-3 text-sm" key={member.userId}><span className="font-semibold">{member.displayName}</span><span className="ml-2 text-[#8b919a]">{t(`overview.memberRoles.${member.role}`)}</span></li>)}</ul> : <p className="mt-3 text-sm text-[#8b919a]">{t("overview.noMembers")}</p>}
      </section>
    </div>
  );
}

type OperationalStatus = "normal" | "needs_attention" | "suspended";

function CompanyOperationalStatus({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("adminCompanies.operationalStatus");
  const locale = useLocale();
  const current = useQuery(api.admin.companyOperationalStatus.get, { companyId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.companyOperationalStatus.listHistory,
    { companyId },
    { initialNumItems: 10 },
  );
  const change = useMutation(api.admin.companyOperationalStatus.change);
  const titleId = useId();
  const [target, setTarget] = useState<OperationalStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentStatus = current?.status;
  if (!currentStatus || !(["normal", "needs_attention", "suspended"] as const).includes(currentStatus)) {
    return <section className="h-32 animate-pulse rounded-[16px] bg-white xl:col-span-2" aria-busy="true" />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await change({ companyId, toStatus: target, reason });
      setTarget(null);
      setReason("");
    } catch {
      setError(t("actionError"));
    } finally {
      setBusy(false);
    }
  }

  const highImpact = target === "suspended" || currentStatus === "suspended";
  return (
    <section className="rounded-[16px] border border-[#eef1f4] bg-white p-5 xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-[#626970]">{t("lead")}</p>
        </div>
        <Pill text={t(`status.${currentStatus}`)} tone={currentStatus === "suspended" ? "red" : currentStatus === "needs_attention" ? "amber" : "green"} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(["normal", "needs_attention", "suspended"] as const).filter((item) => item !== currentStatus).map((item) => (
          <button className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${ADMIN_PRESS}`} key={item} onClick={() => { setTarget(item); setError(""); }} type="button">
            {t("changeTo", { status: t(`status.${item}`) })}
          </button>
        ))}
      </div>
      <h3 className="mt-6 font-semibold">{t("history")}</h3>
      {status === "LoadingFirstPage" ? <Loading /> : results.length ? (
        <ol className="mt-3 grid gap-2">
          {results.map((item) => <li className="rounded-[12px] bg-[#f8fafb] p-3 text-sm" key={item.id}><span className="font-semibold">{t(`status.${item.fromStatus}`)} → {t(`status.${item.toStatus}`)}</span><p className="mt-1 whitespace-pre-wrap text-[#626970]">{item.reason}</p><span className="mt-1 block text-xs text-[#8b919a]">{item.changedByDisplayName} · {date(item.createdAt, locale)}</span></li>)}
          {status === "CanLoadMore" ? <button className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${ADMIN_PRESS}`} onClick={() => loadMore(10)} type="button">{t("loadMore")}</button> : null}
        </ol>
      ) : <p className="mt-3 text-sm text-[#8b919a]">{t("emptyHistory")}</p>}
      {target ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" role="presentation">
          <section aria-labelledby={titleId} aria-modal="true" className="w-full max-w-lg rounded-t-[24px] bg-white p-5 sm:rounded-[24px]" role="dialog">
            <h2 className="text-xl font-semibold" id={titleId}>{t("dialogTitle", { status: t(`status.${target}`) })}</h2>
            <p className="mt-2 text-sm leading-6 text-[#626970]">{highImpact ? t("highImpactConfirmation") : t("confirmation")}</p>
            <form className="mt-5" onSubmit={submit}>
              <label className="block text-sm font-semibold" htmlFor="operational-status-reason">{t("reason")}</label>
              <textarea autoFocus className="mt-2 min-h-28 w-full rounded-[12px] border p-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-[#2f6bff]" id="operational-status-reason" maxLength={1000} minLength={10} onChange={(event) => setReason(event.target.value)} required value={reason} />
              <p className="mt-1 text-xs text-[#8b919a]">{t("reasonHelp")}</p>
              {error ? <p className="mt-3 rounded-[12px] bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${ADMIN_PRESS}`} onClick={() => { setTarget(null); setReason(""); }} type="button">{t("cancel")}</button><button className={`min-h-11 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white disabled:opacity-50 ${ADMIN_PRESS}`} disabled={busy || reason.trim().length < 10} type="submit">{busy ? t("saving") : t("confirm")}</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function VerificationPanel({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("adminCompanies");
  const tVerification = useTranslations("adminVerification");
  const locale = useLocale();
  const review = useQuery(api.admin.verification.getCompanyVerificationReview, { companyId });
  const approve = useMutation(api.admin.verification.approveCompanyVerification);
  const reject = useMutation(api.admin.verification.rejectCompanyVerification);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  if (review === undefined) return <Loading />;
  if (review === null) return <Empty text={t("verification.notFound")} />;
  async function run(action: "approve" | "reject") {
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "approve") await approve({ companyId });
      else await reject({ companyId, reason });
      setNotice(t(`verification.${action}Success`)); setReason("");
    } catch { setError(t("verification.actionError")); }
    finally { setBusy(false); }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[16px] border border-[#eef1f4] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t("verification.title")}</h2><Pill text={t(`status.verification.${review.status}`)} tone={review.status === "verified" ? "green" : review.status === "rejected" ? "red" : "amber"} /></div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2"><Field label={tVerification("fields.legalName")} value={review.legalName || "—"} /><Field label={tVerification("fields.ice")} value={review.ice || "—"} /><Field label={tVerification("fields.rc")} value={review.rcNumber || "—"} /><Field label={tVerification("fields.representative")} value={review.legalRepresentative || "—"} /><Field label={tVerification("fields.phone")} value={review.phone || "—"} /><Field label={tVerification("fields.address")} value={review.address || "—"} /></dl>
        {review.submittedAt ? <p className="mt-4 text-xs text-[#8b919a]">{t("verification.submitted", { date: date(review.submittedAt, locale) })}</p> : null}
        {review.latestRejectionReason ? <p className="mt-4 rounded-[12px] bg-red-50 p-3 text-sm text-red-800">{review.latestRejectionReason}</p> : null}
        {review.status === "pending" ? <div className="mt-5 border-t pt-5"><label className="block text-sm font-semibold" htmlFor="company-rejection-reason">{t("verification.reason")}</label><textarea className="mt-2 min-h-24 w-full rounded-[12px] border p-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-[#2f6bff]" id="company-rejection-reason" maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} /><div className="mt-3 flex flex-wrap gap-2"><button className={`min-h-11 rounded-full bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50 ${ADMIN_PRESS}`} disabled={busy} onClick={() => void run("approve")} type="button">{tVerification("approve")}</button><button className={`min-h-11 rounded-full border border-red-200 px-4 text-sm font-semibold text-red-700 disabled:opacity-50 ${ADMIN_PRESS}`} disabled={busy || reason.trim().length < 3} onClick={() => void run("reject")} type="button">{tVerification("reject")}</button></div></div> : null}
        {notice ? <p className="mt-4 rounded-[12px] bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p> : null}{error ? <p className="mt-4 rounded-[12px] bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      </section>
      <section className="rounded-[16px] border border-[#eef1f4] bg-white p-5">
        <h2 className="font-semibold">{t("verification.documents")}</h2>
        {review.documents.length ? <ul className="mt-3 space-y-2">{review.documents.map((document) => <li className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[#f8fafb] p-3 text-sm" key={document.documentId}><span>{tVerification(`documentTypes.${document.documentType}`)} · {document.fileName}</span>{document.downloadUrl ? <a className={`font-semibold text-[#2456c7] ${ADMIN_PRESS}`} href={document.downloadUrl} rel="noreferrer" target="_blank">{tVerification("openDocument")}</a> : null}</li>)}</ul> : <p className="mt-3 text-sm text-[#8b919a]">{t("verification.noDocuments")}</p>}
        <h3 className="mt-6 font-semibold">{t("verification.history")}</h3>
        {review.history.length ? <ol className="mt-3 space-y-2">{review.history.map((item) => <li className="rounded-[12px] bg-[#f8fafb] p-3 text-sm" key={item.historyId}><span className="font-semibold">{t(`status.verification.${item.oldStatus}`)} → {t(`status.verification.${item.newStatus}`)}</span><span className="mt-1 block text-xs text-[#8b919a]">{date(item.changedAt, locale)}</span></li>)}</ol> : <p className="mt-3 text-sm text-[#8b919a]">{t("verification.noHistory")}</p>}
      </section>
    </div>
  );
}

function ProjectsDeals({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("adminCompanies");
  const locale = useLocale();
  const { results, status, loadMore } = usePaginatedQuery(api.admin.companies.listCompanyProjectsDeals, { companyId }, { initialNumItems: 15 });
  return <DataSection title={t("projects.title")}><PaginatedState empty={t("projects.empty")} loadMore={() => loadMore(15)} loading={status === "LoadingFirstPage"} loadingMore={status === "LoadingMore"} canLoadMore={status === "CanLoadMore"}>{results.map((row) => <article className="rounded-[14px] bg-[#f8fafb] p-4" key={row.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{row.projectTitle}</h3><p className="mt-1 text-sm text-[#626970]">{t(`projects.source.${row.source}`)} · {date(row.createdAt, locale)}</p></div><Pill text={row.dealStatus ? t(`projects.dealStatus.${row.dealStatus}`) : t(`projects.projectStatus.${row.projectStatus}`)} tone={row.dealStatus === "completed" ? "green" : "slate"} /></div><dl className="mt-4 grid gap-3 sm:grid-cols-3"><Field label={t("projects.dealAmount")} value={row.agreedAmountMad === null ? "—" : money(row.agreedAmountMad, locale)} /><Field label={t("projects.commissionStatus")} value={row.commissionStatus ? t(`commissions.status.${row.commissionStatus}`) : "—"} /><Field label={t("projects.completed")} value={row.completedAt ? date(row.completedAt, locale) : "—"} /></dl></article>)}</PaginatedState></DataSection>;
}

function Commissions({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("adminCompanies");
  const locale = useLocale();
  const rows = useQuery(api.admin.deals.listCommissionObligations, { status: "all", companyId });
  const [selected, setSelected] = useState<Commission | null>(null);
  return <DataSection title={t("commissions.title")}>{rows === undefined ? <Loading /> : rows.length === 0 ? <Empty text={t("commissions.empty")} /> : <div className="grid gap-3">{rows.map((row) => <article className="flex flex-col gap-3 rounded-[14px] bg-[#f8fafb] p-4 sm:flex-row sm:items-center sm:justify-between" key={row.dealId}><div><h3 className="font-semibold">{row.projectTitle}</h3><p className="mt-1 text-sm text-[#626970]">{money(row.commissionAmountMad, locale)} · {t(`commissions.status.${row.commissionStatus}`)}</p></div><button className={`min-h-10 rounded-full border bg-white px-4 text-sm font-semibold ${ADMIN_PRESS}`} onClick={() => setSelected(row)} type="button">{t("commissions.view")}</button></article>)}</div>}{selected ? <CommissionDialog locale={locale} onClose={() => setSelected(null)} row={selected} /> : null}</DataSection>;
}

function CommissionDialog({ row, locale, onClose }: { row: Commission; locale: string; onClose: () => void }) {
  const t = useTranslations("adminCompanies");
  const markPaid = useMutation(api.admin.deals.markCommissionPaid);
  const titleId = useId();
  const [reference, setReference] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await markPaid({ dealId: row.dealId, paymentReference: reference || undefined, paymentNote: note || undefined }); onClose(); } catch { setError(t("commissions.actionError")); } finally { setBusy(false); } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" role="presentation"><section aria-labelledby={titleId} aria-modal="true" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[24px] bg-white p-5 sm:rounded-[24px]" role="dialog"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[#626970]">{money(row.commissionAmountMad, locale)}</p><h2 className="text-xl font-semibold" id={titleId}>{row.projectTitle}</h2></div><button aria-label={t("commissions.close")} className={`size-11 rounded-full bg-[#f4f6f8] ${ADMIN_PRESS}`} onClick={onClose} type="button">×</button></div>{row.commissionStatus === "due" ? <form className="mt-5" onSubmit={submit}><label className="block text-sm font-semibold">{t("commissions.reference")}<input className="mt-2 min-h-11 w-full rounded-[12px] border px-3 font-normal" maxLength={120} onChange={(event) => setReference(event.target.value)} value={reference} /></label><label className="mt-4 block text-sm font-semibold">{t("commissions.note")}<textarea className="mt-2 min-h-24 w-full rounded-[12px] border p-3 font-normal" maxLength={1000} onChange={(event) => setNote(event.target.value)} value={note} /></label>{error ? <p className="mt-3 rounded-[12px] bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}<button className={`mt-5 min-h-11 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white disabled:opacity-50 ${ADMIN_PRESS}`} disabled={busy} type="submit">{busy ? t("saving") : t("commissions.markPaid")}</button></form> : <dl className="mt-5 grid gap-4 sm:grid-cols-2"><Field label={t("commissions.reference")} value={row.paymentReference ?? "—"} /><Field label={t("commissions.note")} value={row.paymentNote ?? "—"} /><Field label={t("commissions.paidAt")} value={row.paidAt ? date(row.paidAt, locale) : "—"} /></dl>}</section></div>;
}

function Reviews({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("adminCompanies");
  const locale = useLocale();
  const { results, status, loadMore } = usePaginatedQuery(api.admin.companies.listCompanyReviews, { companyId }, { initialNumItems: 15 });
  return <DataSection title={t("reviews.title")}><PaginatedState empty={t("reviews.empty")} loadMore={() => loadMore(15)} loading={status === "LoadingFirstPage"} loadingMore={status === "LoadingMore"} canLoadMore={status === "CanLoadMore"}>{results.map((review) => <ReviewRow key={review.reviewId} locale={locale} review={review} />)}</PaginatedState></DataSection>;
}

function ReviewRow({ review, locale }: { review: Review; locale: string }) {
  const t = useTranslations("adminCompanies");
  const setVisibility = useMutation(api.admin.reviews.setReviewVisibility);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const next = review.moderationStatus === "visible" ? "hidden" : "visible";
  async function update() { setBusy(true); setError(""); try { await setVisibility({ reviewId: review.reviewId, status: next }); } catch { setError(t("reviews.actionError")); } finally { setBusy(false); } }
  return <article className="rounded-[14px] bg-[#f8fafb] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{review.projectTitle}</h3><p className="mt-1 text-sm text-[#626970]">{review.reviewerName} · {date(review.createdAt, locale)} · {review.rating}/5</p></div><button className={`min-h-10 rounded-full border bg-white px-4 text-sm font-semibold disabled:opacity-50 ${ADMIN_PRESS}`} disabled={busy} onClick={() => void update()} type="button">{t(`reviews.${next === "hidden" ? "hide" : "restore"}`)}</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#30343a]">{review.comment}</p>{error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}</article>;
}

function DataSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[16px] border border-[#eef1f4] bg-white p-4 sm:p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4">{children}</div></section>; }
function PaginatedState({ children, empty, loading, canLoadMore, loadingMore, loadMore }: { children: React.ReactNode[]; empty: string; loading: boolean; canLoadMore: boolean; loadingMore: boolean; loadMore: () => void }) { const t = useTranslations("adminCompanies"); if (loading) return <Loading />; if (children.length === 0) return <Empty text={empty} />; return <div className="grid gap-3">{children}{canLoadMore || loadingMore ? <button className={`min-h-11 rounded-full border px-4 text-sm font-semibold disabled:opacity-50 ${ADMIN_PRESS}`} disabled={loadingMore} onClick={loadMore} type="button">{loadingMore ? t("loadingMore") : t("loadMore")}</button> : null}</div>; }
function Loading() { const t = useTranslations("adminCompanies"); return <div aria-busy="true" className="space-y-3" role="status"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 3 }).map((_, index) => <div className="h-20 animate-pulse rounded-[12px] bg-[#f4f6f8]" key={index} />)}</div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-[12px] bg-[#f8fafb] px-4 py-10 text-center text-sm text-[#8b919a]">{text}</p>; }
function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#8b919a]">{label}</dt><dd className="mt-1 text-sm font-medium text-[#30343a]">{value}</dd></div>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-[12px] bg-[#f8fafb] p-3"><dt className="text-xs text-[#8b919a]">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>; }
function Pill({ text, tone }: { text: string; tone: "green" | "red" | "amber" | "slate" }) { const style = tone === "green" ? "bg-emerald-100 text-emerald-800" : tone === "red" ? "bg-red-100 text-red-800" : tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{text}</span>; }
function money(value: number, locale: string) { return new Intl.NumberFormat(locale, { style: "currency", currency: "MAD", maximumFractionDigits: 0 }).format(value); }
function date(value: number, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(value); }
