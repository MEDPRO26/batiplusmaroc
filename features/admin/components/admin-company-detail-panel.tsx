"use client";

import { AdminCompanyCoverSection } from "./admin-company-cover-review";

import { AdminCompanyLogoSection } from "./admin-company-logo-review";
import { AdminCompanyPortfolioImages } from "./admin-portfolio-image-review";
import { ApprovedCompanyLogo } from "@/features/companies/components/approved-company-logo";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { useEffect, useId, useState, type ReactNode } from "react";
import { AdminCompanyVerification } from "./admin-company-verification";
import { api } from "@/convex/_generated/api";
import { serviceName } from "@/features/companies/lib/service-label";
import type { Id } from "@/convex/_generated/dataModel";
import { OperationalPill, VerificationPill } from "@/features/admin/components/admin-companies-panel";
import { ADMIN_PRESS, AdminPage } from "@/features/admin/components/admin-shell";
import { CompanyAdminNotes } from "@/features/admin/components/company-admin-notes";
import { CompanyActivityTimeline } from "@/features/admin/components/company-activity-timeline";
import { COMPANIES_RETURN_KEY } from "@/features/admin/lib/company-filters";
import { OperationalConversation } from "@/features/operations/components/operational-conversation";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export type AdminCompanyTab = "overview" | "verification" | "logo" | "cover" | "portfolioImages" | "projectsDeals" | "commissions" | "reviews" | "activity" | "messages" | "internalNotes";
type Summary = NonNullable<FunctionReturnType<typeof api.admin.companies.getCompanySummary>>;
type Commission = FunctionReturnType<typeof api.admin.deals.listCommissionObligations>["page"][number];
type Review = FunctionReturnType<typeof api.admin.companies.listCompanyReviews>["page"][number];
type OperationalStatus = "normal" | "needs_attention" | "suspended";

const TABS: AdminCompanyTab[] = ["overview", "verification", "logo", "cover", "portfolioImages", "projectsDeals", "commissions", "reviews", "activity", "messages", "internalNotes"];
const OPERATIONAL_STATUSES: OperationalStatus[] = ["normal", "needs_attention", "suspended"];

/** Returns to the Companies list with the filters the Admin left it with. */
function useCompaniesReturnHref() {
  const [query, setQuery] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(COMPANIES_RETURN_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount.
      if (stored) setQuery(Object.fromEntries(new URLSearchParams(stored)));
    } catch {
      // Storage unavailable: fall back to the unfiltered list.
    }
  }, []);
  return { pathname: routes.adminCompanies, query } as const;
}

export function AdminCompanyDetailPanel({ companyId, initialTab = "overview" }: { companyId: Id<"companies">; initialTab?: AdminCompanyTab }) {
  const t = useTranslations("adminCompanies");
  const tMessaging = useTranslations("operationalMessaging");
  const router = useRouter();
  const summary = useQuery(api.admin.companies.getCompanySummary, { companyId });
  const operationalSummary = useQuery(api.adminCompanyMessaging.getAdminConversation, { companyId });
  const operational = useQuery(api.admin.companyOperationalStatus.get, { companyId });
  const [tab, setTab] = useState<AdminCompanyTab>(initialTab);
  const [statusTarget, setStatusTarget] = useState<OperationalStatus | null>(null);
  const backHref = useCompaniesReturnHref();
  const companiesParent = { label: t("title"), href: routes.adminCompanies };

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
    return <AdminPage breadcrumb={t("detail.breadcrumb")} parent={companiesParent} title={t("detail.loading")}><div aria-busy="true" className="h-56 animate-pulse rounded-[16px] bg-white" role="status"><span className="sr-only">{t("loading")}</span></div></AdminPage>;
  }
  if (summary === null) {
    return <AdminPage breadcrumb={t("detail.breadcrumb")} parent={companiesParent} title={t("detail.notFoundTitle")}><section className="rounded-[16px] border border-[#e7eaee] bg-white p-6"><p className="text-sm text-[#626970]">{t("detail.notFoundLead")}</p><Link className={`mt-5 inline-flex min-h-11 items-center rounded-sm bg-[#2f6bff] px-5 text-sm font-semibold text-white ${ADMIN_PRESS}`} href={backHref}>{t("detail.back")}</Link></section></AdminPage>;
  }

  const currentStatus = operational?.status as OperationalStatus | undefined;

  return (
    <AdminPage
      breadcrumb={summary.name}
      header={<CompanyHeader backHref={backHref} currentStatus={currentStatus} onChangeStatus={setStatusTarget} onReviewVerification={() => selectTab("verification")} summary={summary} />}
      parent={companiesParent}
      title={summary.name}
    >
      <div className="-mx-4 overflow-x-auto border-b border-[#e3e7eb] px-4 sm:mx-0 sm:px-0">
        <div aria-label={t("detail.tabsLabel")} className="flex min-w-max gap-5" role="tablist">
          {TABS.map((item) => (
            <button
              aria-controls={`company-panel-${item}`}
              aria-selected={tab === item}
              className={`-mb-px inline-flex min-h-11 items-center gap-2 border-0 border-b-2 bg-transparent px-0.5 text-sm font-semibold whitespace-nowrap ${ADMIN_PRESS} active:scale-100 ${tab === item ? "border-[#2f6bff] text-[#17191d]" : "border-transparent text-[#626970] hover:text-[#17191d]"}`}
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
              {item === "verification" && summary.verificationStatus === "pending" ? <span aria-label={t("detail.verificationPendingBadge")} className="size-2 rounded-sm bg-amber-500" /> : null}
              {item === "messages" && operationalSummary?.unreadCount ? <span aria-label={tMessaging("thread.unreadBadge", { count: operationalSummary.unreadCount })} className="inline-flex min-w-5 justify-center rounded-sm bg-[#2f6bff] px-1.5 py-0.5 text-[11px] text-white">{operationalSummary.unreadCount > 99 ? "99+" : operationalSummary.unreadCount}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <section aria-labelledby={`company-tab-${tab}`} id={`company-panel-${tab}`} role="tabpanel">
        {tab === "overview" ? <Overview currentStatus={currentStatus} onChangeStatus={setStatusTarget} onSelectTab={selectTab} summary={summary} unreadMessages={operationalSummary?.unreadCount ?? 0} /> : null}
        {tab === "verification" ? <AdminCompanyVerification companyId={companyId} companyName={summary.name} /> : null}
        {tab === "logo" ? <AdminCompanyLogoSection approvedImageId={summary.approvedLogoImageId} submittedImageId={summary.submittedLogoImageId} /> : null}
        {tab === "cover" ? <AdminCompanyCoverSection key={companyId} approvedImageId={summary.approvedCoverImageId} submittedImageId={summary.submittedCoverImageId} /> : null}
        {tab === "portfolioImages" ? <AdminCompanyPortfolioImages companyId={companyId} /> : null}
        {tab === "projectsDeals" ? <ProjectsDeals companyId={companyId} /> : null}
        {tab === "commissions" ? <Commissions companyId={companyId} /> : null}
        {tab === "reviews" ? <Reviews companyId={companyId} /> : null}
        {tab === "activity" ? <CompanyActivityTimeline companyId={companyId} /> : null}
        {tab === "messages" ? operationalSummary === undefined ? <Loading /> : <AdminOperationalMessages companyId={companyId} companyName={summary.name} conversation={operationalSummary} /> : null}
        {tab === "internalNotes" ? <CompanyAdminNotes companyId={companyId} /> : null}
      </section>
      {statusTarget && currentStatus ? <OperationalStatusDialog companyId={companyId} currentStatus={currentStatus} onClose={() => setStatusTarget(null)} target={statusTarget} /> : null}
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

function CompanyHeader({ summary, currentStatus, backHref, onChangeStatus, onReviewVerification }: {
  summary: Summary;
  currentStatus: OperationalStatus | undefined;
  backHref: ReturnType<typeof useCompaniesReturnHref>;
  onChangeStatus: (status: OperationalStatus) => void;
  onReviewVerification: () => void;
}) {
  const t = useTranslations("adminCompanies");
  const tStatus = useTranslations("adminCompanies.operationalStatus");
  return (
    <div>
      <Link className={`-ml-2 inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-[#2456c7] hover:bg-[#eef4ff] ${ADMIN_PRESS}`} href={backHref}>
        <span aria-hidden>←</span>
        {t("detail.back")}
      </Link>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[#eef4ff] text-[#2456c7] ring-1 ring-black/5"><ApprovedCompanyLogo alt="" className="object-cover" fill sizes="56px" url={summary.logoUrl} /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 truncate text-[1.6rem] leading-tight font-semibold tracking-[-0.03em]">{summary.name}</h1>
              <VerificationPill value={summary.verificationStatus} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#626970]">
              <span>{summary.city ?? "—"}</span>
              {currentStatus ? <><span aria-hidden>·</span><OperationalPill value={currentStatus} /></> : null}
              {summary.onboardingStatus === "pending" ? <><span aria-hidden>·</span><span>{t("row.onboardingIncomplete")}</span></> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary.publicProfileSlug ? <Link className={`inline-flex min-h-11 items-center rounded-sm border border-[#dfe3e8] bg-white px-4 text-sm font-semibold ${ADMIN_PRESS}`} href={{ pathname: routes.companyProfile, params: { slug: summary.publicProfileSlug } }}>{t("detail.publicProfile")}</Link> : null}
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger aria-label={t("detail.moreActions")} className={`grid size-11 place-items-center rounded-sm border border-[#dfe3e8] bg-white text-[#17191d] ${ADMIN_PRESS}`}>
              <svg aria-hidden className="size-5" fill="currentColor" viewBox="0 0 20 20"><circle cx="4.5" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="15.5" cy="10" r="1.5" /></svg>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" className="z-50 min-w-64 rounded-[14px] border border-[#e7eaee] bg-white p-1.5 shadow-[0_14px_40px_rgba(16,24,40,0.14)]" sideOffset={8}>
                {summary.verificationStatus === "pending" ? (
                  <DropdownMenu.Item className="flex min-h-10 cursor-pointer items-center rounded-[10px] px-3 text-sm outline-none data-[highlighted]:bg-[#f4f6f8]" onSelect={onReviewVerification}>{t("detail.reviewVerification")}</DropdownMenu.Item>
                ) : null}
                <DropdownMenu.Label className="px-3 pt-2 pb-1 text-xs font-semibold text-[#8b919a]">{tStatus("title")}</DropdownMenu.Label>
                {OPERATIONAL_STATUSES.filter((item) => item !== currentStatus).map((item) => (
                  <DropdownMenu.Item className={`flex min-h-10 cursor-pointer items-center rounded-[10px] px-3 text-sm outline-none data-[highlighted]:bg-[#f4f6f8] ${item === "suspended" ? "text-red-700" : ""}`} disabled={!currentStatus} key={item} onSelect={() => onChangeStatus(item)}>
                    {tStatus("changeTo", { status: tStatus(`status.${item}`) })}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </div>
  );
}

function Overview({ summary, currentStatus, unreadMessages, onSelectTab, onChangeStatus }: {
  summary: Summary;
  currentStatus: OperationalStatus | undefined;
  unreadMessages: number;
  onSelectTab: (tab: AdminCompanyTab) => void;
  onChangeStatus: (status: OperationalStatus) => void;
}) {
  const t = useTranslations("adminCompanies");
  const locale = useLocale();
  const catalog = useQuery(api.serviceCatalog.listActive);
  const actions: { key: string; text: string; cta: string; tab: AdminCompanyTab; tone: "amber" | "red" | "blue" }[] = [];
  if (summary.verificationStatus === "pending") actions.push({ key: "verification", text: t("attention.verificationPending"), cta: t("attention.review"), tab: "verification", tone: "amber" });
  if (currentStatus === "suspended") actions.push({ key: "suspended", text: t("attention.suspended"), cta: t("attention.viewHistory"), tab: "activity", tone: "red" });
  if (currentStatus === "needs_attention") actions.push({ key: "attention", text: t("attention.needsAttention"), cta: t("attention.viewNotes"), tab: "internalNotes", tone: "amber" });
  if (unreadMessages > 0) actions.push({ key: "messages", text: t("attention.unreadMessages", { count: unreadMessages }), cta: t("attention.openMessages"), tab: "messages", tone: "blue" });
  if (summary.commissionSummary.dueCount > 0) actions.push({ key: "commissions", text: t("attention.commissionsDue", { count: summary.commissionSummary.dueCount, amount: money(summary.commissionSummary.dueAmountMad, locale) }), cta: t("attention.viewCommissions"), tab: "commissions", tone: "amber" });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label={t("attention.title")} className="rounded-[14px] border border-[#e7eaee] bg-white lg:col-span-2">
        {actions.length === 0 ? (
          <p className="m-0 flex items-center gap-2 px-4 py-3 text-sm text-[#626970]"><span aria-hidden className="size-2 rounded-sm bg-emerald-500" />{t("attention.none")}</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-[#eef1f4] p-0">
            {actions.map((action) => (
              <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5" key={action.key}>
                <span className="flex items-center gap-2.5 text-sm font-medium text-[#17191d]">
                  <span aria-hidden className={`size-2 shrink-0 rounded-sm ${action.tone === "red" ? "bg-red-500" : action.tone === "blue" ? "bg-[#2f6bff]" : "bg-amber-500"}`} />
                  {action.text}
                </span>
                <button className={`min-h-10 rounded-sm px-3 text-sm font-semibold text-[#2456c7] hover:bg-[#eef4ff] ${ADMIN_PRESS}`} onClick={() => onSelectTab(action.tab)} type="button">{action.cta} →</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid content-start gap-4">
        <section className="rounded-[14px] border border-[#e7eaee] bg-white p-5">
          <h2 className="font-semibold">{t("overview.profile")}</h2>
          <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-[#30343a]">{summary.description || t("overview.noDescription")}</p>
          <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-[#eef1f4] pt-4 sm:grid-cols-2">
            <Field label={t("overview.legalName")} value={summary.legalName ?? "—"} />
            <Field label={t("overview.created")} value={date(summary.createdAt, locale)} />
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold text-[#8b919a]">{t("overview.services")}</dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">{summary.services.length ? summary.services.map((service) => <span className="rounded-sm bg-[#f4f6f8] px-2.5 py-1 text-xs font-medium text-[#30343a]" key={service}>{serviceName(service, catalog ?? [], locale, key => t(`services.${key}`))}</span>) : <span className="text-sm">—</span>}</dd>
            </div>
            <Field label={t("overview.serviceAreas")} value={summary.serviceAreas.join(", ") || "—"} />
          </dl>
        </section>

        <CompanyActivityTimeline
          companyId={summary.companyId}
          footer={<button className={`mt-3 min-h-10 rounded-sm px-3 text-sm font-semibold text-[#2456c7] hover:bg-[#eef4ff] ${ADMIN_PRESS}`} onClick={() => onSelectTab("activity")} type="button">{t("overview.allActivity")} →</button>}
          limit={4}
        />
      </div>

      <aside className="grid content-start gap-4">
        <section className="rounded-[14px] border border-[#e7eaee] bg-white">
          <h2 className="px-5 pt-4 font-semibold">{t("overview.operations")}</h2>
          <dl className="mt-2 divide-y divide-[#eef1f4]">
            <SummaryRow label={t("overview.verification")} value={<VerificationPill value={summary.verificationStatus} />} />
            <SummaryRow label={t("operationalStatus.title")} value={currentStatus ? <OperationalPill value={currentStatus} /> : "—"} />
            <SummaryRow label={t("overview.members")} value={summary.activeMemberCount} />
            <SummaryRow label={t("overview.activeDeals")} value={summary.dealSummary.activeCount} />
            <SummaryRow label={t("overview.completedDeals")} value={summary.dealSummary.completedCount} />
            <SummaryRow label={t("overview.commissionsDue")} value={summary.commissionSummary.dueCount ? `${summary.commissionSummary.dueCount} · ${money(summary.commissionSummary.dueAmountMad, locale)}` : 0} />
            <SummaryRow label={t("overview.reviews")} value={summary.reviewSummary.count} />
          </dl>
          {summary.dealSummary.truncated || summary.commissionSummary.truncated ? <p className="px-5 pb-3 text-xs text-[#8b919a]">{t("overview.boundedSummary")}</p> : null}
        </section>

        <OperationalStatusHistory companyId={summary.companyId} currentStatus={currentStatus} onChangeStatus={onChangeStatus} />

        <section className="rounded-[14px] border border-[#e7eaee] bg-white p-5">
          <h2 className="font-semibold">{t("overview.membersTitle")}</h2>
          {summary.members.length ? <ul className="mt-3 grid gap-2">{summary.members.map((member) => <li className="flex items-center justify-between gap-3 text-sm" key={member.userId}><span className="truncate font-medium">{member.displayName}</span><span className="shrink-0 text-xs text-[#8b919a]">{t(`overview.memberRoles.${member.role}`)}</span></li>)}</ul> : <p className="mt-3 text-sm text-[#8b919a]">{t("overview.noMembers")}</p>}
        </section>
      </aside>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex min-h-11 items-center justify-between gap-3 px-5 py-2"><dt className="text-sm text-[#626970]">{label}</dt><dd className="m-0 text-sm font-semibold text-[#17191d]">{value}</dd></div>;
}

function OperationalStatusHistory({ companyId, currentStatus, onChangeStatus }: {
  companyId: Id<"companies">;
  currentStatus: OperationalStatus | undefined;
  onChangeStatus: (status: OperationalStatus) => void;
}) {
  const t = useTranslations("adminCompanies.operationalStatus");
  const locale = useLocale();
  const { results, status, loadMore } = usePaginatedQuery(api.admin.companyOperationalStatus.listHistory, { companyId }, { initialNumItems: 3 });
  return (
    <section className="rounded-[14px] border border-[#e7eaee] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("title")}</h2>
          <p className="mt-1 text-xs leading-5 text-[#8b919a]">{t("lead")}</p>
        </div>
      </div>
      {currentStatus ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {OPERATIONAL_STATUSES.filter((item) => item !== currentStatus).map((item) => (
            <button className={`min-h-10 rounded-sm border px-3 text-xs font-semibold ${item === "suspended" ? "border-red-200 text-red-700" : "border-[#dfe3e8]"} ${ADMIN_PRESS}`} key={item} onClick={() => onChangeStatus(item)} type="button">
              {t("changeTo", { status: t(`status.${item}`) })}
            </button>
          ))}
        </div>
      ) : null}
      <h3 className="mt-5 text-sm font-semibold">{t("history")}</h3>
      {status === "LoadingFirstPage" ? <Loading /> : results.length ? (
        <ol className="mt-2 grid gap-3">
          {results.map((item) => <li className="border-l-2 border-[#e7eaee] pl-3 text-sm" key={item.id}><span className="font-semibold">{t(`status.${item.fromStatus}`)} → {t(`status.${item.toStatus}`)}</span><p className="mt-0.5 whitespace-pre-wrap text-[#626970]">{item.reason}</p><span className="mt-0.5 block text-xs text-[#8b919a]">{item.changedByDisplayName} · {date(item.createdAt, locale)}</span></li>)}
          {status === "CanLoadMore" ? <li><button className={`min-h-10 rounded-sm px-3 text-sm font-semibold text-[#2456c7] hover:bg-[#eef4ff] ${ADMIN_PRESS}`} onClick={() => loadMore(10)} type="button">{t("loadMore")}</button></li> : null}
        </ol>
      ) : <p className="mt-2 text-sm text-[#8b919a]">{t("emptyHistory")}</p>}
    </section>
  );
}

function OperationalStatusDialog({ companyId, currentStatus, target, onClose }: {
  companyId: Id<"companies">;
  currentStatus: OperationalStatus;
  target: OperationalStatus;
  onClose: () => void;
}) {
  const t = useTranslations("adminCompanies.operationalStatus");
  const change = useMutation(api.admin.companyOperationalStatus.change);
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const highImpact = target === "suspended" || currentStatus === "suspended";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await change({ companyId, toStatus: target, reason });
      onClose();
    } catch {
      setError(t("actionError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" role="presentation">
      <section aria-labelledby={titleId} aria-modal="true" className="w-full max-w-lg rounded-t-[24px] bg-white p-5 sm:rounded-[20px]" role="dialog">
        <h2 className="text-xl font-semibold" id={titleId}>{t("dialogTitle", { status: t(`status.${target}`) })}</h2>
        <p className="mt-2 text-sm leading-6 text-[#626970]">{highImpact ? t("highImpactConfirmation") : t("confirmation")}</p>
        <form className="mt-5" onSubmit={submit}>
          <label className="block text-sm font-semibold" htmlFor="operational-status-reason">{t("reason")}</label>
          <textarea autoFocus className="mt-2 min-h-28 w-full rounded-sm border p-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-[#2f6bff]" id="operational-status-reason" maxLength={1000} minLength={10} onChange={(event) => setReason(event.target.value)} required value={reason} />
          <p className="mt-1 text-xs text-[#8b919a]">{t("reasonHelp")}</p>
          {error ? <p className="mt-3 rounded-sm bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={`min-h-11 rounded-sm border px-4 text-sm font-semibold ${ADMIN_PRESS}`} onClick={onClose} type="button">{t("cancel")}</button><button className={`min-h-11 rounded-sm px-5 text-sm font-semibold text-white disabled:opacity-50 ${target === "suspended" ? "bg-red-700" : "bg-[#2f6bff]"} ${ADMIN_PRESS}`} disabled={busy || reason.trim().length < 10} type="submit">{busy ? t("saving") : t("confirm")}</button></div>
        </form>
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
  const { results: rows, status, loadMore } = usePaginatedQuery(
    api.admin.deals.listCommissionObligations,
    { status: "all", companyId },
    { initialNumItems: 15 },
  );
  const [selected, setSelected] = useState<Commission | null>(null);
  return <DataSection title={t("commissions.title")}><PaginatedState empty={t("commissions.empty")} loadMore={() => loadMore(15)} loading={status === "LoadingFirstPage"} loadingMore={status === "LoadingMore"} canLoadMore={status === "CanLoadMore"}>{rows.map((row) => <article className="flex flex-col gap-3 rounded-[14px] bg-[#f8fafb] p-4 sm:flex-row sm:items-center sm:justify-between" key={row.dealId}><div><h3 className="font-semibold">{row.projectTitle}</h3><p className="mt-1 text-sm text-[#626970]">{money(row.commissionAmountMad, locale)} · {t(`commissions.status.${row.commissionStatus}`)}</p></div><button className={`min-h-10 rounded-sm border bg-white px-4 text-sm font-semibold ${ADMIN_PRESS}`} onClick={() => setSelected(row)} type="button">{t("commissions.view")}</button></article>)}</PaginatedState>{selected ? <CommissionDialog locale={locale} onClose={() => setSelected(null)} row={selected} /> : null}</DataSection>;
}

function CommissionDialog({ row, locale, onClose }: { row: Commission; locale: string; onClose: () => void }) {
  const t = useTranslations("adminCompanies");
  const markPaid = useMutation(api.admin.deals.markCommissionPaid);
  const titleId = useId();
  const [reference, setReference] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await markPaid({ dealId: row.dealId, paymentReference: reference || undefined, paymentNote: note || undefined }); onClose(); } catch { setError(t("commissions.actionError")); } finally { setBusy(false); } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" role="presentation"><section aria-labelledby={titleId} aria-modal="true" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[24px] bg-white p-5 sm:rounded-[24px]" role="dialog"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[#626970]">{money(row.commissionAmountMad, locale)}</p><h2 className="text-xl font-semibold" id={titleId}>{row.projectTitle}</h2></div><button aria-label={t("commissions.close")} className={`size-11 rounded-sm bg-[#f4f6f8] ${ADMIN_PRESS}`} onClick={onClose} type="button">×</button></div>{row.commissionStatus === "due" ? <form className="mt-5" onSubmit={submit}><label className="block text-sm font-semibold">{t("commissions.reference")}<input className="mt-2 min-h-11 w-full rounded-sm border px-3 font-normal" maxLength={120} onChange={(event) => setReference(event.target.value)} value={reference} /></label><label className="mt-4 block text-sm font-semibold">{t("commissions.note")}<textarea className="mt-2 min-h-24 w-full rounded-sm border p-3 font-normal" maxLength={1000} onChange={(event) => setNote(event.target.value)} value={note} /></label>{error ? <p className="mt-3 rounded-sm bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}<button className={`mt-5 min-h-11 rounded-sm bg-[#2f6bff] px-5 text-sm font-semibold text-white disabled:opacity-50 ${ADMIN_PRESS}`} disabled={busy} type="submit">{busy ? t("saving") : t("commissions.markPaid")}</button></form> : <dl className="mt-5 grid gap-4 sm:grid-cols-2"><Field label={t("commissions.reference")} value={row.paymentReference ?? "—"} /><Field label={t("commissions.note")} value={row.paymentNote ?? "—"} /><Field label={t("commissions.paidAt")} value={row.paidAt ? date(row.paidAt, locale) : "—"} /></dl>}</section></div>;
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
  return <article className="rounded-[14px] bg-[#f8fafb] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{review.projectTitle}</h3><p className="mt-1 text-sm text-[#626970]">{review.reviewerName} · {date(review.createdAt, locale)} · {review.rating}/5</p></div><button className={`min-h-10 rounded-sm border bg-white px-4 text-sm font-semibold disabled:opacity-50 ${ADMIN_PRESS}`} disabled={busy} onClick={() => void update()} type="button">{t(`reviews.${next === "hidden" ? "hide" : "restore"}`)}</button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#30343a]">{review.comment}</p>{error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}</article>;
}

function DataSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[14px] border border-[#e7eaee] bg-white p-4 sm:p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4">{children}</div></section>; }
function PaginatedState({ children, empty, loading, canLoadMore, loadingMore, loadMore }: { children: React.ReactNode[]; empty: string; loading: boolean; canLoadMore: boolean; loadingMore: boolean; loadMore: () => void }) { const t = useTranslations("adminCompanies"); if (loading) return <Loading />; if (children.length === 0) return <Empty text={empty} />; return <div className="grid gap-3">{children}{canLoadMore || loadingMore ? <button className={`min-h-11 rounded-sm border px-4 text-sm font-semibold disabled:opacity-50 ${ADMIN_PRESS}`} disabled={loadingMore} onClick={loadMore} type="button">{loadingMore ? t("loadingMore") : t("loadMore")}</button> : null}</div>; }
function Loading() { const t = useTranslations("adminCompanies"); return <div aria-busy="true" className="space-y-3" role="status"><span className="sr-only">{t("loading")}</span>{Array.from({ length: 3 }).map((_, index) => <div className="h-20 animate-pulse rounded-sm bg-[#f4f6f8]" key={index} />)}</div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-sm bg-[#f8fafb] px-4 py-10 text-center text-sm text-[#8b919a]">{text}</p>; }
function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold text-[#8b919a]">{label}</dt><dd className="mt-1 text-sm font-medium text-[#30343a]">{value}</dd></div>; }
function Pill({ text, tone }: { text: string; tone: "green" | "red" | "amber" | "slate" }) { const style = tone === "green" ? "bg-emerald-100 text-emerald-800" : tone === "red" ? "bg-red-100 text-red-800" : tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"; return <span className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${style}`}>{text}</span>; }
function money(value: number, locale: string) { return new Intl.NumberFormat(locale, { style: "currency", currency: "MAD", maximumFractionDigits: 0 }).format(value); }
function date(value: number, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(value); }
