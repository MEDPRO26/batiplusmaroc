"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MoreHorizontal, Pencil, Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import { AdminPage, ADMIN_PRESS } from "./admin-shell";

type Service = FunctionReturnType<typeof api.serviceCatalog.listAdmin>[number];
type View = "all" | "active" | "inactive";
type Drawer = { mode: "create" } | { mode: "edit"; row: Service } | null;

const VIEWS: View[] = ["all", "active", "inactive"];
const PRIMARY = `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-[#2f6bff] px-4 text-sm font-semibold text-white hover:bg-[#2456c7] disabled:opacity-50 ${ADMIN_PRESS}`;
const SECONDARY = `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#e6e9ee] bg-white px-4 text-sm font-semibold text-[#17191d] hover:bg-[#f7f9fc] disabled:opacity-50 ${ADMIN_PRESS}`;
const ICON_BUTTON = `inline-flex size-9 items-center justify-center rounded-full text-[#626970] hover:bg-[#f2f4f7] hover:text-[#17191d] disabled:opacity-50 ${ADMIN_PRESS}`;
const INPUT = "min-h-11 w-full rounded-[10px] border border-[#d8dce3] bg-white px-3 text-sm text-[#17191d] outline-none placeholder:text-[#a0a6ae] focus:border-[#2f6bff] focus:ring-3 focus:ring-[#2f6bff]/15";
const PILL = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

function errorKey(caught: unknown) {
  const text = String(caught);
  if (text.includes("SERVICE_SLUG_IN_USE")) return "slugInUse";
  if (text.includes("SERVICE_SLUG_TAKEN")) return "slugTaken";
  if (text.includes("INVALID_SERVICE_SLUG")) return "slugInvalid";
  return "error";
}

/** Suggests a camelCase slug matching the existing catalog convention (e.g. "houseConstruction"). */
function suggestSlug(name: string) {
  const words = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const slug = words.map((word, index) => (index ? word[0].toUpperCase() + word.slice(1) : word)).join("");
  return slug.replace(/^[0-9]+/, "").slice(0, 64);
}

export function AdminServicesPanel() {
  const t = useTranslations("adminServices");
  const locale = useLocale();
  const rows = useQuery(api.serviceCatalog.listAdmin);
  const edit = useMutation(api.serviceCatalog.edit);
  const seed = useMutation(api.serviceCatalog.seedDefaults);
  const migrate = useMutation(api.serviceCatalog.migrateLegacySelections);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);

  const counts = useMemo(() => {
    const active = rows?.filter(row => row.isActive).length ?? 0;
    return { all: rows?.length ?? 0, active, inactive: (rows?.length ?? 0) - active };
  }, [rows]);
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (rows ?? []).filter(row =>
      (view === "all" || row.isActive === (view === "active")) &&
      (!needle || [row.slug, row.nameFr, row.nameEn].some(value => value.toLocaleLowerCase().includes(needle))),
    );
  }, [rows, search, view]);
  const nextOrder = rows?.length ? Math.max(...rows.map(row => row.sortOrder)) + 10 : 0;

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(current => (current === message ? "" : current)), 4000);
  }
  async function toggle(row: Service) {
    try {
      await edit({ id: row._id, slug: row.slug, nameFr: row.nameFr, nameEn: row.nameEn, sortOrder: row.sortOrder, isActive: !row.isActive });
      flash(row.isActive ? t("deactivated") : t("activated"));
    } catch (caught) { flash(t(errorKey(caught))); }
  }
  async function onSeed() {
    setBusy(true);
    try { const result = await seed({}); flash(t("seeded", { count: result.created })); }
    catch { flash(t("error")); } finally { setBusy(false); }
  }
  async function onMigrate() {
    setBusy(true);
    try {
      let cursor: string | null = null;
      let migrated = 0;
      const unresolved = new Set<string>();
      do {
        const page: FunctionReturnType<typeof api.serviceCatalog.migrateLegacySelections> = await migrate({ paginationOpts: { numItems: 50, cursor } });
        migrated += page.migrated;
        page.unresolved.forEach(value => unresolved.add(value));
        cursor = page.isDone ? null : page.continueCursor;
      } while (cursor !== null);
      flash(unresolved.size ? t("migrationUnresolved", { count: unresolved.size, values: [...unresolved].join(", ") }) : t("migrated", { count: migrated }));
    } catch { flash(t("error")); } finally { setBusy(false); }
  }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.7rem] font-semibold tracking-[-0.03em]">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[#626970]">{t("lead")}</p>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label={t("moreActions")} className={SECONDARY} disabled={busy} type="button">
              <MoreHorizontal aria-hidden className="size-4" />
              <span className="hidden sm:inline">{busy ? t("working") : t("tools")}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem className="flex-col items-start gap-0.5 py-2" onSelect={onSeed}>
              <span className="font-medium">{t("seed")}</span>
              <span className="text-xs text-[#8b919a]">{t("seedHint")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-col items-start gap-0.5 py-2" onSelect={onMigrate}>
              <span className="font-medium">{t("migrate")}</span>
              <span className="text-xs text-[#8b919a]">{t("migrateHint")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button className={PRIMARY} onClick={() => setDrawer({ mode: "create" })} type="button">
          <Plus aria-hidden className="size-4" />{t("addService")}
        </button>
      </div>
    </div>
  );

  return <AdminPage breadcrumb={t("title")} header={header} notice={notice} title={t("title")}>
    <section aria-label={t("list")} className="overflow-hidden rounded-[16px] border border-[#e7eaee] bg-white">
      {rows?.length === 0 ? <p className="m-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-5" role="alert">{t("emptyWarning")}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[#eef1f4] px-4 sm:px-5">
        <div aria-label={t("views.label")} className="flex gap-5 overflow-x-auto" role="group">
          {VIEWS.map(key => (
            <button
              aria-pressed={view === key}
              className={`-mb-px inline-flex min-h-12 items-center gap-2 border-0 border-b-2 border-transparent bg-transparent px-0.5 text-sm font-semibold whitespace-nowrap text-[#626970] hover:text-[#17191d] aria-pressed:border-[#2f6bff] aria-pressed:text-[#17191d] ${ADMIN_PRESS} active:scale-100`}
              key={key}
              onClick={() => setView(key)}
              type="button"
            >
              {t(`views.${key}`)}
              <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-xs font-semibold text-[#626970] tabular-nums">{counts[key]}</span>
            </button>
          ))}
        </div>
        <label className="mb-3 flex min-h-10 w-full items-center gap-2 rounded-full border border-[#e7eaee] bg-white px-4 text-sm focus-within:border-[#2f6bff] sm:mb-0 sm:w-72">
          <Search aria-hidden className="size-4 shrink-0 text-[#8b919a]" />
          <span className="sr-only">{t("searchLabel")}</span>
          <input className="h-10 w-full bg-transparent outline-none placeholder:text-[#8b919a]" onChange={event => setSearch(event.target.value)} placeholder={t("searchPlaceholder")} type="search" value={search} />
        </label>
      </div>

      {rows === undefined ? (
        <div aria-busy="true" className="space-y-2 p-4 sm:p-5" role="status">
          <span className="sr-only">{t("loading")}</span>
          {Array.from({ length: 6 }).map((_, index) => <div className="h-14 animate-pulse rounded-[10px] bg-[#f4f6f8]" key={index} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="grid justify-items-center gap-3 px-6 py-16 text-center">
          <p className="m-0 text-base font-semibold text-[#17191d]">{t("empty")}</p>
          <p className="m-0 max-w-sm text-sm text-[#626970]">{t("emptyHint")}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button className={SECONDARY} disabled={busy} onClick={onSeed} type="button">{t("seed")}</button>
            <button className={PRIMARY} onClick={() => setDrawer({ mode: "create" })} type="button"><Plus aria-hidden className="size-4" />{t("addService")}</button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="grid justify-items-center gap-3 px-6 py-14 text-center">
          <p className="m-0 text-sm text-[#626970]">{t("noResults")}</p>
          <button className={SECONDARY} onClick={() => { setSearch(""); setView("all"); }} type="button">{t("clearFilters")}</button>
        </div>
      ) : (
        <>
          <ul className="m-0 list-none divide-y divide-[#eef1f4] p-0 md:hidden">
            {visible.map(row => <ServiceCard key={row._id} locale={locale} onEdit={() => setDrawer({ mode: "edit", row })} onToggle={() => toggle(row)} row={row} />)}
          </ul>
          <table className="hidden w-full border-collapse text-left text-sm md:table">
            <thead className="bg-[#fafbfc]">
              <tr className="text-xs font-semibold text-[#8b919a]">
                <th className="px-5 py-2.5 font-semibold" scope="col">{t("columns.service")}</th>
                <th className="px-4 py-2.5 font-semibold" scope="col">{t("slug")}</th>
                <th className="w-24 px-4 py-2.5 text-right font-semibold" scope="col">{t("sortOrder")}</th>
                <th className="w-32 px-4 py-2.5 font-semibold" scope="col">{t("columns.status")}</th>
                <th className="w-28 px-5 py-2.5" scope="col"><span className="sr-only">{t("columns.actions")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {visible.map(row => (
                <tr className="group hover:bg-[#f7f9fc]" key={row._id}>
                  <td className="px-5 py-3">
                    <button className="block max-w-full cursor-pointer truncate text-left font-semibold text-[#17191d] hover:text-[#2456c7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]" onClick={() => setDrawer({ mode: "edit", row })} type="button">
                      {primaryName(row, locale)}
                    </button>
                    <span className="mt-0.5 block truncate text-xs text-[#8b919a]">{secondaryName(row, locale)}</span>
                  </td>
                  <td className="px-4 py-3"><code className="rounded-md bg-[#f2f4f7] px-1.5 py-0.5 font-mono text-xs text-[#475467]">{row.slug}</code></td>
                  <td className="px-4 py-3 text-right text-[#626970] tabular-nums">{row.sortOrder}</td>
                  <td className="px-4 py-3"><StatusPill active={row.isActive} /></td>
                  <td className="px-5 py-3"><RowActions onEdit={() => setDrawer({ mode: "edit", row })} onToggle={() => toggle(row)} row={row} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>

    <ServiceDrawer
      drawer={drawer}
      nextOrder={nextOrder}
      onClose={() => setDrawer(null)}
      onSaved={message => { setDrawer(null); flash(message); }}
    />
  </AdminPage>;
}

function primaryName(row: Service, locale: string) { return locale === "fr" ? row.nameFr : row.nameEn; }
function secondaryName(row: Service, locale: string) { return locale === "fr" ? row.nameEn : row.nameFr; }

function StatusPill({ active }: { active: boolean }) {
  const t = useTranslations("adminServices");
  return <span className={`${PILL} ${active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
    <span aria-hidden className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
    {active ? t("statusActive") : t("statusInactive")}
  </span>;
}

function RowActions({ row, onEdit, onToggle }: { row: Service; onEdit: () => void; onToggle: () => void }) {
  const t = useTranslations("adminServices");
  const locale = useLocale();
  const name = primaryName(row, locale);
  return <div className="flex items-center justify-end gap-1">
    <button aria-label={t("editAria", { name })} className={ICON_BUTTON} onClick={onEdit} type="button"><Pencil aria-hidden className="size-4" /></button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={t("rowMenuAria", { name })} className={ICON_BUTTON} type="button"><MoreHorizontal aria-hidden className="size-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onEdit}>{t("edit")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle} variant={row.isActive ? "destructive" : "default"}>{row.isActive ? t("deactivate") : t("activate")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

function ServiceCard({ row, locale, onEdit, onToggle }: { row: Service; locale: string; onEdit: () => void; onToggle: () => void }) {
  return <li className="flex items-center gap-3 px-4 py-3">
    <button className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]" onClick={onEdit} type="button">
      <span className="block truncate font-semibold text-[#17191d]">{primaryName(row, locale)}</span>
      <span className="mt-0.5 block truncate text-xs text-[#8b919a]">{secondaryName(row, locale)} · <code className="font-mono">{row.slug}</code> · #{row.sortOrder}</span>
      <span className="mt-1.5 block"><StatusPill active={row.isActive} /></span>
    </button>
    <RowActions onEdit={onEdit} onToggle={onToggle} row={row} />
  </li>;
}

function ServiceDrawer({ drawer, nextOrder, onClose, onSaved }: { drawer: Drawer; nextOrder: number; onClose: () => void; onSaved: (message: string) => void }) {
  const t = useTranslations("adminServices");
  const row = drawer?.mode === "edit" ? drawer.row : null;
  return <Dialog.Root onOpenChange={open => { if (!open) onClose(); }} open={drawer !== null}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col bg-white shadow-[-16px_0_48px_rgba(16,24,40,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right">
        <div className="flex items-start justify-between gap-4 border-b border-[#eef1f4] px-6 py-5">
          <div className="min-w-0">
            <Dialog.Title className="m-0 text-lg font-semibold tracking-[-0.02em] text-[#17191d]">{row ? t("editTitle") : t("create")}</Dialog.Title>
            <Dialog.Description className="m-0 mt-1 text-sm text-[#626970]">{row ? t("editDescription") : t("createDescription")}</Dialog.Description>
          </div>
          <Dialog.Close asChild><button aria-label={t("close")} className={ICON_BUTTON} type="button"><X aria-hidden className="size-4" /></button></Dialog.Close>
        </div>
        {drawer ? <ServiceForm key={row ? `${row._id}-${row.updatedAt}` : "create"} nextOrder={nextOrder} onCancel={onClose} onSaved={onSaved} row={row} /> : null}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function ServiceForm({ row, nextOrder, onCancel, onSaved }: { row: Service | null; nextOrder: number; onCancel: () => void; onSaved: (message: string) => void }) {
  const t = useTranslations("adminServices");
  const create = useMutation(api.serviceCatalog.create);
  const edit = useMutation(api.serviceCatalog.edit);
  const [nameFr, setNameFr] = useState(row?.nameFr ?? "");
  const [nameEn, setNameEn] = useState(row?.nameEn ?? "");
  const [slug, setSlug] = useState(row?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(row !== null);
  const [sortOrder, setSortOrder] = useState(String(row?.sortOrder ?? nextOrder));
  const [isActive, setIsActive] = useState(row?.isActive ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = { slug, nameFr, nameEn, sortOrder: Number(sortOrder) };
    try {
      if (row) await edit({ id: row._id, ...values, isActive });
      else await create(values);
      onSaved(t("saved"));
    } catch (caught) { setError(t(errorKey(caught))); } finally { setBusy(false); }
  }

  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
    <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 py-6">
      <FormField label={t("nameFr")}>
        <input className={INPUT} lang="fr" maxLength={100} minLength={2} onChange={event => setNameFr(event.target.value)} required value={nameFr} />
      </FormField>
      <FormField label={t("nameEn")}>
        <input className={INPUT} lang="en" maxLength={100} minLength={2} onChange={event => { setNameEn(event.target.value); if (!slugTouched) setSlug(suggestSlug(event.target.value)); }} required value={nameEn} />
      </FormField>
      <FormField hint={t("slugHint")} label={t("slug")}>
        <input className={`${INPUT} font-mono`} onChange={event => { setSlugTouched(true); setSlug(event.target.value); }} pattern="[a-z][A-Za-z0-9\-]{1,63}" required spellCheck={false} value={slug} />
      </FormField>
      <FormField hint={t("orderHint")} label={t("sortOrder")}>
        <input className={`${INPUT} w-32`} max={1_000_000} min={0} onChange={event => setSortOrder(event.target.value)} required step={1} type="number" value={sortOrder} />
      </FormField>
      {row ? (
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[12px] border border-[#e7eaee] p-4">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#17191d]">{t("active")}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[#626970]">{t("activeHint")}</span>
          </span>
          <input checked={isActive} className="peer sr-only" onChange={event => setIsActive(event.target.checked)} role="switch" type="checkbox" />
          <span aria-hidden className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-[#d0d5dd] transition-colors peer-checked:bg-[#2f6bff] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#2f6bff] after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
        </label>
      ) : null}
      {error ? <p className="m-0 rounded-[10px] bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">{error}</p> : null}
    </div>
    <div className="flex justify-end gap-2 border-t border-[#eef1f4] px-6 py-4">
      <button className={SECONDARY} onClick={onCancel} type="button">{t("cancel")}</button>
      <button className={PRIMARY} disabled={busy} type="submit">{busy ? t("saving") : row ? t("save") : t("create")}</button>
    </div>
  </form>;
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="grid gap-1.5">
    <span className="text-sm font-medium text-[#344054]">{label}</span>
    {children}
    {hint ? <span className="text-xs leading-5 text-[#8b919a]">{hint}</span> : null}
  </label>;
}
