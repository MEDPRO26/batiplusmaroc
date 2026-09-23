import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export default async function LegacyClientWorkspacePage({ params }: Props) {
  const locale = await resolveLocale(params);
  redirect({ href: routes.clientDashboard, locale });
}
