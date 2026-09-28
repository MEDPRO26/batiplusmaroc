import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/shared/outfit", () => ({ outfit: { className: "font-outfit" } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { MarketplaceFeed } from "./marketplace-feed";

function render(locale: "en" | "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr}>
      <MarketplaceFeed />
    </NextIntlClientProvider>,
  );
}

describe("homepage marketplace feed", () => {
  test.each([
    ["en", "Projects ready for proposals"],
    ["fr", "Des projets prêts à recevoir des propositions"],
  ] as const)("renders budget-free Project examples in %s", (locale, heading) => {
    const html = render(locale);
    expect(html).toContain(heading);
    expect(html).not.toContain(">Budget<");
    expect(html).not.toMatch(/MAD 850k|850 000 – 1 200 000 DH/);
    expect(Object.values((locale === "en" ? en : fr).home.feed.projects).some(
      (value) => typeof value === "object" && "budget" in value,
    )).toBe(false);
  });
});
