import { BlogArchive } from "@/components/blog/blog-archive";
import { localizedPageMetadata } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.categoryGeneral, "categoryGeneral");
}

export default function Page() {
  return <BlogArchive category="general" />;
}
