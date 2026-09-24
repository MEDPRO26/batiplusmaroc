"use client";

import { useMutation, useQuery } from "convex/react";
import { Archive, ArrowLeft, Check, Eye, FileCheck2, ImageIcon, Save, Send, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SeoMarkdownEditor } from "@/features/seo/components/seo-markdown-editor";
import { SeoMediaPicker } from "@/features/seo/components/seo-media-picker";
import { SEO_PRESS } from "@/features/seo/components/seo-workspace-shell";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type ArticleLocale = "fr" | "en";
type ArticleStatus = "draft" | "review" | "published" | "archived";
type SearchIntent = "informational" | "commercial" | "transactional" | "navigational" | "local";
type Robots = "index,follow" | "noindex,follow" | "index,nofollow" | "noindex,nofollow";

type FormState = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  locale: ArticleLocale;
  category: string;
  primaryKeyword: string;
  secondaryKeywords: string;
  searchIntent: SearchIntent;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  robots: Robots;
  ogTitle: string;
  ogDescription: string;
  pillarId: string;
  clusterId: string;
  featuredMediaId: string;
  ogMediaId: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  locale: "fr",
  category: "",
  primaryKeyword: "",
  secondaryKeywords: "",
  searchIntent: "informational",
  seoTitle: "",
  metaDescription: "",
  canonicalUrl: "",
  robots: "index,follow",
  ogTitle: "",
  ogDescription: "",
  pillarId: "",
  clusterId: "",
  featuredMediaId: "",
  ogMediaId: "",
};

export function SeoArticleEditor({ articleId }: { articleId?: Id<"seoArticles"> }) {
  const t = useTranslations("seoCms.editor");
  const router = useRouter();
  const article = useQuery(api.seo.content.getArticle, articleId ? { articleId } : "skip");
  const createArticle = useMutation(api.seo.content.createArticle);
  const updateArticle = useMutation(api.seo.content.updateArticle);
  const setArticleStatus = useMutation(api.seo.content.setArticleStatus);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [currentId, setCurrentId] = useState<Id<"seoArticles"> | undefined>(articleId);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"featured" | "og" | null>(null);
  const hydratedArticle = useRef<string | null>(null);
  const currentArticle = currentId ? article : null;
  const status: ArticleStatus = currentArticle?.status ?? "draft";
  const pillars = useQuery(api.seo.content.listPillars, { locale: form.locale, limit: 100 });
  const clusters = useQuery(
    api.seo.content.listClusters,
    form.pillarId ? { pillarId: form.pillarId as Id<"seoPillars">, limit: 100 } : "skip",
  );
  const activeMedia = useQuery(api.seo.content.listMedia, { status: "active", limit: 100 });

  useEffect(() => {
    if (!articleId || !article || hydratedArticle.current === article._id) return;
    hydratedArticle.current = article._id;
    setForm({
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      content: article.content,
      locale: article.locale,
      category: article.category,
      primaryKeyword: article.primaryKeyword,
      secondaryKeywords: article.secondaryKeywords.join(", "),
      searchIntent: article.searchIntent,
      seoTitle: article.seoTitle,
      metaDescription: article.metaDescription,
      canonicalUrl: article.canonicalUrl ?? "",
      robots: article.robots,
      ogTitle: article.ogTitle ?? "",
      ogDescription: article.ogDescription ?? "",
      pillarId: article.pillarId ?? "",
      clusterId: article.clusterId ?? "",
      featuredMediaId: article.featuredMediaId ?? "",
      ogMediaId: article.ogMediaId ?? "",
    });
  }, [article, articleId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const secondaryKeywords = useMemo(
    () => form.secondaryKeywords.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
    [form.secondaryKeywords],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onTitleChange(value: string) {
    setForm((current) => ({
      ...current,
      title: value,
      slug: current.slug ? current.slug : slugify(value),
      seoTitle: current.seoTitle ? current.seoTitle : value.slice(0, 70),
    }));
  }

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || status === "archived") return;
    setBusy(true);
    setError("");
    try {
      const input = {
        title: form.title,
        slug: form.slug,
        excerpt: form.excerpt,
        content: form.content,
        locale: form.locale,
        category: form.category,
        primaryKeyword: form.primaryKeyword,
        secondaryKeywords,
        searchIntent: form.searchIntent,
        seoTitle: form.seoTitle,
        metaDescription: form.metaDescription,
        canonicalUrl: form.canonicalUrl || undefined,
        robots: form.robots,
        ogTitle: form.ogTitle || undefined,
        ogDescription: form.ogDescription || undefined,
        featuredMediaId: form.featuredMediaId ? form.featuredMediaId as Id<"seoMedia"> : undefined,
        ogMediaId: form.ogMediaId ? form.ogMediaId as Id<"seoMedia"> : undefined,
      };
      if (currentId) {
        await updateArticle({
          articleId: currentId,
          ...input,
          featuredMediaId: form.featuredMediaId ? form.featuredMediaId as Id<"seoMedia"> : null,
          canonicalUrl: form.canonicalUrl || null,
          ogMediaId: form.ogMediaId ? form.ogMediaId as Id<"seoMedia"> : null,
          pillarId: form.pillarId ? form.pillarId as Id<"seoPillars"> : null,
          clusterId: form.clusterId ? form.clusterId as Id<"seoClusters"> : null,
          briefId: null,
          translationGroup: null,
        });
        setNotice(t("success.updated"));
      } else {
        const newId = await createArticle({
          ...input,
          pillarId: form.pillarId ? form.pillarId as Id<"seoPillars"> : undefined,
          clusterId: form.clusterId ? form.clusterId as Id<"seoClusters"> : undefined,
        });
        setCurrentId(newId);
        setNotice(t("success.created"));
        router.replace({ pathname: routes.seoArticle, params: { articleId: newId } });
      }
    } catch (caught) {
      setError(resolveArticleError(caught, t));
    } finally {
      setBusy(false);
    }
  }

  async function transition(nextStatus: ArticleStatus) {
    if (!currentId || busy) return;
    if (
      (nextStatus === "published" || nextStatus === "archived" || (nextStatus === "draft" && status === "published")) &&
      !window.confirm(
        nextStatus === "published"
          ? t("confirm.publish")
          : nextStatus === "archived"
            ? t("confirm.archive")
            : t("confirm.unpublish"),
      )
    ) return;
    setBusy(true);
    setError("");
    try {
      await setArticleStatus({ articleId: currentId, status: nextStatus });
      setNotice(
        nextStatus === "review"
          ? t("success.submitted")
          : nextStatus === "published"
            ? t("success.published")
            : nextStatus === "archived"
              ? t("success.archived")
              : status === "archived"
                ? t("success.restored")
                : t("success.unpublished"),
      );
    } catch (caught) {
      setError(resolveArticleError(caught, t));
    } finally {
      setBusy(false);
    }
  }

  if (articleId && article === undefined) return <EditorLoading label={t("loading")} />;
  if (articleId && article === null) {
    return (
      <EmptyArticle title={t("notFoundTitle")} description={t("notFoundDescription")} back={t("backToArticles")} />
    );
  }

  const disabled = busy || status === "archived";

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      {notice ? <p className="fixed bottom-6 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-full bg-[#17191d] px-4 py-3 text-sm text-white shadow-[0_12px_32px_rgba(16,24,40,0.24)]" role="status">{notice}</p> : null}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Link className={`inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#626970] hover:text-[#17191d] ${SEO_PRESS}`} href={routes.seoArticles}>
            <ArrowLeft aria-hidden className="size-4" />
            {t("backToArticles")}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-[1.9rem] font-semibold tracking-[-0.04em] sm:text-[2.2rem]">
              {currentId ? t("editTitle") : t("createTitle")}
            </h1>
            <StatusPill status={status} />
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#626970]">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e6e9ee] bg-white px-4 text-sm font-semibold ${SEO_PRESS}`} onClick={() => setPreviewOpen((open) => !open)} type="button">
            <Eye aria-hidden className="size-4" />
            {previewOpen ? t("hidePreview") : t("preview")}
          </button>
          <button className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,107,255,0.24)] disabled:cursor-not-allowed disabled:opacity-50 ${SEO_PRESS}`} disabled={disabled} form="seo-article-form" type="submit">
            <Save aria-hidden className="size-4" />
            {busy ? t("saving") : currentId ? t("saveChanges") : t("saveDraft")}
          </button>
        </div>
      </div>

      {error ? <p className="rounded-[14px] bg-[#fdecec] px-4 py-3 text-sm text-[#b42318]" role="alert">{error}</p> : null}
      {status === "archived" ? <p className="rounded-[14px] bg-[#fff4df] px-4 py-3 text-sm text-[#7a5300]" role="status">{t("archivedNotice")}</p> : null}

      <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" id="seo-article-form" onSubmit={(event) => void save(event)}>
        <div className="flex min-w-0 flex-col gap-5">
          <FormCard description={t("sections.contentDescription")} title={t("sections.content")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2" label={t("fields.title")}>
                <input autoFocus={!currentId} disabled={disabled} maxLength={180} onChange={(event) => onTitleChange(event.target.value)} required value={form.title} />
              </Field>
              <Field hint={t("hints.slug")} label={t("fields.slug")}>
                <input disabled={disabled} maxLength={160} onChange={(event) => update("slug", slugify(event.target.value))} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required value={form.slug} />
              </Field>
              <Field label={t("fields.locale")}>
                <select disabled={disabled || Boolean(currentId)} onChange={(event) => update("locale", event.target.value as ArticleLocale)} value={form.locale}>
                  <option value="fr">{t("locales.fr")}</option>
                  <option value="en">{t("locales.en")}</option>
                </select>
              </Field>
              <Field className="sm:col-span-2" label={t("fields.excerpt")}>
                <textarea disabled={disabled} maxLength={500} minLength={10} onChange={(event) => update("excerpt", event.target.value)} required rows={3} value={form.excerpt} />
              </Field>
              <Field className="sm:col-span-2" hint={t("hints.markdown")} label={t("fields.content")}>
                <SeoMarkdownEditor disabled={disabled} locale={form.locale} onChange={(value) => update("content", value)} value={form.content} />
              </Field>
            </div>
          </FormCard>

          <FormCard description={t("sections.searchDescription")} title={t("sections.search")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fields.category")}><input disabled={disabled} maxLength={100} onChange={(event) => update("category", event.target.value)} required value={form.category} /></Field>
              <Field label={t("fields.searchIntent")}>
                <select disabled={disabled} onChange={(event) => update("searchIntent", event.target.value as SearchIntent)} value={form.searchIntent}>
                  {(["informational", "commercial", "transactional", "navigational", "local"] as const).map((intent) => <option key={intent} value={intent}>{t(`intents.${intent}`)}</option>)}
                </select>
              </Field>
              <Field label={t("fields.primaryKeyword")}><input disabled={disabled} maxLength={120} onChange={(event) => update("primaryKeyword", event.target.value)} required value={form.primaryKeyword} /></Field>
              <Field hint={t("hints.keywords")} label={t("fields.secondaryKeywords")}><textarea disabled={disabled} onChange={(event) => update("secondaryKeywords", event.target.value)} rows={3} value={form.secondaryKeywords} /></Field>
            </div>
          </FormCard>

          <FormCard description={t("sections.metadataDescription")} title={t("sections.metadata")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field hint={t("hints.seoTitle", { count: form.seoTitle.length })} label={t("fields.seoTitle")}><input disabled={disabled} maxLength={70} onChange={(event) => update("seoTitle", event.target.value)} required value={form.seoTitle} /></Field>
              <Field label={t("fields.robots")}>
                <select disabled={disabled} onChange={(event) => update("robots", event.target.value as Robots)} value={form.robots}>
                  {(["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field className="sm:col-span-2" hint={t("hints.metaDescription", { count: form.metaDescription.length })} label={t("fields.metaDescription")}><textarea disabled={disabled} maxLength={180} minLength={20} onChange={(event) => update("metaDescription", event.target.value)} required rows={3} value={form.metaDescription} /></Field>
              <Field className="sm:col-span-2" hint={t("hints.canonical")} label={t("fields.canonicalUrl")}><input disabled={disabled} onChange={(event) => update("canonicalUrl", event.target.value)} placeholder="https://batiplusmaroc.com/..." type="url" value={form.canonicalUrl} /></Field>
              <Field label={t("fields.ogTitle")}><input disabled={disabled} maxLength={100} onChange={(event) => update("ogTitle", event.target.value)} value={form.ogTitle} /></Field>
              <Field label={t("fields.ogDescription")}><textarea disabled={disabled} maxLength={300} onChange={(event) => update("ogDescription", event.target.value)} rows={3} value={form.ogDescription} /></Field>
            </div>
          </FormCard>
        </div>

        <aside className="flex flex-col gap-5">
          <FormCard description={t("sections.strategyDescription")} title={t("sections.strategy")}>
            <div className="grid gap-4">
              <Field label={t("fields.pillar")}>
                <select disabled={disabled || pillars === undefined} onChange={(event) => setForm((current) => ({ ...current, pillarId: event.target.value, clusterId: "" }))} value={form.pillarId}>
                  <option value="">{t("options.none")}</option>
                  {pillars?.map((pillar) => <option key={pillar._id} value={pillar._id}>{pillar.title}</option>)}
                </select>
              </Field>
              <Field label={t("fields.cluster")}>
                <select disabled={disabled || !form.pillarId || clusters === undefined} onChange={(event) => update("clusterId", event.target.value)} value={form.clusterId}>
                  <option value="">{t("options.none")}</option>
                  {clusters?.map((cluster) => <option key={cluster._id} value={cluster._id}>{cluster.topic}</option>)}
                </select>
              </Field>
            </div>
          </FormCard>

          <FormCard description={t("mediaDescription")} title={t("mediaTitle")}>
            <div className="grid gap-4">
              <ArticleMediaField
                disabled={disabled}
                label={t("fields.featuredImage")}
                media={activeMedia?.find((item) => item.mediaId === form.featuredMediaId)}
                onClear={() => update("featuredMediaId", "")}
                onPick={() => setPickerTarget("featured")}
                selectLabel={t("media.selectFeatured")}
                removeLabel={t("media.remove")}
              />
              <ArticleMediaField
                disabled={disabled}
                label={t("fields.ogImage")}
                media={activeMedia?.find((item) => item.mediaId === form.ogMediaId)}
                onClear={() => update("ogMediaId", "")}
                onPick={() => setPickerTarget("og")}
                selectLabel={t("media.selectOg")}
                removeLabel={t("media.remove")}
              />
            </div>
          </FormCard>

          {currentId ? (
            <FormCard description={t("lifecycleDescription")} title={t("lifecycleTitle")}>
              <div className="grid gap-2">
                {status === "draft" ? <LifecycleButton icon={<Send aria-hidden className="size-4" />} label={t("actions.submitReview")} onClick={() => void transition("review")} /> : null}
                {status === "review" ? <><LifecycleButton icon={<FileCheck2 aria-hidden className="size-4" />} label={t("actions.publish")} onClick={() => void transition("published")} primary /><LifecycleButton icon={<Undo2 aria-hidden className="size-4" />} label={t("actions.returnDraft")} onClick={() => void transition("draft")} /></> : null}
                {status === "published" ? <LifecycleButton icon={<Undo2 aria-hidden className="size-4" />} label={t("actions.unpublish")} onClick={() => void transition("draft")} /> : null}
                {status !== "archived" ? <LifecycleButton danger icon={<Archive aria-hidden className="size-4" />} label={t("actions.archive")} onClick={() => void transition("archived")} /> : <LifecycleButton icon={<Check aria-hidden className="size-4" />} label={t("actions.restore")} onClick={() => void transition("draft")} />}
              </div>
            </FormCard>
          ) : null}
        </aside>
      </form>

      {previewOpen ? <ArticlePreview form={form} onClose={() => setPreviewOpen(false)} /> : null}
      <SeoMediaPicker
        locale={form.locale}
        onClose={() => setPickerTarget(null)}
        onSelect={(selection) => {
          if (pickerTarget === "featured") update("featuredMediaId", selection.mediaId);
          if (pickerTarget === "og") update("ogMediaId", selection.mediaId);
        }}
        open={pickerTarget !== null}
        selectedMediaId={pickerTarget === "featured" ? form.featuredMediaId as Id<"seoMedia"> || null : form.ogMediaId as Id<"seoMedia"> || null}
      />
    </div>
  );
}

function FormCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-[20px] border border-[#e7eaee] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6"><h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2><p className="mt-1 text-sm leading-6 text-[#626970]">{description}</p><div className="mt-5">{children}</div></section>;
}

function ArticleMediaField({ label, media, onPick, onClear, selectLabel, removeLabel, disabled }: {
  label: string;
  media?: { filename: string; publicUrl: string | null; frAltText: string | null; enAltText: string | null };
  onPick: () => void;
  onClear: () => void;
  selectLabel: string;
  removeLabel: string;
  disabled: boolean;
}) {
  return <div><p className="text-sm font-semibold text-[#34383e]">{label}</p>{media ? <div className="mt-2 overflow-hidden rounded-[14px] border border-[#e7eaee]"><div className="aspect-[16/9] bg-[#eef0f3]">{media.publicUrl ? <img alt={media.frAltText ?? media.enAltText ?? ""} className="size-full object-cover" src={media.publicUrl} /> : <ImageIcon aria-hidden className="m-auto size-8 text-[#9ba1a8]" />}</div><div className="flex items-center gap-2 p-3"><p className="min-w-0 flex-1 truncate text-xs font-medium">{media.filename}</p><button aria-label={removeLabel} className={`grid size-11 shrink-0 place-items-center rounded-full text-[#b42318] hover:bg-[#fdecec] ${SEO_PRESS}`} disabled={disabled} onClick={onClear} type="button"><Trash2 aria-hidden className="size-4" /></button></div></div> : <button className={`mt-2 flex min-h-24 w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#cdd2d8] bg-[#fafbfc] px-4 text-sm font-semibold text-[#4d535a] disabled:cursor-not-allowed disabled:opacity-50 ${SEO_PRESS}`} disabled={disabled} onClick={onPick} type="button"><ImageIcon aria-hidden className="size-5" />{selectLabel}</button>}{media ? <button className={`mt-2 min-h-11 w-full rounded-full border border-[#dfe3e8] px-4 text-sm font-semibold ${SEO_PRESS}`} disabled={disabled} onClick={onPick} type="button">{selectLabel}</button> : null}</div>;
}

function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return <label className={`grid gap-2 text-sm font-semibold text-[#34383e] ${className}`}><span>{label}</span><span className="[&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-[12px] [&_input]:border [&_input]:border-[#dfe3e8] [&_input]:bg-white [&_input]:px-3.5 [&_input]:font-normal [&_input]:outline-none [&_input]:focus:border-[#2f6bff] [&_input]:focus:ring-2 [&_input]:focus:ring-[#2f6bff]/15 [&_textarea]:w-full [&_textarea]:rounded-[12px] [&_textarea]:border [&_textarea]:border-[#dfe3e8] [&_textarea]:bg-white [&_textarea]:px-3.5 [&_textarea]:py-3 [&_textarea]:font-normal [&_textarea]:outline-none [&_textarea]:focus:border-[#2f6bff] [&_textarea]:focus:ring-2 [&_textarea]:focus:ring-[#2f6bff]/15 [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-[12px] [&_select]:border [&_select]:border-[#dfe3e8] [&_select]:bg-white [&_select]:px-3.5 [&_select]:font-normal [&_select]:outline-none [&_select]:focus:border-[#2f6bff] [&_select]:focus:ring-2 [&_select]:focus:ring-[#2f6bff]/15 [&_:disabled]:cursor-not-allowed [&_:disabled]:bg-[#f4f6f8] [&_:disabled]:opacity-70">{children}</span>{hint ? <span className="text-xs font-normal text-[#8b919a]">{hint}</span> : null}</label>;
}

function LifecycleButton({ label, icon, onClick, primary = false, danger = false }: { label: string; icon: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  const style = primary ? "bg-[#2f6bff] text-white" : danger ? "border border-[#f4c7c2] bg-white text-[#b42318]" : "border border-[#e6e9ee] bg-white text-[#17191d]";
  return <button className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold ${style} ${SEO_PRESS}`} onClick={onClick} type="button">{icon}{label}</button>;
}

function StatusPill({ status }: { status: ArticleStatus }) {
  const t = useTranslations("seoCms.articles.statuses");
  const styles = { draft: "bg-[#eef3ff] text-[#2f6bff]", review: "bg-[#fff4df] text-[#9a6700]", published: "bg-[#e7f8ee] text-[#157a3e]", archived: "bg-[#eef0f3] text-[#626970]" }[status];
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${styles}`}>{t(status)}</span>;
}

export function ArticlePreview({ form, onClose }: { form: FormState; onClose: () => void }) {
  const t = useTranslations("seoCms.editor");
  const closeButton = useRef<HTMLButtonElement>(null);
  const media = useQuery(api.seo.content.listMedia, { status: "active", limit: 100 });

  useEffect(() => {
    closeButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div aria-labelledby="article-preview-title" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="dialog"><div className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-2xl sm:rounded-[24px] sm:p-8"><div className="flex items-center justify-between gap-4"><div><p className="text-[0.7rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">{t("previewProtected")}</p><h2 className="mt-1 text-xl font-semibold" id="article-preview-title">{t("previewTitle")}</h2></div><button ref={closeButton} aria-label={t("closePreview")} className={`inline-flex size-11 items-center justify-center rounded-full border border-[#e6e9ee] ${SEO_PRESS}`} onClick={onClose} type="button">×</button></div><article className="mx-auto mt-8 max-w-3xl"><p className="text-sm font-semibold text-[#2f6bff]">{form.category || t("previewCategoryFallback")}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{form.title || t("previewTitleFallback")}</h1><p className="mt-5 text-lg leading-8 text-[#626970]">{form.excerpt || t("previewExcerptFallback")}</p><div className="mt-8 border-t border-[#e7eaee] pt-8"><SafeMarkdown content={form.content} media={media ?? []} /></div></article></div></div>;
}

function SafeMarkdown({ content, media }: { content: string; media: Array<{ mediaId: Id<"seoMedia">; publicUrl: string | null }> }) {
  if (!content.trim()) return <p className="text-[#8b919a]">—</p>;
  const mediaUrls = new Map(media.map((item) => [item.mediaId as string, item.publicUrl]));
  return <div className="space-y-4 text-[1rem] leading-8 text-[#34383e]">{content.split(/\n{2,}/).map((block, index) => {
    const text = block.trim();
    const image = /^!\[([^\]]*)\]\(media:([^)]+)\)$/.exec(text);
    if (image) { const url = mediaUrls.get(image[2] ?? ""); return url ? <figure className="overflow-hidden rounded-[18px] bg-[#eef0f3]" key={index}><img alt={image[1] ?? ""} className="h-auto w-full" src={url} /></figure> : null; }
    if (text.startsWith("### ")) return <h3 className="pt-2 text-xl font-semibold" key={index}>{inlineMarkdown(text.slice(4))}</h3>;
    if (text.startsWith("## ")) return <h2 className="pt-3 text-2xl font-semibold" key={index}>{inlineMarkdown(text.slice(3))}</h2>;
    if (text.split("\n").every((line) => /^[-*]\s+/.test(line))) return <ul className="list-disc space-y-1 pl-6" key={index}>{text.split("\n").map((line, itemIndex) => <li key={itemIndex}>{inlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>)}</ul>;
    if (text.split("\n").every((line) => /^\d+\.\s+/.test(line))) return <ol className="list-decimal space-y-1 pl-6" key={index}>{text.split("\n").map((line, itemIndex) => <li key={itemIndex}>{inlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</li>)}</ol>;
    if (text.split("\n").every((line) => /^>\s?/.test(line))) return <blockquote className="border-l-4 border-[#b8c8f8] pl-4 italic text-[#626970]" key={index}>{text.split("\n").map((line) => line.replace(/^>\s?/, "")).join(" ")}</blockquote>;
    return <p className="whitespace-pre-wrap" key={index}>{inlineMarkdown(text)}</p>;
  })}</div>;
}

function inlineMarkdown(value: string) {
  const tokens = value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(token);
    if (link) return <a className="font-medium text-[#2f6bff] underline underline-offset-4" href={link[2]} key={index} rel="noreferrer" target="_blank">{link[1]}</a>;
    return token;
  });
}

function EditorLoading({ label }: { label: string }) { return <div aria-busy="true" className="mx-auto w-full max-w-[1500px] space-y-4" role="status"><span className="sr-only">{label}</span><div className="h-12 w-72 animate-pulse rounded-xl bg-white"/><div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div className="h-[620px] animate-pulse rounded-[20px] bg-white"/><div className="h-80 animate-pulse rounded-[20px] bg-white"/></div></div>; }

function EmptyArticle({ title, description, back }: { title: string; description: string; back: string }) { return <div className="mx-auto grid min-h-[60dvh] w-full max-w-xl place-items-center text-center"><div><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-[#626970]">{description}</p><Link className={`mt-6 inline-flex min-h-11 items-center rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white ${SEO_PRESS}`} href={routes.seoArticles}>{back}</Link></div></div>; }

function slugify(value: string) { return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160); }

function resolveArticleError(error: unknown, t: ReturnType<typeof useTranslations<"seoCms.editor">>) {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("SEO_ARTICLE_SLUG_CONFLICT")) return t("errors.slugConflict");
  if (text.includes("SEO_CANONICAL_CONFLICT")) return t("errors.canonicalConflict");
  if (text.includes("INVALID_SEO_CANONICAL")) return t("errors.invalidCanonical");
  if (text.includes("INVALID_SEO_STATUS_TRANSITION")) return t("errors.invalidTransition");
  if (text.includes("INVALID_SEO_REFERENCE")) return t("errors.invalidReference");
  if (text.includes("INVALID_SEO_SLUG")) return t("errors.invalidSlug");
  if (text.includes("INVALID_SEO_CONTENT") || text.includes("INVALID_SEO_INPUT")) return t("errors.invalidInput");
  return t("errors.generic");
}
