import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/features/shared/components/skeletons";

export default async function LocaleLoading() {
  const t = await getTranslations("ux");
  return <PageSkeleton label={t("loading.page")} />;
}
