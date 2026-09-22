import { useQuery } from "convex/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("convex/react", () => ({ useAction: vi.fn(), useMutation: vi.fn(), useQuery: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null, useRouter: vi.fn() }));
vi.mock("@/features/shared/components/app-feedback", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import {
  CompanyProfileEditor,
  CompanyProfileEditorSkeleton,
} from "./components/company-profile-editor";

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

describe("company profile management UX contract", () => {
  test("FR and EN expose the same complete profile-management translation shape", () => {
    expect(objectShape(fr.companyProfileManager)).toEqual(objectShape(en.companyProfileManager));
    expect(en.companyProfileManager.save).toBe("Save changes");
    expect(fr.companyProfileManager.save).toBe("Enregistrer les modifications");
    expect(en.companyProfileManager.legal.notice).toContain("cannot be edited here");
    expect(fr.companyProfileManager.legal.notice).toContain("ne peuvent pas être modifiés ici");
  });

  test("renders an announced loading skeleton", () => {
    const html = renderToStaticMarkup(
      <CompanyProfileEditorSkeleton label="Loading your company profile…" />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading your company profile…");
    expect(html.match(/skeleton-block/g)?.length).toBeGreaterThan(5);
  });

  test("localizes every backend-provided profile option", () => {
    const optionGroups = ["companySize", "languages", "serviceOptions", "serviceAreaOptions"] as const;
    for (const group of optionGroups) {
      expect(Object.keys(fr.companyProfileManager[group]).sort()).toEqual(
        Object.keys(en.companyProfileManager[group]).sort(),
      );
    }
    expect(Object.keys(en.companyProfileManager.serviceOptions)).toHaveLength(10);
    expect(Object.keys(en.companyProfileManager.serviceAreaOptions)).toHaveLength(10);
  });

  test("renders the responsive editor with public fields and read-only legal fields", () => {
    let queryIndex = 0;
    vi.mocked(useQuery).mockImplementation(() => {
      queryIndex += 1;
      if (queryIndex === 1) {
        return { accountType: "company", onboardingStatus: "completed" } as never;
      }
      return {
        slug: "atlas-build",
        name: "Atlas Build",
        description: "Construction services for residential and commercial clients.",
        city: "Rabat",
        phone: "0612345678",
        website: "https://atlas.example/",
        yearsExperience: 12,
        foundedYear: 2012,
        companySize: "11to50",
        languages: ["arabic", "french"],
        serviceAreas: ["rabat", "sale"],
        services: ["structural", "finishing"],
        serviceOptions: Object.keys(en.companyProfileManager.serviceOptions),
        serviceAreaOptions: Object.keys(en.companyProfileManager.serviceAreaOptions),
        languageOptions: Object.keys(en.companyProfileManager.languages),
        companySizeOptions: Object.keys(en.companyProfileManager.companySize),
        logoUrl: null,
        coverImageUrl: null,
        legal: {
          verificationStatus: "pending",
          legalName: "Atlas Build SARL",
          ice: "001122334455667",
          rcNumber: "RC-123",
          legalRepresentative: "Owner Name",
          phone: "0522000000",
          address: "Rabat",
          documents: [{ documentType: "rc", fileName: "registre-commerce.pdf" }],
        },
      } as never;
    });

    const html = renderToStaticMarkup(<CompanyProfileEditor />);
    expect(html).toContain("branding.title");
    expect(html).toContain("serviceAreas.title");
    expect(html).toContain('name="coverImage"');
    expect(html).toContain('name="serviceAreas"');
    expect(html).toContain('name="languages"');
    expect(html.match(/readonly/g)?.length).toBe(6);
    expect(html).toContain("registre-commerce.pdf");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain(">save</button>");
  });
});
