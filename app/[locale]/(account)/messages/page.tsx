import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { MessagesInbox } from "@/features/messages/components/messages-inbox";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.messages, "messages");
}

export default async function MessagesPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      <MessagesInbox />
    </>
  );
}
