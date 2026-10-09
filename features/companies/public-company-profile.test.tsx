import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "fr" }));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span aria-label={alt} data-src={src} />
  ),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => {
    const messages = localeState.locale === "fr" ? fr : en;
    if (namespace === "companyDirectory.coverage") return createTranslator({ locale: localeState.locale, messages, namespace: "companyDirectory.coverage" });
    return (key: string, values?: Record<string, unknown>) => {
      if (key === "verified") return messages.publicCompany.verified;
      if (key === "declaredCoverage") return messages.publicCompany.declaredCoverage;
      if (key === "reviewBy") return `reviewBy ${String(values?.name ?? "")}`;
      if (key === "headquartersLocation") return messages.publicCompany.headquartersLocation.replace("{location}", String(values?.location ?? ""));
      return key;
    };
  },
  getLocale: async () => localeState.locale,
  getFormatter: async () => ({ number: (value: number) => String(value), dateTime: () => "Sep 26, 2026" }),
}));
vi.mock("@/features/invitations/components/invite-company-button", () => ({
  InviteCompanyButton: () => <button type="button">invite</button>,
}));

import { VerifiedBadge } from "./components/verified-badge";
import { PublicCompanyProfile } from "./components/public-company-profile";

function renderProfile(node: React.ReactNode) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={localeState.locale} messages={localeState.locale === "fr" ? fr : en}>{node}</NextIntlClientProvider>);
}

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
  for (const locale of ["en", "fr"] as const) {
    test(`HQ2.1 renders localized administrative headquarters without commune or verification data in ${locale}`, async () => {
      localeState.locale = locale;
      const html = renderProfile(await PublicCompanyProfile({ company: {
        ...company, city: "Agadir", headquarters: { regionCode: "09", provinceCode: "09.001", communeName: "PRIVATE-COMMUNE" },
        legal: { address: "PRIVATE-VERIFICATION-ADDRESS" },
      } as never }));
      expect(html).toContain(`${locale === "fr" ? "Siège :" : "Headquarters:"} Agadir · Agadir-Ida-Ou-Tanane · Souss-Massa`);
      expect(html).not.toMatch(/PRIVATE-COMMUNE|PRIVATE-VERIFICATION-ADDRESS/);
      expect(html).toContain((locale === "fr" ? fr : en).publicCompany.declaredCoverage);
    });
    test(`HQ2.1 falls back to the saved city for legacy or unavailable codes in ${locale}`, async () => {
      localeState.locale = locale;
      for (const headquarters of [undefined, { regionCode: null, provinceCode: null }, { regionCode: "99", provinceCode: "99.999" }]) {
        const html = renderProfile(await PublicCompanyProfile({ company: { ...company, headquarters } as never }));
        expect(html).toContain(`${locale === "fr" ? "Siège :" : "Headquarters:"} Rabat`);
        expect(html).not.toContain("99.999");
      }
    });
  }
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
    const html = renderProfile(await PublicCompanyProfile({ company: profile as never }));
    expect(html).toContain(customName);
    expect(html).toContain(originalName);
  });
  for (const locale of ["en", "fr"] as const) {
    test.each(["verified", "draft", "pending", "rejected"])(`public profile badges are verified-only in ${locale}: %s`, async (status) => {
      localeState.locale = locale;
      const isVerified = status === "verified";
      const html = renderProfile(await PublicCompanyProfile({ company: { ...company, isVerified } as never }));
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
    const html = renderProfile(await PublicCompanyProfile({ company: company as never }));
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

describe("HQ3.1 public declared coverage", () => {
  for (const locale of ["en", "fr"] as const) {
    const labels = locale === "fr" ? fr.companyDirectory.coverage : en.companyDirectory.coverage;
    test.each([
      [["MA"], [labels.national], [labels.notDeclared]],
      [["R:09"], [labels.region.replace("{name}", "Souss-Massa")], [labels.notDeclared]],
      [["P:09.541"], [labels.province.replace("{name}", "Taroudannt")], [labels.region.replace("{name}", "Souss-Massa")]],
      [["P:09.001"], [labels.prefectureElided.replace("{name}", "Agadir-Ida-Ou-Tanane")], ["P:09.001"]],
      [[], [labels.notDeclared], [labels.national]],
      [["R:99", "P:99.999", "invalid"], [labels.notDeclared], ["R:99", "P:99.999", "invalid"]],
    ])(`renders explicit scopes %j in ${locale}`, async (coverageScopeKeys, included, excluded) => {
      localeState.locale = locale;
      const html = renderProfile(await PublicCompanyProfile({ company: { ...company, coverageScopeKeys } as never }));
      const start = html.indexOf((locale === "fr" ? fr : en).publicCompany.declaredCoverage);
      expect(start).toBeGreaterThan(0);
      const section = html.slice(start, html.indexOf("</section>", start));
      for (const text of included) expect(section).toContain(text);
      for (const text of excluded) expect(section).not.toContain(text);
      expect(section).not.toMatch(/data-verification|serviceArea\.|R:09|P:09.541/);
      expect(html).not.toContain("serviceAreas");
    });

    test(`keeps overlaps and all names in a wrapping native disclosure in ${locale}`, async () => {
      localeState.locale = locale;
      const html = renderProfile(await PublicCompanyProfile({ company: { ...company, coverageScopeKeys: ["MA", "R:09", "P:09.541"] } as never }));
      expect(html).toContain("<details");
      expect(html).toContain("<summary");
      expect(html).toContain("break-words");
      expect(html).toContain("focus-visible:outline");
      expect(html).toContain(labels.national);
      expect(html).toContain(labels.region.replace("{name}", "Souss-Massa"));
      expect(html).toContain(labels.province.replace("{name}", "Taroudannt"));
      expect(html).not.toMatch(/R:09|P:09.541|serviceArea\./);
    });

    test(`legacy areas and structured headquarters never imply declared coverage in ${locale}`, async () => {
      localeState.locale = locale;
      for (const coverageScopeKeys of [undefined, []]) {
        const html = renderProfile(await PublicCompanyProfile({ company: {
          ...company, city: "Agadir", headquarters: { regionCode: "09", provinceCode: "09.001" },
          serviceAreas: ["agadir", "rabat"], coverageScopeKeys,
        } as never }));
        expect(html).toContain(labels.notDeclared);
        expect(html).not.toContain(labels.region.replace("{name}", "Souss-Massa"));
        expect(html).not.toMatch(/serviceArea\.|serviceAreas/);
      }
    });
  }
});
