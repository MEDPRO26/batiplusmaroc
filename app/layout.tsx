import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = { metadataBase: new URL(SITE_URL), applicationName: "S2MBOU" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="fr" className="h-full antialiased"><body className="flex min-h-full flex-col"><SiteHeader /><main id="contenu" className="flex-1">{children}</main><SiteFooter /></body></html>;
}
