"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/features/shared/components/error-state";
import { DashboardCardsSkeleton } from "@/features/shared/components/skeletons";
import { useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export function ClientDashboard() {
  const t = useTranslations("auth.clientDashboard");
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (user.accountType === "company") {
      router.replace(
        user.onboardingStatus === "completed" ? routes.companyDashboard : routes.companyOnboarding,
      );
      return;
    }
    if (user.accountType === "client" && user.onboardingStatus !== "completed") {
      router.replace(routes.clientOnboarding);
    }
  }, [router, user]);

  if (user === undefined || user === null || user.accountType !== "client" || user.onboardingStatus !== "completed") {
    return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;
  }

  return (
    <section className="mx-auto flex w-full max-w-[900px] flex-1 flex-col px-5 py-16 sm:px-8 sm:py-20">
      <p className="mb-3 text-[0.7rem] font-bold tracking-[0.18em] text-brand uppercase">{t("eyebrow")}</p>
      <h1 className="m-0 text-[clamp(2rem,4.5vw,3.4rem)] font-semibold tracking-[-0.045em] text-ink">
        {t("title")}
      </h1>
      <p className="mt-5 mb-0 max-w-2xl text-base leading-7 text-muted sm:text-lg">{t("lead")}</p>
      <EmptyState
        actionHref={routes.postProjectWizard}
        actionLabel={tUx("empty.projects.action")}
        className="mt-10"
        title={tUx("empty.projects.title")}
      />
    </section>
  );
}
