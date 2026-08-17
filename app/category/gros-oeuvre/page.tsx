import type { Metadata } from "next";
import { RouteShell } from "@/components/ui/route-shell";
import { routes } from "@/lib/routes";
import { createMetadata } from "@/lib/seo";
export const metadata: Metadata = createMetadata({ path: routes.categoryStructuralWork });
export default function Page() { return <RouteShell label="Catégorie : Gros œuvre" />; }
