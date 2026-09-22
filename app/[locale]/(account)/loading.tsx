import { getTranslations } from "next-intl/server";
import { DashboardCardsSkeleton } from "@/features/shared/components/skeletons";

export default async function AccountLoading() {
  const t = await getTranslations("ux");
  return <DashboardCardsSkeleton label={t("loading.dashboard")} />;
}
