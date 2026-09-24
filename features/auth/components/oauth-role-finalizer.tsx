"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { Link, useRouter } from "@/i18n/navigation";
import { mapConvexFailure } from "@/lib/errors";
import { routes } from "@/lib/routes";

/**
 * When a user signs in with Google for the first time (no accountType yet),
 * they land on role selection. Completing a role here finalizes signup.
 */
export function OAuthRoleFinalizer() {
  const t = useTranslations("auth.signUpFlow");
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const finalizeOAuthSignup = useMutation(api.users.finalizeOAuthSignup);
  const router = useRouter();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [pending, setPending] = useState<"client" | "company" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (user === undefined || user === null || user.accountType) {
    return null;
  }

  async function complete(accountType: "client" | "company") {
    if (pending) return;
    setError(null);
    if (!acceptedTerms) {
      setError(t("validation.terms"));
      return;
    }
    setPending(accountType);
    try {
      await finalizeOAuthSignup({
        accountType,
        acceptedTerms: true,
        marketingOptIn: marketing,
      });
      router.replace(accountType === "client" ? routes.clientOnboarding : routes.companyOnboarding);
    } catch (caught) {
      setError(mapConvexFailure(caught, tUx).message);
      setPending(null);
    }
  }

  return (
    <div className="mt-8 w-full max-w-[720px] rounded-2xl border border-brand-border bg-white p-5 sm:p-6">
      <p className="m-0 text-[0.95rem] text-ink">{t("oauthChooseRole")}</p>

      <label className="mt-4 flex items-start gap-3 text-[0.88rem] leading-6 text-ink">
        <input
          checked={marketing}
          className="mt-1 size-4 shrink-0 accent-brand"
          onChange={(event) => setMarketing(event.target.checked)}
          type="checkbox"
        />
        <span>{t("marketingClient")}</span>
      </label>

      <label className="mt-3 flex items-start gap-3 text-[0.88rem] leading-6 text-ink">
        <input
          checked={acceptedTerms}
          className="mt-1 size-4 shrink-0 accent-brand"
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          type="checkbox"
        />
        <span>
          {t.rich("terms", {
            terms: (chunks) => (
              <Link className="font-semibold text-brand underline-offset-2 hover:underline" href={routes.terms}>
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link className="font-semibold text-brand underline-offset-2 hover:underline" href={routes.privacy}>
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>

      {error ? <FriendlyAlert>{error}</FriendlyAlert> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-4 text-[0.92rem] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
          disabled={pending !== null}
          onClick={() => void complete("client")}
          type="button"
        >
          {pending === "client" ? t("creating") : t("clientTitle")}
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-brand bg-white px-4 text-[0.92rem] font-semibold text-brand hover:bg-brand-soft disabled:opacity-60"
          disabled={pending !== null}
          onClick={() => void complete("company")}
          type="button"
        >
          {pending === "company" ? t("creating") : t("companyTitle")}
        </button>
      </div>
    </div>
  );
}
