import type { MetadataRoute } from "next";
import { protectedRoutes } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";
export default function sitemap(): MetadataRoute.Sitemap { return protectedRoutes.map((path) => ({ url: absoluteUrl(path) })); }
