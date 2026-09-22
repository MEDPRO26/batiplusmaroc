import { setRequestLocale } from "next-intl/server";
import { ProjectWizard } from "@/features/projects/components/project-wizard";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) { return localizedPageMetadata(params, routes.postProjectWizard, "postProjectWizard"); }
export default async function NewProjectPage({ params }: Props) { const locale = await resolveLocale(params); setRequestLocale(locale); return <ProjectWizard />; }
