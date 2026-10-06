import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
vi.mock("next/image", () => ({ default: ({ src, unoptimized, alt }: { src: string; unoptimized?: boolean; alt: string }) => <span data-src={src} data-unoptimized={unoptimized} aria-label={alt} /> }));
import { ApprovedCompanyCover } from "./components/approved-company-cover";
const site = "https://cover-test.convex.site";
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", site));
afterEach(() => vi.unstubAllEnvs());
function render(url: string | null, locale: "en" | "fr" = "en") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}><ApprovedCompanyCover alt="Company cover" width={40} height={40} url={url} /></NextIntlClientProvider>);
}
test("approved endpoint goes straight to the browser without Next optimization", () => {
  expect(render(`${site}/company-covers/public/approved`)).toContain('data-unoptimized="true"');
  expect(render(`${site}/company-covers/public/approved`)).toContain(`${site}/company-covers/public/approved`);
});
test.each(["en", "fr"] as const)("%s uses a generic Company image for absent, private and legacy URLs", locale => {
  for (const url of [null, `${site}/company-covers/private/pending`, `${site}/api/storage/legacy`, "https://media.example.test/cover.png"]) {
    const html = render(url, locale);
    expect(html).toContain((locale === "fr" ? fr : en).companyCover.genericAlt);
    expect(html).not.toContain("data-src");
  }
});
