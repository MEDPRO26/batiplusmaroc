import { LegalDocument } from "@/features/shared/components/legal-document";
import { localizedPageMetadata } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.privacy, "privacy");
}

export default function PrivacyPage({ params }: Props) {
  return <LegalDocument page="privacy" params={params} />;
}
