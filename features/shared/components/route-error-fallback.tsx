"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorState } from "@/features/shared/components/error-state";
import { logUnexpectedError } from "@/lib/errors";
import { routes } from "@/lib/routes";

export function RouteErrorFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ux");
  const tCommon = useTranslations("common");

  useEffect(() => {
    logUnexpectedError(error, { digest: error.digest, source: "route-boundary" });
  }, [error]);

  return (
    <ErrorState
      backHref={routes.home}
      backLabel={tCommon("backHome")}
      description={t("error.generic")}
      onRetry={reset}
      retryLabel={t("retry")}
      title={t("error.title")}
    />
  );
}
