"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

export type ReviewDraft = { rating: number; comment: string };
type ReviewDraftError = "rating" | "comment" | null;

export function validateReviewDraft({ rating, comment }: ReviewDraft): ReviewDraftError {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "rating";
  const normalized = comment.trim().replace(/\s+/g, " ");
  return normalized.length < 10 || normalized.length > 2000 ? "comment" : null;
}

export function ReviewDialog({ busy, error, onCancel, onSubmit }: {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (draft: ReviewDraft) => void;
}) {
  const t = useTranslations("clientProjects.review");
  const firstRatingRef = useRef<HTMLButtonElement>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [draftError, setDraftError] = useState<ReviewDraftError>(null);

  useEffect(() => {
    firstRatingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onCancel]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = validateReviewDraft({ rating, comment });
    setDraftError(nextError);
    if (!nextError) onSubmit({ rating, comment });
  }

  const displayedError = draftError ? t(`errors.${draftError}`) : error;
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/50 p-4">
      <button aria-label={t("cancel")} className="absolute inset-0" disabled={busy} onClick={onCancel} type="button" />
      <form aria-describedby="review-dialog-description" aria-labelledby="review-dialog-title" aria-modal="true" className="relative z-10 w-full max-w-lg rounded-[20px] bg-white p-5 shadow-[0_24px_48px_rgba(16,24,40,0.18)] sm:p-6" onSubmit={submit} role="dialog">
        <h2 className="m-0 text-xl font-semibold text-ink" id="review-dialog-title">{t("dialogTitle")}</h2>
        <p className="mt-2 mb-0 text-sm leading-6 text-muted" id="review-dialog-description">{t("dialogLead")}</p>
        <fieldset className="mt-5"><legend className="text-sm font-semibold text-ink">{t("ratingLabel")}</legend><div className="mt-2 flex gap-1" role="radiogroup" aria-label={t("ratingLabel")}>{([1, 2, 3, 4, 5] as const).map((value) => <button aria-checked={rating === value} aria-label={t("starRating", { rating: value })} className={`min-h-11 min-w-11 rounded-full text-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${rating >= value ? "text-amber-500" : "text-slate-300"}`} key={value} onClick={() => { setRating(value); setDraftError(null); }} ref={value === 1 ? firstRatingRef : undefined} role="radio" type="button">★</button>)}</div></fieldset>
        <label className="mt-5 block text-sm font-semibold text-ink">{t("commentLabel")}<textarea className="mt-2 min-h-32 w-full rounded-xl border border-brand-border p-3 font-normal outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/20" maxLength={2000} onChange={(event) => { setComment(event.target.value); setDraftError(null); }} placeholder={t("commentPlaceholder")} value={comment} /></label>
        <p className="mt-1 text-xs text-muted">{t("commentHelp", { count: comment.length })}</p>
        {displayedError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{displayedError}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="min-h-11 rounded-full px-5 text-sm font-semibold text-muted disabled:opacity-55" disabled={busy} onClick={onCancel} type="button">{t("cancel")}</button><button className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-55" disabled={busy} type="submit">{busy ? t("saving") : t("submit")}</button></div>
      </form>
    </div>
  );
}
