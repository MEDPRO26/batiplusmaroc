import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export default async function SeoRootPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  redirect({ href: routes.seoDashboard, locale });
}
