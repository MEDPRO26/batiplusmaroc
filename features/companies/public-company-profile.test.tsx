import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
const localeState = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span aria-label={alt} data-src={src} />
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) => key === "verified" ? (localeState.locale === "fr" ? fr : en).publicCompany.verified : key === "reviewBy" ? `reviewBy ${String(values?.name ?? "")}` : key,
  getLocale: async () => localeState.locale,
  getFormatter: async () => ({ number: (value: number) => String(value), dateTime: () => "Sep 26, 2026" }),
}));
vi.mock("@/features/invitations/components/invite-company-button", () => ({
  InviteCompanyButton: () => <button type="button">invite</button>,
}));

import { VerifiedBadge } from "./components/verified-badge";
import { PublicCompanyProfile } from "./components/public-company-profile";

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

const company = {
  id: "company-1" as never,
  slug: "atlas-build",
  name: "Atlas Build",
  logoUrl: "https://cdn.example.test/logo.webp",
  coverImageUrl: "https://cdn.example.test/cover.webp",
  isVerified: true,
  city: "Rabat",
  description: "Construction services for residential and commercial clients across Morocco.",
  services: ["structural", "finishing"],
  serviceNames: [{ slug: "structural", nameFr: "Gros œuvre", nameEn: "Structural work" }, { slug: "finishing", nameFr: "Second œuvre", nameEn: "Finishing work" }],
  serviceAreas: ["rabat", "sale"],
  yearsExperience: 12,
  foundedYear: 2012,
  companySize: "11to50",
  languages: ["arabic", "french"],
  website: "https://atlas.example/",
  rating: 4.5,
  reviewCount: 2,
  reviews: [{ rating: 5, comment: "Excellent construction work and communication.", createdAt: 1_790_000_000_000, reviewerFirstName: "Samira", reviewerLastInitial: "B", projectTitle: "Villa Atlas" }],
  portfolio: [
    {
      id: "project-1" as never,
      title: "Villa Atlas",
      description: "Completed villa renovation.",
      city: "Rabat",
      projectType: "renovation",
      surface: 220,
      durationMonths: 8,
      year: 2024,
      status: "published",
      coverImageUrl: "https://cdn.example.test/project.webp",
      media: [],
      updatedAt: 1,
    },
  ],
} as const;

describe("public company profile UX contract", () => {
  test.each([
    ["en", "Roofing", "Structural work"],
    ["fr", "Toiture", "Gros œuvre"],
  ] as const)("renders custom and seeded catalog names in %s", async (locale, customName, originalName) => {
    localeState.locale = locale;
    const profile = {
      ...company,
      services: ["roofing", "structural"],
      serviceNames: [
        { slug: "roofing", nameFr: "Toiture", nameEn: "Roofing" },
        { slug: "structural", nameFr: "Gros œuvre", nameEn: "Structural work" },
      ],
    };
    const html = renderToStaticMarkup(await PublicCompanyProfile({ company: profile as never }));
    expect(html).toContain(customName);
    expect(html).toContain(originalName);
  });
  for (const locale of ["en", "fr"] as const) {
    test.each(["verified", "draft", "pending", "rejected"])(`public profile badges are verified-only in ${locale}: %s`, async (status) => {
      localeState.locale = locale;
      const isVerified = status === "verified";
      const html = renderToStaticMarkup(await PublicCompanyProfile({ company: { ...company, isVerified } as never }));
      expect(html.match(/data-verification="verified"/g) ?? []).toHaveLength(isVerified ? 2 : 0);
      expect(html).not.toContain('data-verification="unverified"');
      expect(html).not.toMatch(/Unverified company|Entreprise non vérifiée|storageId|verificationPending/);
      if (isVerified) expect(html).toContain(renderToStaticMarkup(<VerifiedBadge isVerified label={(locale === "en" ? en : fr).publicCompany.verified} />));
    });
  }
  test("FR and EN expose the same publicCompany translation shape without contact leakage keys", () => {
    expect(objectShape(fr.publicCompany)).toEqual(objectShape(en.publicCompany));
    expect(en.publicCompany).not.toHaveProperty("publicPhone");
    expect(fr.publicCompany).not.toHaveProperty("publicPhone");
    expect(en.publicCompany.overview).toBe("Overview");
    expect(fr.publicCompany.overview).toBe("Présentation");
  });

  test("renders Upwork-like layout without phone or email", async () => {
    const html = renderToStaticMarkup(await PublicCompanyProfile({ company: company as never }));
    expect(html).toContain("lg:grid-cols-[minmax(240px,28%)_minmax(0,1fr)]");
    expect(html).toContain("overview");
    expect(html).toContain("stats");
    expect(html).toContain("verifications");
    expect(html).toContain("portfolioTitleCount");
    expect(html).toContain("divide-x");
    expect(html).toContain("xl:grid-cols-3");
    expect(html).toContain("Atlas Build");
    expect(html).toContain("Villa Atlas");
    expect(html).toContain("reviewsTitle");
    expect(html).toContain("Excellent construction work and communication.");
    expect(html).toContain("Samira B.");
    expect(html).not.toMatch(/tel:|mailto:|publicPhone|@|0612|0522/i);
    expect(html).not.toMatch(/dealId|clientUserId|moderationStatus/i);
  });
});
