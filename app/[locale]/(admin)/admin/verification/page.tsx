import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

/**
 * Verification now lives inside Admin → Companies. The old destination stays
 * reachable (bookmarks, notification links) and lands on the pending queue.
 */
export default async function AdminVerificationPage({ params }: Props) {
  const locale = await resolveLocale(params);
  redirect({ href: { pathname: routes.adminCompanies, query: { verification: "pending" } }, locale });
}
