import type { Metadata } from "next";
import { createLocalizedMetadata, type AppPathname } from "@/lib/i18n-seo";
import type { AppRoute } from "@/lib/routes";

export const SITE_URL = "https://batiplusmaroc.com";

export function createMetadata({
  path,
  title,
  description,
  robots,
}: {
  path: AppRoute;
  title?: string;
  description?: string;
  robots?: Metadata["robots"];
}): Metadata {
  return {
    ...createLocalizedMetadata({
      locale: "fr",
      href: path as AppPathname,
      title: title ?? "Batiplus",
      description: description ?? "",
    }),
    robots,
  };
}
