import { LegalPlaceholder } from "@/features/shared/components/legal-placeholder";
import { localizedPageMetadata } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.terms, "terms");
}

export default function TermsPage({ params }: Props) {
  return <LegalPlaceholder params={params} page="terms" />;
}
