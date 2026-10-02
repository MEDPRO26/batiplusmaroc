import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({ queries: {} as Record<string, unknown>, called: [] as string[] }));
vi.mock("convex/react", () => ({
  useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(query); state.called.push(name); return state.queries[name];
  },
  useMutation: () => vi.fn(),
}));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => "session" }));
vi.mock("@/components/layout/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "outfit" }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>, useRouter: () => ({ replace: vi.fn() }) }));

import { CompanyVerificationForm } from "./components/company-verification-form";
import { VerifiedBadge, type VerificationStatus } from "./components/verified-badge";
import CompanyVerificationError from "@/app/[locale]/(account)/espace-entreprise/verification/error";

function render(node: React.ReactNode, locale: "en" | "fr" = "en") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr}>{node}</NextIntlClientProvider>);
}
function seed(status: VerificationStatus, documents: unknown[] = [], owner = true) {
  state.queries = {
    "users:currentUser": { accountType: "company", onboardingStatus: "completed" },
    "companyVerification/index:getVerificationStatus": { status, canManageDocuments: owner },
    "companyVerification/index:getVerificationForm": { status, documents, rejectionReason: "Replace expired certificate", legalName: "Atlas", ice: "001234567890123", rcNumber: "123", legalRepresentative: "Sara", phone: "0612345678", address: "Agadir" },
  };
}
const tax = { documentId: "doc", documentType: "tax_compliance", fileName: "tax.pdf" };
beforeEach(() => { state.called = []; state.queries = {}; });

for (const locale of ["en", "fr"] as const) {
  test(`${locale}: draft requires tax certificate and lists required/optional documents`, () => {
    seed("draft"); const html = render(<CompanyVerificationForm />, locale);
    expect(html).toContain(locale === "en" ? "Tax Compliance Certificate" : "Attestation de régularité fiscale");
    expect(html).toContain(locale === "en" ? "10 MiB" : "10 Mio");
    expect(html).toContain('disabled="" type="submit"'); expect(html).toContain('type="file"');
  });
  test(`${locale}: existing tax enables submission`, () => {
    seed("draft", [tax]); const html = render(<CompanyVerificationForm />, locale);
    expect(html).toContain("tax.pdf"); expect(html).not.toContain('disabled="" type="submit"');
  });
  test(`${locale}: pending is locked and verified shows the blue badge`, () => {
    seed("pending", [tax]); const pending = render(<CompanyVerificationForm />, locale);
    expect(pending).toContain(locale === "en" ? "Verification pending" : "Vérification en attente");
    expect(pending).not.toContain('type="file"'); expect(pending).not.toContain("tax.pdf");
    seed("verified", [tax]); const verified = render(<CompanyVerificationForm />, locale);
    expect(verified).toContain(locale === "en" ? "Your Company has been verified by Batiplus." : "Votre entreprise a été vérifiée par Batiplus.");
    expect(verified).toContain('text-[#2f6bff]'); expect(verified).not.toContain('type="file"');
  });
  test(`${locale}: rejection reason and resubmit action are owner-only`, () => {
    seed("rejected", [tax]); const owner = render(<CompanyVerificationForm />, locale);
    expect(owner).toContain("Replace expired certificate"); expect(owner).toContain(locale === "en" ? "Resubmit for review" : "Renvoyer pour examen");
    seed("rejected", [tax], false); state.called = []; const staff = render(<CompanyVerificationForm />, locale);
    expect(staff).not.toContain("tax.pdf"); expect(staff).not.toContain("Replace expired certificate"); expect(staff).not.toContain('type="file"');
    expect(state.called).not.toContain("companyVerification/index:getVerificationForm");
  });
  test(`${locale}: loading and recoverable error copy`, () => {
    expect(render(<CompanyVerificationForm />, locale)).toContain('aria-busy="true"');
    expect(render(<CompanyVerificationError reset={() => undefined} />, locale)).toContain(locale === "en" ? "Unable to load verification" : "Impossible de charger la vérification");
  });
}
for (const status of ["draft", "pending", "rejected", "verified"] as const) {
  test(`shared badge renders only for verified: ${status}`, () => {
    expect(Boolean(render(<VerifiedBadge label={en.auth.companyVerification.verified.badge} verificationStatus={status} />))).toBe(status === "verified");
  });
}
