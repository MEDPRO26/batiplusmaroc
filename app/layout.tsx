import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

const siteSans = localFont({
  src: "../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-site-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "S2MBOU",
  icons: {
    icon: [
      { url: "/favicon-32.webp", type: "image/webp", sizes: "32x32" },
      { url: "/favicon.webp", type: "image/webp", sizes: "500x500" },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="fr-FR" className={`${siteSans.variable} h-full antialiased`}><body className="group/body flex min-h-full flex-col"><SiteHeader /><main id="contenu" className="flex-1">{children}</main><SiteFooter /></body></html>;
}
