"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ClientSupportRequestActions } from "@/features/client-support/components/client-support-actions";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { describeAppError } from "@/lib/errors";
import { agreementApi, agreementFailure } from "../lib/agreement-ui";
import { AgreementGuard, PRIMARY, useAgreementClock, useAlive } from "./agreement-shared";

type Quote = NonNullable<FunctionReturnType<typeof api.finalQuotes.index.getForConversation>["finalQuote"]>;
/** Only inside the authorized private Client quote sheet; never inside shared support. */
export function ClientQuoteReadiness({ quote }: { quote: Quote }) {
  const t = useTranslations("coordinationAgreement");
  return <section aria-label={t("quoteReadinessTitle")} className="mt-5 rounded-xl border border-brand-border bg-brand-soft/40 p-4">
    <h3 className="m-0 text-sm font-semibold text-ink">{t("quoteReadinessTitle")}</h3>
    <AgreementGuard role="client" projectId={quote.projectId}><ReadinessContext key={quote.projectId} quote={quote} /></AgreementGuard>
  </section>;
}
function ReadinessContext({ quote }: { quote: Quote }) {
  const t = useTranslations("coordinationAgreement");
  const thread = useQuery(api.clientSupport.index.getMyConversation, { projectId: quote.projectId });
  if (thread === undefined) return <p role="status">{t("loading")}</p>;
  if (!thread) return <><p className="text-sm text-muted">{t("supportRequired")}</p><ClientSupportRequestActions projectId={quote.projectId} requestedKinds={[]} /></>;
  return <ReadinessChoice quote={quote} />;
}
function ReadinessChoice({ quote }: { quote: Quote }) {
  const t = useTranslations("coordinationAgreement"); const ux = useTranslations("ux"); const asOf = useAgreementClock(); const alive = useAlive();
  const agreement = useQuery(agreementApi.getMyAgreement, { projectId: quote.projectId, asOf });
  const choose = useMutation(agreementApi.setMyReadiness);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false); const [denied, setDenied] = useState(false);
  const revision = quote.revisions.find(item => item.id === quote.currentRevisionId);
  const eligible = revision && (quote.status === "accepted" || (quote.status === "submitted" && revision.validUntil >= new Date(asOf).toISOString().slice(0, 10)));
  async function select() {
    if (!revision || agreement === undefined || busyRef.current) return;
    const payload = { projectId: quote.projectId, revisionId: revision.id, expectedReadinessRevision: agreement?.readiness.revision ?? 0 };
    busyRef.current = true; setBusy(true); setError("");
    try { await choose(payload); if (alive.current) setSaved(true); }
    catch (cause) { if (alive.current) { const failure = agreementFailure(cause); if (failure.denied) setDenied(true); else setError(ux(describeAppError(cause, { logUnknown: false }).messageKey)); } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  if (denied) return <p role="alert">{t("denied")}</p>;
  return <div className="mt-2 grid gap-2">
    <p className="m-0 text-xs leading-5 text-muted">{t("quoteChoiceNote")}</p>
    <p className="m-0 text-xs leading-5 text-muted">{t("readinessChangeNote")}</p>
    <button className={PRIMARY} disabled={!eligible || agreement === undefined || busy} onClick={() => void select()} type="button">{t(busy ? "saving" : "useQuote", { number: revision?.revisionNumber ?? 0 })}</button>
    {!eligible ? <p className="m-0 text-xs text-muted">{t("quoteUnavailable")}</p> : null}
    {saved ? <p role="status" className="m-0 text-sm text-emerald-800">{t("readinessSelected")}</p> : null}
    {error ? <p role="alert" className="m-0 text-sm text-red-800">{error}</p> : null}
    <Link className="min-h-11 py-2 text-sm font-semibold text-brand underline" href={{ pathname: routes.clientProjectSupport, params: { projectId: quote.projectId } }}>{t("backSupport")}</Link>
  </div>;
}
