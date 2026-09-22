import { BlogArchive } from "@/components/blog/blog-archive";
import { localizedPageMetadata } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.categoryStructuralWork, "categoryStructuralWork");
}

export default function Page() {
  return <BlogArchive category="structural" />;
}
