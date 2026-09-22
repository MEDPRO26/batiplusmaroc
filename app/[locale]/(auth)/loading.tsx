import { getTranslations } from "next-intl/server";
import { FormSkeleton } from "@/features/shared/components/skeletons";

export default async function AuthLoading() {
  const t = await getTranslations("ux");
  return (
    <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-5 py-16">
      <FormSkeleton label={t("loading.form")} />
    </section>
  );
}
