"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/features/shared/components/error-state";
import { ProjectCardSkeleton } from "@/features/shared/components/skeletons";

export type PublicProject = FunctionReturnType<typeof api.projects.index.listPublicProjects>[number];

export function ProjectDiscoveryEmptyState() {
  const t = useTranslations("projectDiscovery");
  const projects = useQuery(api.projects.index.listPublicProjects);
  if (projects === undefined) return <div aria-busy="true" className="mt-10 grid max-w-4xl gap-4 sm:grid-cols-2" role="status"><span className="sr-only">{t("loading")}</span><ProjectCardSkeleton /><ProjectCardSkeleton /></div>;
  return <ProjectDiscoveryResults projects={projects} />;
}

export function ProjectDiscoveryResults({ projects }: { projects: PublicProject[] }) {
  const t = useTranslations("projectDiscovery");
  const tWizard = useTranslations("projectWizard");
  if (projects.length === 0) return <EmptyState className="mt-10 max-w-2xl" description={t("emptyDescription")} title={t("emptyTitle")} />;
  return <ul className="mt-10 grid max-w-4xl list-none gap-4 p-0 sm:grid-cols-2">{projects.map((project) => <li key={project.id}><article className="h-full rounded-2xl border border-brand-border bg-white p-5"><p className="m-0 text-xs font-semibold tracking-wide text-brand uppercase">{tWizard(`categoryOptions.${project.primaryCategory}`)}</p><h2 className="mt-2 mb-0 text-lg font-semibold text-ink">{project.title}</h2><p className="mt-2 mb-0 text-sm text-muted">{tWizard(`cityOptions.${project.city}`)}</p><p className="mt-4 line-clamp-3 text-sm leading-6 text-ink/80">{project.description}</p></article></li>)}</ul>;
}
