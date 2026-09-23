import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/site-header";
import { MessagesInbox } from "@/features/messages/components/messages-inbox";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string; conversationId: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.messages, "messages");
}

export default async function ConversationPage({ params }: Props) {
  const { conversationId } = await params;
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <><SiteHeader /><MessagesInbox initialConversationId={conversationId} /></>;
}
