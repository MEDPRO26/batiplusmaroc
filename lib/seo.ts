import type { Metadata } from "next";
import type { ProtectedRoute } from "@/lib/routes";
export const SITE_URL = "https://batiplusmaroc.com";
export function absoluteUrl(path: ProtectedRoute) { return new URL(path, SITE_URL).toString(); }
export function createMetadata({ path, title, description }: { path: ProtectedRoute; title?: string; description?: string }): Metadata { return { ...(title ? { title } : {}), ...(description ? { description } : {}), alternates: { canonical: absoluteUrl(path) } }; }
