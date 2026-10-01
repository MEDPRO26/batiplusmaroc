import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
  useFormatter: () => ({ number: String, dateTime: String }),
}));
vi.mock("convex/react", () => ({ useAction: vi.fn(), useMutation: vi.fn(), useQuery: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode; href?: unknown }) => <a {...props} href="#">{children}</a>,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/features/shared/components/app-feedback", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import {
  CompanyProfileEditor,
  CompanyProfileEditorSkeleton,
} from "./components/company-profile-editor";
import { CompanySettings } from "./components/profile/company-settings";

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

  test("the profile reads as display data with focused edit controls and no private legal data", () => {
    mockQueries();
    const html = renderToStaticMarkup(<CompanyProfileEditor />);
    expect(html).toContain("Atlas Build");
    expect(html).toContain("profileView.about");
    expect(html).toContain("serviceOptions.structural");
    expect(html).toContain("serviceAreaOptions.sale");
    for (const label of ["dialogs.editAbout", "dialogs.editServices", "dialogs.editAreas", "dialogs.editLanguages", "dialogs.editInfo", "dialogs.editIdentity", "dialogs.editContact"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain("profileView.settings");
    expect(html).toContain("viewPublicProfile");
    // Services and areas are display chips here, never a permanent checkbox form.
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('name="services"');
    expect(html).not.toContain(">save</button>");
    // Legal verification data belongs to Settings › Verification only.
    expect(html).not.toContain("001122334455667");
    expect(html).not.toContain("registre-commerce.pdf");
    expect(html).not.toContain("Atlas Build SARL");
  });

  test("settings verification shows legal data read-only and keeps the public trust note", () => {
    mockQueries();
    const html = renderToStaticMarkup(<CompanySettings section="verification" />);
    expect(html).toContain("001122334455667");
    expect(html).toContain("registre-commerce.pdf");
    expect(html).toContain("legal.notice");
    expect(html).toContain("settings.verificationPublicNote");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("<input");
  });
});

function mockQueries() {
  vi.mocked(useQuery).mockImplementation(((ref: unknown) => {
    const name = getFunctionName(ref as never);
    if (name === "users:currentUser") return { accountType: "company", onboardingStatus: "completed", email: "owner@atlas.example" };
    if (name === "companies/index:getProfileManager") return profileFixture;
    return undefined;
  }) as never);
}

const profileFixture = {
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
  catalogServices: [],
  selectedServiceIds: [],
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
};
