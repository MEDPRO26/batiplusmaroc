import { routes } from "@/lib/routes";

export type ProjectCta = ReturnType<typeof getProjectCta>;

export function getProjectCta(accountType: string | null | undefined) {
  return accountType === "company"
    ? { href: routes.browseProjects, labelKey: "findProjects" as const }
    : { href: routes.postProject, labelKey: "postProject" as const };
}
