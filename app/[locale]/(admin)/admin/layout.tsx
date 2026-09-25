import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { adminAccessRedirect } from "@/features/admin/lib/access";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);

  const token = await convexAuthNextjsToken();
  if (!token) redirect({ href: routes.signIn, locale });

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  const destination = adminAccessRedirect(user);
  if (destination) redirect({ href: destination, locale });

  const admin = await fetchQuery(api.admin.index.getAdminSession, {}, { token });

  return (
    <main className="flex min-h-dvh flex-1 flex-col" id="contenu">
      <AdminShell email={admin.email} firstName={admin.firstName} lastName={admin.lastName}>
        {children}
      </AdminShell>
    </main>
  );
}
