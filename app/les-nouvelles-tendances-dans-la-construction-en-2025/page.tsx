import type { Metadata } from "next";
import { RouteShell } from "@/components/ui/route-shell";
import { routes } from "@/lib/routes";
import { createMetadata } from "@/lib/seo";
export const metadata: Metadata = createMetadata({ path: routes.constructionTrends2025 });
export default function Page() { return <RouteShell label="Les nouvelles tendances dans la construction en 2025" />; }
