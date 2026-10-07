import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { APP_ERROR_CODES } from "@/lib/errors/codes";
const mocked = vi.hoisted(() => ({ queries: {} as Record<string, unknown>, calls: [] as string[], mutations: [] as string[] }));
vi.mock("convex/react", () => ({
  useQuery: (ref: never, args: unknown) => { const name = getFunctionName(ref); mocked.calls.push(name); return args === "skip" ? undefined : mocked.queries[name]; },
  useMutation: (ref: never) => async () => { mocked.mutations.push(getFunctionName(ref)); return {}; },
  usePaginatedQuery: (ref: never) => { mocked.calls.push(getFunctionName(ref)); return { results: [], status: "Exhausted", loadMore: vi.fn() }; },
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="#project">{children}</a> }));
import { ClientAgreementPanel } from "./components/client-agreement-panel";
import { AdminAgreementPanel } from "./components/admin-agreement-panel";
import { TermsView } from "./components/agreement-shared";
import { agreementFailure, confirmationChanged, editorToTerms, emptyEditor, exactPercentage, parseCentimeMad, publicationChanged, realDate, startHasPassed, termsToEditor,
  type AdminAgreement, type ClientAgreement, type Terms, type AgreementVersion, type PublishPayload } from "./lib/agreement-ui";

const projectId = "project" as Id<"projects">;
const terms: Terms = { tasks: "Negotiated prose remains verbatim.", exclusions: "No guarantees.", visits: "Two agreed visits.", availability: "To be agreed for each visit.",
  startDate: "2099-01-01", currency: "MAD", fee: { kind: "percentage", rate: "2.123456789000", basis: "Explicitly shared base", basisAmountMad: 1000.29 }, payer: "Another payer", paymentTerms: "Dates agreed in messages." };
const version: AgreementVersion = { id: "version-1" as Id<"coordinationAgreementVersions">, versionNumber: 1, terms, publishedByDisplayName: "Ada", publishedAt: 1,
  replacesVersionId: null, adminNotStartedDeclaredAt: 1, confirmation: null, status: "pending", isCurrentConfirmed: false };
const summary: ClientAgreement = { id: "agreement" as Id<"coordinationAgreements">, projectId, supportConversationId: "support" as Id<"clientSupportConversations">,
  readiness: { eligible: true, declaredAt: 1, revision: 1 }, projectAllowsNewActions: true, pendingConfirmationStatus: "ready", pendingVersion: version, currentConfirmedVersion: null, versionCount: 1 };
function render(locale: "en" | "fr", content: React.ReactNode) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr}>{content}</NextIntlClientProvider>);
}
beforeEach(() => { mocked.calls = []; mocked.mutations = []; mocked.queries = {}; });

describe("exact negotiated inputs", () => {
  test.each([["0.01", 0.01], ["0,29", 0.29], ["1200.29", 1200.29], [" 240,40 ", 240.4]])("preserves MAD %s", (value, result) => expect(parseCentimeMad(value as string)).toBe(result));
  test.each(["0", "-1", "1.001", "1,000.29", "1 000,29", "1e3", "NaN", "Infinity", "", "01.20", "999999999999999999.99"])("rejects ambiguous/rounded amount %s", input => expect(parseCentimeMad(input)).toBeNull());
  test.each(["2.123456789000", "150.0000", "0.0000000000000000000001", "2,5000"])("keeps percentage digits %s", input => expect(exactPercentage(input)).toBe(input.replace(",", ".")));
  test.each(["0", "-1", "1e3", "NaN", "01.50", "1,2,3", "9".repeat(65)])("rejects invalid percentage %s", input => expect(exactPercentage(input)).toBeNull());
  test("draft conversion keeps precision, negotiated prose, payer and optional basis", () => {
    expect(editorToTerms(termsToEditor(terms))).toEqual(terms);
    const fixed = { ...terms, fee: { kind: "fixed" as const, amountMad: 1200.29 } };
    expect(editorToTerms(termsToEditor(fixed))).toEqual(fixed);
    expect(emptyEditor().feeKind).toBe(""); expect(emptyEditor().payer).toBe("");
    expect(() => editorToTerms({ ...termsToEditor(fixed), amountMad: "1200.291" })).toThrow("INVALID_COORDINATION_AMOUNT");
    expect(() => editorToTerms({ ...termsToEditor(terms), basis: " " })).toThrow("INVALID_COORDINATION_TERMS");
  });
  test.each(["2026-02-30", "2025-02-29", "0000-01-01", "2026-1-1", "2026-10-07T10:00Z"])("rejects invalid start %s", value => expect(realDate(value)).toBe(false));
  test("valid date-only values remain date-only, while advisory UTC start gate is explicit", () => {
    expect(realDate("2028-02-29")).toBe(true);
    expect(startHasPassed({ ...terms, startDate: "2026-10-07" }, Date.parse("2026-10-08T00:00:00Z"))).toBe(true);
  });
});

describe("frozen review checks and errors", () => {
  test("publication detects every changed expected pointer/revision", () => {
    const data: AdminAgreement = { ...summary, draft: { terms, savedAt: 1, savedByDisplayName: "Ada" }, draftRevision: 3 };
    const payload: PublishPayload = { projectId, expectedDraftRevision: 3, expectedReadinessRevision: 1, expectedPendingVersionId: version.id, expectedConfirmedVersionId: null, idempotencyKey: "key" };
    expect(publicationChanged(data, payload)).toBe(false);
    for (const changed of [{ draftRevision: 4 }, { readiness: { ...data.readiness, revision: 2 } }, { pendingVersion: null }, { currentConfirmedVersion: version }])
      expect(publicationChanged({ ...data, ...changed }, payload)).toBe(true);
    expect(publicationChanged(null, payload)).toBe(true);
  });
  test("confirmation keeps the exact version, predecessor and captured readiness revision", () => {
    const payload = { projectId, versionId: version.id, expectedConfirmedVersionId: null };
    expect(confirmationChanged(summary, payload, 1)).toBe(false);
    expect(confirmationChanged({ ...summary, pendingVersion: { ...version, id: "new" as AgreementVersion["id"] } }, payload, 1)).toBe(true);
    expect(confirmationChanged(summary, payload, 0)).toBe(true);
    expect(confirmationChanged({ ...summary, currentConfirmedVersion: version }, payload, 1)).toBe(true);
  });
  test("conflicts cannot be blindly retried and access failures are distinct", () => {
    expect(agreementFailure(new Error("COORDINATION_VERSION_CONFLICT")).retryable).toBe(false);
    expect(agreementFailure(new Error("COORDINATION_DRAFT_CONFLICT")).retryable).toBe(false);
    expect(agreementFailure(new Error("ADMIN_REQUIRED")).denied).toBe(true);
    expect(agreementFailure(new Error("COORDINATION_AGREEMENT_NOT_FOUND")).denied).toBe(true);
    expect(agreementFailure(new Error("Failed to fetch")).retryable).toBe(true);
  });
});

for (const locale of ["en", "fr"] as const) {
  test.each(["readiness_changed", "source_unavailable", "project_blocked", "start_date_passed", "declaration_missing"] as const)(
    `${locale} fresh load explains %s without presenting the pending version as confirmable`, status => {
      const copy = (locale === "en" ? en : fr).coordinationAgreement;
      mocked.queries["users:currentUser"] = { _id: "client", accountType: "client", onboardingStatus: "completed" };
      mocked.queries["coordinationAgreements/index:getMyAgreement"] = { ...summary,
        readiness: { ...summary.readiness, revision: 2 }, pendingConfirmationStatus: status,
        currentConfirmedVersion: { ...version, id: "confirmed-version", terms: { ...terms, tasks: "Confirmed terms retained" },
          confirmation: { confirmedByDisplayName: "Client", confirmedAt: 1, effectiveFrom: 1, notStartedDeclaredAt: 1 }, isCurrentConfirmed: true } };
      const html = render(locale, <ClientAgreementPanel projectId={projectId} conversationId="support" />);
      expect(html).toContain(copy.pendingBlocked); expect(html).not.toContain(copy.pending);
      expect(html).toContain(copy.confirmationStatus[status]);
      expect(html).toContain(copy.reviewVersion.replace("{number}", "1"));
      expect(html).toContain("Confirmed terms retained"); expect(html).toContain(copy.history);
      expect(mocked.mutations).toEqual([]);
    },
  );
  test(`${locale} Client sees published terms without drafts/source data and never writes on render`, () => {
    mocked.queries["users:currentUser"] = { _id: "client", accountType: "client", onboardingStatus: "completed" };
    mocked.queries["coordinationAgreements/index:getMyAgreement"] = { ...summary, draft: { tasks: "PRIVATE_DRAFT_SENTINEL" }, source: "PRIVATE_QUOTE_URL_SENTINEL" };
    const html = render(locale, <ClientAgreementPanel projectId={projectId} conversationId="support" />);
    expect(html).toContain((locale === "en" ? en : fr).coordinationAgreement.title);
    expect(html).toContain((locale === "en" ? en : fr).coordinationAgreement.pending);
    expect(html).not.toContain((locale === "en" ? en : fr).coordinationAgreement.pendingBlocked);
    expect(html).not.toContain("PRIVATE_"); expect(html).not.toContain("checked=");
    expect(mocked.calls).not.toContain("coordinationAgreements/index:getAdminAgreement"); expect(mocked.mutations).toEqual([]);
  });
  test(`${locale} admin has private editor without default fee/payer/source access`, () => {
    mocked.queries["users:currentUser"] = { _id: "admin", accountType: "admin" };
    mocked.queries["coordinationAgreements/index:getAdminAgreement"] = null;
    const html = render(locale, <AdminAgreementPanel active projectId={projectId} />);
    expect(html).toContain((locale === "en" ? en : fr).coordinationAgreement.privateDraft);
    expect(html).toContain('value=""'); expect(html).not.toContain('value="fixed" selected');
    expect(mocked.calls.some(name => /finalQuotes|messages\/index/.test(name))).toBe(false); expect(mocked.mutations).toEqual([]);
  });
  test(`${locale} negotiated prose and exact percentages are not translated or rounded`, () => {
    const html = render(locale, <TermsView terms={terms} />);
    expect(html).toContain(terms.tasks); expect(html).toContain("2.123456789000 %"); expect(html).toMatch(/1[,\s\u202f\u00a0]?000[.,]29/);
    expect(html).toContain("MAD");
  });
}
test.each(["company", "seo_team", "client", null])("unauthorized admin role %s never queries agreements", role => {
  mocked.queries["users:currentUser"] = role ? { _id: "other", accountType: role } : null;
  const html = render("en", <AdminAgreementPanel active projectId={projectId} />);
  expect(html).toContain(en.coordinationAgreement.denied);
  expect(mocked.calls.some(name => name.startsWith("coordinationAgreements/"))).toBe(false);
});
test.each(["company", "seo_team", "admin", null])("unauthorized Client role %s never queries agreements", role => {
  mocked.queries["users:currentUser"] = role ? { _id: "other", accountType: role, onboardingStatus: "completed" } : null;
  const html = render("en", <ClientAgreementPanel projectId={projectId} conversationId="support" />);
  expect(html).toContain(en.coordinationAgreement.denied);
  expect(mocked.calls.some(name => name.startsWith("coordinationAgreements/"))).toBe(false);
});
test("both languages have identical agreement shape and every backend error is translated", () => {
  expect(Object.keys(en.coordinationAgreement)).toEqual(Object.keys(fr.coordinationAgreement));
  expect(Object.keys(en.coordinationAgreement.fields)).toEqual(Object.keys(fr.coordinationAgreement.fields));
  expect(Object.keys(en.coordinationAgreement.confirmationStatus)).toEqual(Object.keys(fr.coordinationAgreement.confirmationStatus));
  for (const code of APP_ERROR_CODES.filter(code => code.includes("COORDINATION"))) {
    expect((en.ux.error.codes as Record<string, string>)[code]).toBeTruthy(); expect((fr.ux.error.codes as Record<string, string>)[code]).toBeTruthy();
  }
});
