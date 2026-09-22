"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/features/shared/components/error-state";
import { routes } from "@/lib/routes";

export function ProjectDiscoveryEmptyState() {
  const t = useTranslations("ux.empty");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.users.currentUser);

  if (isLoading || (isAuthenticated && user === undefined)) return null;

  if (user?.accountType === "company") {
    return <EmptyState className="mt-10 max-w-2xl" title={t("projectDiscovery.title")} />;
  }

  return (
    <EmptyState
      actionHref={routes.postProject}
      actionLabel={t("projects.action")}
      className="mt-10 max-w-2xl"
      title={t("projects.title")}
    />
  );
}
