import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({ review: undefined as unknown }));
vi.mock("convex/react", () => ({ useQuery: () => state.review, useMutation: () => vi.fn() }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => "session" }));
vi.mock("@/components/layout/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "outfit" }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>, useRouter: () => ({ replace: vi.fn() }) }));
import { AdminCompanyVerification } from "./components/admin-company-verification";
import AdminCompaniesError from "@/app/[locale]/(admin)/admin/companies/error";

const tax = { documentId: "doc-tax", documentType: "tax_compliance", fileName: "certificate.pdf", uploadedAt: 1000, downloadUrl: "https://example.convex.site/company-verification/documents/doc-tax" };
function seed(status = "pending", documents: unknown[] = [tax]) {
  state.review = { companyId: "company", status, legalName: "Atlas", ice: "001234567890123", rcNumber: "88", legalRepresentative: "Sara", phone: "+212612345678", address: "Agadir", submittedAt: status === "draft" ? null : 1000, latestRejectionReason: "Replace expired certificate", documents, history: [
    { historyId: "history", action: "verification_approved", oldStatus: "pending", newStatus: "verified", changedAt: 2000, changedBy: { firstName: "Ada", lastName: "Admin", email: "admin@example.test" }, rejectionReason: null },
  ] };
}
function render(locale: "en" | "fr", node = <AdminCompanyVerification companyId={"company" as Id<"companies">} companyName="Atlas" />) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr}>{node}</NextIntlClientProvider>);
}
beforeEach(() => { state.review = undefined; });
for (const locale of ["en", "fr"] as const) {
  const copy = locale === "en" ? en.adminCompanies.verification : fr.adminCompanies.verification;
  const decisions = locale === "en" ? en.adminVerification : fr.adminVerification;
  for (const status of ["draft", "pending", "rejected", "verified"] as const) {
    test(`${locale}: ${status} review exposes decisions only while pending`, () => {
      seed(status); const html = render(locale);
      expect(html).toContain(copy.state[status]);
      expect(html.includes(`>${decisions.approve}</button>`)).toBe(status === "pending");
      expect(html.includes(`>${decisions.reject}</button>`)).toBe(status === "pending");
      expect(html.includes("Replace expired certificate")).toBe(status === "rejected");
      expect(html.includes('text-[#2f6bff]')).toBe(status === "verified");
    });
  }
  test(`${locale}: required/optional groups, uploaded date, safe document action and audit actor`, () => {
    seed(); const html = render(locale);
    for (const text of [copy.requiredDocuments, copy.optionalDocuments, copy.documentTypes.tax_compliance, copy.required, copy.viewDocument, copy.actions.verification_approved, "Ada Admin", "certificate.pdf"]) expect(html).toContain(text);
    expect(html).toContain(locale === "en" ? "Uploaded" : "Ajouté");
    expect(html).not.toContain("https://example.convex.site"); expect(html).not.toContain("doc-tax");
    expect(html).not.toContain('target="_blank"'); expect(html).not.toContain('type="file"');
  });
  test(`${locale}: missing required document disables approval and shows an actionable warning`, () => {
    seed("pending", []); const html = render(locale);
    expect(html).toContain(copy.missingRequired); expect(html).toMatch(new RegExp(`disabled=""[^>]*>${decisions.approve}</button>`));
  });
  test(`${locale}: loading, not found, empty history and route error states`, () => {
    expect(render(locale)).toContain('aria-busy="true"');
    state.review = null; expect(render(locale)).toContain(copy.notFound);
    seed("draft", []); (state.review as { history: unknown[] }).history = []; expect(render(locale)).toContain(copy.noHistory);
    expect(render(locale, <AdminCompaniesError error={new Error("private server detail")} reset={() => undefined} />)).not.toContain("private server detail");
  });
  test(`${locale}: history renders all safe actions and escapes actor and reason markup`, () => {
    seed("rejected"); (state.review as { history: unknown[] }).history = Object.keys(copy.actions).map((action, index) => ({ historyId: `${index}`, action: action === "status_changed" ? undefined : action, oldStatus: "draft", newStatus: "rejected", changedAt: 1000, rejectionReason: "<script>private reason</script>", changedBy: { firstName: "<img src=x>", lastName: null, email: null } }));
    const html = render(locale); for (const label of Object.values(copy.actions)) expect(html).toContain(label);
    expect(html).toContain("&lt;script&gt;"); expect(html).toContain("&lt;img src=x&gt;"); expect(html).not.toContain("<script>");
  });
}
