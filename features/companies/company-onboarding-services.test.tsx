import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { defaultServiceCatalog } from "@/lib/service-catalog-defaults";

const selected = "catalog-1";
const queryState = vi.hoisted(() => ({ fallback: false }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/features/auth/components/onboarding-chrome", () => ({ OnboardingChrome: () => null }));
vi.mock("convex/react", () => ({
  useQuery: (reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "users:currentUser") return { accountType: "company", onboardingStatus: "pending" };
    if (name === "companies/index:getOnboardingProfile") return {
      ownerFirstName: "Ada", ownerLastName: "Build", name: "Atlas", legalName: "Atlas SARL",
      phone: "0612345678", city: "Rabat", description: "A construction company with residential projects.",
      yearsExperience: null, website: "", logoUrl: null, publicSlug: null,
      services: ["structural"], serviceOptions: defaultServiceCatalog.map(row => row.slug), selectedServiceIds: [selected],
      fallbackServices: queryState.fallback ? [...defaultServiceCatalog] : [],
      catalogServices: queryState.fallback ? [] : [
        { _id: selected, slug: "structural", nameFr: "Gros œuvre", nameEn: "Structural work", isActive: true, sortOrder: 0 },
        { _id: "catalog-2", slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", isActive: true, sortOrder: 10 },
      ], onboardingStatus: "pending", verificationStatus: "draft", accountRestricted: false,
    };
    return undefined;
  },
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
import { CompanyOnboardingForm } from "./components/company-onboarding-form";

describe("company onboarding service catalog", () => {
  beforeEach(() => { queryState.fallback = false; });
  test("Admin labels exist in both locales", () => {
    expect(Object.keys(fr.adminServices).sort()).toEqual(Object.keys(en.adminServices).sort());
  });
  test.each([
    ["fr", fr, "Gros œuvre", "Toiture"],
    ["en", en, "Structural work", "Roofing"],
  ] as const)("renders active %s service names with catalog IDs", (locale, messages, first, second) => {
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages}><CompanyOnboardingForm /></NextIntlClientProvider>);
    expect(html).toContain(first);
    expect(html).toContain(second);
    expect(html).toContain(`value="${selected}"`);
    expect(html).toContain('value="catalog-2"');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).not.toContain('value="architecture"');
    expect(html).not.toContain('value="structural"');
    expect(html).not.toContain("catalog-3");
  });
  test.each([["fr", fr], ["en", en]] as const)("renders all ten fallback services in %s with stable legacy keys", (locale, messages) => {
    queryState.fallback = true;
    const render = () => renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages}><CompanyOnboardingForm /></NextIntlClientProvider>);
    const html = render();
    expect(html.match(/type="checkbox"/g)).toHaveLength(10);
    for (const service of defaultServiceCatalog) {
      expect(html).toContain(locale === "fr" ? service.nameFr : service.nameEn);
      expect(html).toContain(`value="${service.slug}"`);
    }
    expect(html).not.toContain(`value="${selected}"`);
    queryState.fallback = false;
    const seededHtml = render();
    expect(seededHtml).toContain(`value="${selected}"`);
    expect(seededHtml).toContain(locale === "fr" ? "Toiture" : "Roofing");
    expect(seededHtml).not.toContain('value="architecture"');
  });
});
