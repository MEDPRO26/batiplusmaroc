import type { Metadata } from "next";
import { BlogArchive } from "@/components/blog/blog-archive";
import { routes } from "@/lib/routes";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  path: routes.categoryStructuralWork,
  title: "Archives des Gros œuvre - batiplusmaroc.com",
});

export default function Page() {
  return <BlogArchive title="Gros œuvre" activeCategory={routes.categoryStructuralWork} />;
}
