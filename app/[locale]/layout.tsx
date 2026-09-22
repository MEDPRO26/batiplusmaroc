import { NextIntlClientProvider } from "next-intl";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { htmlLang } from "@/lib/i18n-seo";
import { SITE_URL } from "@/lib/seo";
import { routing } from "@/i18n/routing";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { AppFeedback } from "@/features/shared/components/app-feedback";
import "../globals.css";

const siteSans = localFont({
  src: "../../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-site-sans",
  display: "swap",
});

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: t("appName"),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations("common");

  return (
    <html lang={htmlLang(locale)} className={`${siteSans.variable} h-full antialiased`}>
      <body className="group/body flex min-h-full flex-col bg-white">
        <ConvexClientProvider>
          <NextIntlClientProvider messages={messages}>
            <AppFeedback>
              <a
                className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand"
                href="#contenu"
              >
                {t("skipToContent")}
              </a>
              {children}
            </AppFeedback>
          </NextIntlClientProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
