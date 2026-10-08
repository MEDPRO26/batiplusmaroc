"use client";

import { useMutation, useQuery } from "convex/react";
import { Component, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ServiceAreasEditor } from "./profile-editors";
import { EditIconButton, type ProfileManager } from "./profile-editing";
import { useToast } from "@/features/shared/components/app-feedback";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { workspaceButton } from "@/features/shared/components/workspace-page";
import { createSubmitLock } from "@/lib/forms/submit";
import {
  commitGeographicCoverage,
  coverageKind,
  coverageOverlap,
  coveragePlaceName,
  coverageSelectionsEqual,
  filterProvincesByName,
  provincesForBrowse,
  reconcileCoverageDraft,
  setCoverageSelection,
  type CoverageLocale,
} from "@/lib/geography/coverage-selection";
import { getRegions } from "@/lib/geography/morocco";
import { mapAppError, mapConvexFailure } from "@/lib/errors";

const controlClass =
  "min-h-11 w-full min-w-0 rounded-sm border border-[#c5c8cb] bg-white px-3 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function localeOf(value: string): CoverageLocale {
  return value === "fr" ? "fr" : "en";
}

function scopeDomId(key: string) {
  return `coverage-scope-${key.replace(/:/g, "-")}`;
}

export function GeographicCoverageForm({
  draft,
  onDraftChange,
  browseRegion,
  onBrowseRegion,
  provinceQuery,
  onProvinceQuery,
  saving,
  error,
  success,
  dirty,
  onSave,
  onDiscard,
}: {
  draft: readonly string[];
  onDraftChange: (next: string[]) => void;
  browseRegion: string;
  onBrowseRegion: (regionCode: string) => void;
  provinceQuery: string;
  onProvinceQuery: (query: string) => void;
  saving: boolean;
  error: string | null;
  success: boolean;
  dirty: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
}) {
  const t = useTranslations("companyProfileManager");
  const locale = localeOf(useLocale());
  const selected = new Set(draft);
  const overlap = coverageOverlap(draft);
  const regions = getRegions();
  const browsed = provincesForBrowse(browseRegion);
  const visibleProvinces = filterProvincesByName(browsed, provinceQuery, locale);

  function toggle(key: string, enabled: boolean) {
    onDraftChange(setCoverageSelection(draft, key, enabled));
  }

  return (
    <form
      className="grid min-w-0 max-w-full gap-6 overflow-x-hidden"
      id="coverage-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!saving) return onSave();
      }}
    >
      <section aria-labelledby="coverage-selected-heading">
        <h3 className="m-0 text-sm font-semibold text-ink" id="coverage-selected-heading">{t("coverage.selected")}</h3>
        {draft.length === 0 ? (
          <p className="mt-2 mb-0 text-sm text-muted">{t("coverage.empty")}</p>
        ) : (
          <ul aria-label={t("coverage.selected")} className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
            {draft.map((key) => {
              const kind = coverageKind(key);
              const place = key === "MA" ? t("coverage.allMorocco") : coveragePlaceName(key, locale);
              if (!kind || !place) return null;
              const label = kind === "country" ? place : `${place} · ${t(`coverage.kind.${kind}`)}`;
              return (
                <li key={key}>
                  <button
                    aria-label={t("dialogs.remove", { item: label })}
                    className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-brand-soft px-3 text-left text-sm font-medium break-words text-brand-dark hover:bg-[#dbe8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    id={scopeDomId(`remove-${key}`)}
                    onClick={() => toggle(key, false)}
                    type="button"
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {overlap === "national" ? <div className="mt-3"><FriendlyAlert tone="info">{t("coverage.nationalOverlap")}</FriendlyAlert></div> : null}
        {overlap === "regional" ? <div className="mt-3"><FriendlyAlert tone="info">{t("coverage.regionalOverlap")}</FriendlyAlert></div> : null}
      </section>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="text-sm font-semibold text-ink">{t("coverage.allMorocco")}</legend>
        <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-sm px-1 py-1 text-sm text-ink" htmlFor="coverage-scope-MA">
          <input
            checked={selected.has("MA")}
            className="mt-1 size-4 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            data-scope="MA"
            id="coverage-scope-MA"
            onChange={(event) => toggle("MA", event.target.checked)}
            type="checkbox"
          />
          <span>
            {t("coverage.allMorocco")}
            <span className="mt-1 block text-xs leading-5 font-normal text-muted" id="coverage-national-help">{t("coverage.allMoroccoHelp")}</span>
          </span>
        </label>
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="text-sm font-semibold text-ink">{t("coverage.entireRegions")}</legend>
        <p className="mt-1 mb-2 text-xs leading-5 text-muted">{t("coverage.entireRegionsHelp")}</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {regions.map((region) => {
            const key = `R:${region.code}`;
            const name = locale === "fr" ? region.nameFr : region.nameEn;
            return (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-1 text-sm text-ink" htmlFor={scopeDomId(key)} key={region.code}>
                <input
                  checked={selected.has(key)}
                  className="size-4 shrink-0 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  data-scope={key}
                  id={scopeDomId(key)}
                  onChange={(event) => toggle(key, event.target.checked)}
                  type="checkbox"
                />
                <span className="min-w-0 break-words">{name}<span className="mt-0.5 block text-xs font-normal text-muted">{t("coverage.entireRegion")}</span></span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="text-sm font-semibold text-ink">{t("coverage.provinces")}</legend>
        <p className="mt-1 mb-3 text-xs leading-5 text-muted" id="coverage-browse-help">{t("coverage.browseHelp")}</p>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium text-ink" htmlFor="coverage-browse-region">
          {t("coverage.browseRegion")}
          <select
            aria-describedby="coverage-browse-help"
            className={controlClass}
            id="coverage-browse-region"
            onChange={(event) => {
              onBrowseRegion(event.target.value);
              onProvinceQuery("");
            }}
            value={browseRegion}
          >
            <option value="">{t("coverage.browsePlaceholder")}</option>
            {regions.map((region) => (
              <option key={region.code} value={region.code}>{locale === "fr" ? region.nameFr : region.nameEn}</option>
            ))}
          </select>
        </label>
        {browseRegion ? (
          <div className="mt-3 min-w-0">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium text-ink" htmlFor="coverage-province-search">
              {t("coverage.searchProvinces")}
              <input
                autoComplete="off"
                className={controlClass}
                id="coverage-province-search"
                onChange={(event) => onProvinceQuery(event.target.value)}
                type="search"
                value={provinceQuery}
              />
            </label>
            <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
              {visibleProvinces.map((province) => {
                const key = `P:${province.code}`;
                const name = locale === "fr" ? province.nameFr : province.nameEn;
                return (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-1 text-sm text-ink" htmlFor={scopeDomId(key)} key={province.code}>
                    <input
                      checked={selected.has(key)}
                      className="size-4 shrink-0 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      data-scope={key}
                      id={scopeDomId(key)}
                      onChange={(event) => toggle(key, event.target.checked)}
                      type="checkbox"
                    />
                    <span className="min-w-0 break-words">{name}<span className="mt-0.5 block text-xs font-normal text-muted">{t(`coverage.kind.${province.kind}`)}</span></span>
                  </label>
                );
              })}
            </div>
            {visibleProvinces.length === 0 ? <p className="mt-2 mb-0 text-sm text-muted">{t("coverage.noProvinceMatches")}</p> : null}
          </div>
        ) : (
          <p className="mt-3 mb-0 text-sm text-muted">{t("coverage.browsePrompt")}</p>
        )}
      </fieldset>

      {error ? <FriendlyAlert>{error}</FriendlyAlert> : null}
      {success ? <FriendlyAlert tone="success">{t("coverage.success")}</FriendlyAlert> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className={workspaceButton.secondary} disabled={!dirty || saving} id="coverage-discard" onClick={onDiscard} type="button">
          {t("coverage.discard")}
        </button>
        <button className={workspaceButton.primary} disabled={saving} id="coverage-save" type="submit">
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}

export function GeographicCoveragePanel({
  savedKeys,
  onDismiss,
}: {
  savedKeys: readonly string[];
  onDismiss?: () => void;
}) {
  const t = useTranslations("companyProfileManager");
  const tUx = useTranslations("ux");
  const update = useMutation(api.companies.index.updateMyGeographicCoverage);
  const { showToast } = useToast();
  const lockRef = useRef(createSubmitLock());
  const [draft, setDraft] = useState<string[]>(() => [...savedKeys]);
  const [baseline, setBaseline] = useState<string[]>(() => [...savedKeys]);
  const [seenIncoming, setSeenIncoming] = useState<string[]>(() => [...savedKeys]);
  const [browseRegion, setBrowseRegion] = useState("");
  const [provinceQuery, setProvinceQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!coverageSelectionsEqual(savedKeys, seenIncoming)) {
    const next = reconcileCoverageDraft(draft, baseline, savedKeys);
    setSeenIncoming([...savedKeys]);
    if (!coverageSelectionsEqual(baseline, next.baseline)) setBaseline(next.baseline);
    if (!coverageSelectionsEqual(draft, next.draft)) setDraft(next.draft);
  }

  async function save() {
    if (!lockRef.current.tryAcquire()) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await commitGeographicCoverage(draft, update);
      if (result.ok) {
        const saved = [...result.coverageScopeKeys];
        setBaseline(saved);
        setDraft(saved);
        setSuccess(true);
        showToast(t("coverage.success"));
      } else if (result.reason === "invalid") {
        setError(mapAppError({ data: result.error }, (key) => tUx(key)));
      } else {
        setError(mapConvexFailure(result.cause, (key) => tUx(key)).message);
        showToast(t("coverage.failure"), "error");
      }
    } finally {
      setSaving(false);
      lockRef.current.release();
    }
  }

  function discard() {
    setDraft([...baseline]);
    setError(null);
    setSuccess(false);
  }

  return (
    <div className="flex max-h-[min(88dvh,760px)] min-w-0 flex-col">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <Dialog.Title className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">{t("coverage.title")}</Dialog.Title>
          <Dialog.Description className="mt-1.5 mb-0 text-sm leading-6 text-muted">{t("coverage.lead")}</Dialog.Description>
        </div>
        {onDismiss ? (
          <button
            aria-label={t("cancel")}
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-sm border-0 bg-transparent text-muted hover:bg-brand-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            onClick={onDismiss}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <GeographicCoverageForm
          browseRegion={browseRegion}
          dirty={!coverageSelectionsEqual(draft, baseline)}
          draft={draft}
          error={error}
          onBrowseRegion={setBrowseRegion}
          onDiscard={discard}
          onDraftChange={(next) => {
            setDraft(next);
            setSuccess(false);
            setError(null);
          }}
          onProvinceQuery={setProvinceQuery}
          onSave={() => save()}
          provinceQuery={provinceQuery}
          saving={saving}
          success={success}
        />
      </div>
    </div>
  );
}

export function GeographicCoverageDialog({ savedKeys }: { savedKeys: readonly string[] }) {
  const t = useTranslations("companyProfileManager");
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <EditIconButton label={t("coverage.edit")} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#0f1f2e]/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[71] w-[calc(100vw-24px)] max-w-[720px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgb(15_31_46/0.22)] outline-none">
          {open ? <GeographicCoveragePanel onDismiss={() => setOpen(false)} savedKeys={savedKeys} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CoverageSummary({ keys }: { keys: readonly string[] }) {
  const t = useTranslations("companyProfileManager");
  const locale = localeOf(useLocale());
  if (keys.length === 0) return <p className="m-0 text-sm text-muted">{t("coverage.empty")}</p>;
  return (
    <ul aria-label={t("coverage.selected")} className="m-0 flex list-none flex-wrap gap-2 p-0">
      {keys.map((key) => {
        const kind = coverageKind(key);
        const place = key === "MA" ? t("coverage.allMorocco") : coveragePlaceName(key, locale);
        if (!kind || !place) return null;
        const label = kind === "country" ? place : `${place} · ${t(`coverage.kind.${kind}`)}`;
        return <li className="max-w-full rounded-sm bg-[#eef2f5] px-2.5 py-1 text-xs font-medium break-words text-ink" key={key}>{label}</li>;
      })}
    </ul>
  );
}

function LegacyServiceAreas({ profile }: { profile: ProfileManager }) {
  const t = useTranslations("companyProfileManager");
  if (profile.serviceAreas.length === 0) return null;
  return (
    <div className="min-w-0 border-t border-brand-border pt-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="m-0 text-xs font-semibold tracking-wide text-muted uppercase">{t("coverage.legacyTitle")}</h3>
        <ServiceAreasEditor profile={profile} />
      </div>
      <p className="mt-1.5 mb-2 text-xs leading-5 text-muted">{t("coverage.legacyHelp")}</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {profile.serviceAreas.map((area) => (
          <li className="rounded-sm bg-white px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-brand-border" key={area}>
            {t(`serviceAreaOptions.${area}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoverageDeclaration({ profile, frame }: { profile: ProfileManager; frame: "sidebar" | "settings" }) {
  const t = useTranslations("companyProfileManager");
  const coverage = useQuery(api.companies.index.getMyGeographicCoverage, {});
  const title = t("coverage.title");
  const action = coverage === undefined ? null : <GeographicCoverageDialog savedKeys={coverage} />;
  const heading = frame === "sidebar" ? (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <h2 className="m-0 text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      {action}
    </div>
  ) : (
    <div className="flex items-start justify-between gap-4">
      <h3 className="m-0 text-[1.05rem] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      {action}
    </div>
  );
  return (
    <div className="grid min-w-0 gap-4">
      {heading}
      <p className="m-0 text-xs leading-5 text-muted">{t("coverage.headquartersSeparate")}</p>
      {coverage === undefined ? (
        <p aria-busy="true" className="m-0 text-sm text-muted" role="status">{t("coverage.loading")}</p>
      ) : (
        <CoverageSummary keys={coverage} />
      )}
      <LegacyServiceAreas profile={profile} />
    </div>
  );
}

function CoverageUnavailable({ profile, frame }: { profile: ProfileManager; frame: "sidebar" | "settings" }) {
  const t = useTranslations("companyProfileManager");
  const title = t("coverage.title");
  const heading = frame === "sidebar"
    ? <h2 className="m-0 text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
    : <h3 className="m-0 text-[1.05rem] font-semibold tracking-[-0.01em] text-ink">{title}</h3>;
  return (
    <div className="grid min-w-0 gap-4">
      {heading}
      <FriendlyAlert>{t("coverage.loadError")}</FriendlyAlert>
      <LegacyServiceAreas profile={profile} />
    </div>
  );
}

class CoverageErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CompanyServiceAreas({ profile, frame }: { profile: ProfileManager; frame: "sidebar" | "settings" }) {
  const body = (
    <CoverageErrorBoundary fallback={<CoverageUnavailable frame={frame} profile={profile} />}>
      <CoverageDeclaration frame={frame} profile={profile} />
    </CoverageErrorBoundary>
  );
  if (frame === "sidebar") {
    return (
      <section className="border-b border-brand-border py-5 first:pt-0 last:border-b-0 last:pb-0">
        {body}
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-brand-border bg-white px-5 py-5 sm:px-7 sm:py-6">
      {body}
    </section>
  );
}
