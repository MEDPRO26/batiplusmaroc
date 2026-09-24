import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace?: string } = {}) => {
    const dict =
      namespace === "legal.terms"
        ? en.legal.terms
        : namespace === "legal.privacy"
          ? en.legal.privacy
          : namespace === "legal"
            ? {
                termsLink: en.legal.termsLink,
                privacyLink: en.legal.privacyLink,
                contactLink: en.legal.contactLink,
              }
            : {};
    const translate = (key: string, values?: { date?: string }) => {
      if (key === "updated" && values?.date) return `Last updated: ${values.date}`;
      const parts = key.split(".");
      let current: unknown = dict;
      for (const part of parts) {
        if (!current || typeof current !== "object") return key;
        current = (current as Record<string, unknown>)[part];
      }
      return typeof current === "string" ? current : key;
    };
    translate.raw = (key: string) => {
      const parts = key.split(".");
      let current: unknown = dict;
      for (const part of parts) {
        if (!current || typeof current !== "object") return [];
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    };
    return translate;
  },
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/page-meta", () => ({
  resolveLocale: async () => "en",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { LegalDocument } from "./legal-document";

function objectShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(objectShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, objectShape(child)]),
    );
  }
  return typeof value;
}

describe("legal pages", () => {
  test("FR and EN expose matching legal document shapes", () => {
    expect(objectShape(fr.legal)).toEqual(objectShape(en.legal));
    expect(en.legal.terms.title).toBe("Terms of Service");
    expect(fr.legal.terms.title).toBe("Conditions d’utilisation");
    expect(en.legal.privacy.title).toBe("Privacy Policy");
    expect(fr.legal.privacy.title).toBe("Politique de confidentialité");
    expect(en.legal.terms).not.toHaveProperty("placeholder");
    expect(en.legal.privacy).not.toHaveProperty("placeholder");
  });

  test("terms page renders sections, TOC, and related links", async () => {
    const html = renderToStaticMarkup(
      await LegalDocument({ page: "terms", params: Promise.resolve({ locale: "en" }) }),
    );
    expect(html).toContain("Terms of Service");
    expect(html).toContain("Purpose of Batiplus");
    expect(html).toContain("id=\"messaging\"");
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("/contactez-nous");
    expect(html).not.toContain("final legal text will be added");
  });

  test("privacy page states that public profiles hide phone and email", async () => {
    const html = renderToStaticMarkup(
      await LegalDocument({ page: "privacy", params: Promise.resolve({ locale: "en" }) }),
    );
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("Company phone numbers and email addresses are not shown");
    expect(html).toContain("Terms of Service");
  });
});
