import { LocalePlaceholder } from "@/features/shared/components/locale-placeholder";
import { localizedPageMetadata } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.browseProjects, "browseProjects");
}

export default function BrowseProjectsPage({ params }: Props) {
  return <LocalePlaceholder params={params} namespace="project" titleKey="browseTitle" leadKey="browseLead" />;
}
