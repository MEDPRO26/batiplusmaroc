import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span aria-label={alt} data-src={src} />
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) => key === "reviewBy" ? `reviewBy ${String(values?.name ?? "")}` : key,
  getFormatter: async () => ({ number: (value: number) => String(value), dateTime: () => "Sep 26, 2026" }),
}));

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
  slug: "atlas-build",
  name: "Atlas Build",
  logoUrl: "https://cdn.example.test/logo.webp",
  coverImageUrl: "https://cdn.example.test/cover.webp",
  isVerified: true,
  city: "Rabat",
  description: "Construction services for residential and commercial clients across Morocco.",
  services: ["structural", "finishing"],
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
