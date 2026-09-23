import { setRequestLocale } from "next-intl/server";
import type { Id } from "@/convex/_generated/dataModel";
import { ProjectWizard } from "@/features/projects/components/project-wizard";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ projectId?: string | string[] }>;
};
export async function generateMetadata({ params }: Props) { return localizedPageMetadata(params, routes.postProjectWizard, "postProjectWizard"); }
export default async function NewProjectPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const requestedProjectId = (await searchParams).projectId;
  const initialProjectId = (Array.isArray(requestedProjectId) ? requestedProjectId[0] : requestedProjectId) as Id<"projects"> | undefined;
  setRequestLocale(locale);
  return <ProjectWizard initialProjectId={initialProjectId} />;
}
