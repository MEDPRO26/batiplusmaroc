import type { Metadata } from "next";

import { ContactHero } from "@/components/contact/contact-hero";
import { ContactPanel } from "@/components/contact/contact-panel";
import { routes } from "@/lib/routes";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  path: routes.contact,
  title: "Contactez-nous - batiplusmaroc.com",
});

export default function ContactPage() {
  return (
    <>
      <ContactHero />
      <ContactPanel />
    </>
  );
}
