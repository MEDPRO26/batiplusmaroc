"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/features/shared/components/error-state";
import { routes } from "@/lib/routes";

export default function CompanyVerificationError({ reset }: { reset: () => void }) {
  const t = useTranslations("auth.companyVerification");
  return <ErrorState title={t("error.title")} description={t("error.description")} retryLabel={t("error.retry")} onRetry={reset} backHref={routes.companyDashboard} backLabel={t("backToWorkspace")} />;
}
