import { ContactHero } from "@/components/contact/contact-hero";
import { ContactPanel } from "@/components/contact/contact-panel";
import { managedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";
import { setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return managedPageMetadata(params, routes.contact, "contact", "contact");
}

export default async function ContactPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);

  return (
    <>
      <ContactHero />
      <ContactPanel />
    </>
  );
}
