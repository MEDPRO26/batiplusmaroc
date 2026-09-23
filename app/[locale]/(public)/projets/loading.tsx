import { getTranslations } from "next-intl/server";
import { PublicProjectBrowseSkeleton } from "@/features/projects/components/public-project-browse";

export default async function BrowseProjectsLoading() {
  const t = await getTranslations("browseProjectsPage");
  return <PublicProjectBrowseSkeleton label={t("loading")} />;
}
