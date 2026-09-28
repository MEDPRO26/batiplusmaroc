import { expect, test } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

let listBundle = "";
let detailBundle = "";
const companyId = "company-atlas";

test.beforeAll(async () => {
  listBundle = await buildHarness(
    `import { AdminShell } from "./features/admin/components/admin-shell";
     import { AdminCompaniesPanel } from "./features/admin/components/admin-companies-panel";`,
    `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminCompaniesPanel /></AdminShell>`,
  );
  detailBundle = await buildHarness(
    `import { AdminShell } from "./features/admin/components/admin-shell";
     import { AdminCompanyDetailPanel } from "./features/admin/components/admin-company-detail-panel";`,
    `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminCompanyDetailPanel companyId="${companyId}" /></AdminShell>`,
  );
});

function state(locale: "en" | "fr") {
  const createdAt = Date.UTC(2026, 8, 20, 10);
  return {
    __locale: locale,
    __pathname: "/admin/companies",
    __queries: {
      "admin.companies.getCompanySummary": {
        companyId, name: "Atlas Build", legalName: "Atlas Build SARL", description: "Construction and renovation company.", city: "Rabat",
        serviceAreas: ["rabat"], services: ["renovation"], verificationStatus: "pending", onboardingStatus: "completed", createdAt,
        logoUrl: null, publicProfileSlug: "atlas-build", activeMemberCount: 1, membersTruncated: false,
        members: [{ userId: "user-owner", displayName: "Sara El Amrani", role: "owner", status: "active" }],
        reviewSummary: { count: 1, rating: 5 }, dealSummary: { activeCount: 1, completedCount: 0, truncated: false },
        commissionSummary: { dueCount: 1, dueAmountMad: 5000, truncated: false }, portfolio: [], portfolioHasMore: false,
      },
      "admin.verification.getCompanyVerificationReview": {
        companyId, companyName: "Atlas Build", slug: "atlas-build", city: "Rabat", description: "Construction and renovation company.",
        publicPhone: "+212612345678", legalName: "Atlas Build SARL", ice: "001234567890123", rcNumber: "RC-88",
        legalRepresentative: "Sara El Amrani", phone: "+212612345678", address: "12 avenue Hassan II, Rabat",
        submittedAt: createdAt, status: "pending", latestRejectionReason: null, documents: [], history: [],
      },
      "admin.deals.listCommissionObligations": [{
        dealId: "deal-atlas", projectId: "project-atlas", projectTitle: "Villa Atlas", companyId, companyName: "Atlas Build",
        agreedAmountMad: 100000, commissionRateBps: 500, commissionAmountMad: 5000, commissionConfigVersion: 3,
        commissionStatus: "due", createdAt, paidAt: null, paidByAdminName: null, paymentReference: null, paymentNote: null,
      }],
      "adminCompanyMessaging.getAdminConversation": null,
    },
    __paginatedQueries: {
      "admin.companies.listCompanies": { status: "Exhausted", results: [{ companyId, name: "Atlas Build", legalName: "Atlas Build SARL", city: "Rabat", verificationStatus: "pending", onboardingStatus: "completed", services: ["renovation"], activeMemberCount: 1, reviewCount: 1, rating: 5, latestActivityAt: createdAt }] },
      "admin.companies.listCompanyProjectsDeals": { status: "Exhausted", results: [{ id: "quote:one", companyId, projectId: "project-atlas", projectTitle: "Villa Atlas", projectStatus: "in_progress", source: "proposal", initialQuoteStatus: "discussion_open", invitationStatus: null, dealId: "deal-atlas", dealStatus: "active", agreedAmountMad: 100000, commissionStatus: "due", createdAt, selectedAt: createdAt, completedAt: null }] },
      "admin.companies.listCompanyReviews": { status: "Exhausted", results: [{ reviewId: "review-atlas", dealId: "deal-atlas", projectId: "project-atlas", projectTitle: "Villa Atlas", companyId, reviewerName: "Khadija Test", rating: 5, comment: "Excellent construction work and communication.", moderationStatus: "visible", createdAt, moderatedAt: null }] },
      "admin.companyActivity.listCompanyActivity": { status: "Exhausted", results: [] },
    },
    __privateMessageSentinel: "THIS PRIVATE CLIENT COMPANY MESSAGE MUST NEVER RENDER",
  };
}

for (const copy of [
  { locale: "en" as const, title: "Companies", view: "View company", overview: "Overview", verification: "Verification", projects: "Projects & Deals", commissions: "Commissions", reviews: "Reviews", activity: "Activity", messages: "Messages", internalNotes: "Internal Notes", emptyNotes: "No internal notes for this company yet.", emptyConversation: "No operational conversation with this company yet.", verificationRecord: "Verification record", commissionDue: "Due", activityEmpty: "No activity recorded for this company yet." },
  { locale: "fr" as const, title: "Entreprises", view: "Voir l’entreprise", overview: "Vue d’ensemble", verification: "Vérification", projects: "Projets et Deals", commissions: "Commissions", reviews: "Avis", activity: "Activité", messages: "Messages", internalNotes: "Notes internes", emptyNotes: "Aucune note interne pour cette entreprise pour le moment.", emptyConversation: "Aucune conversation opérationnelle avec cette entreprise pour le moment.", verificationRecord: "Dossier de vérification", commissionDue: "Due", activityEmpty: "Aucune activité enregistrée pour cette entreprise pour le moment." },
]) {
  test(`Admin Companies list is responsive in ${copy.locale}`, async ({ page }) => {
    await mountHarness(page, listBundle, state(copy.locale));
    await expect(page.getByRole("heading", { name: copy.title, exact: true })).toBeVisible();
    await expect(page.locator("h2:visible, td:visible").filter({ hasText: "Atlas Build" }).first()).toBeVisible();
    await expect(page.locator("a:visible").filter({ hasText: copy.view }).first()).toHaveAttribute("href", `/admin/companies/${companyId}`);
    await expect(page.getByText("THIS PRIVATE CLIENT COMPANY MESSAGE MUST NEVER RENDER")).toHaveCount(0);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
  });

  test(`Admin Company detail exposes each consolidated ${copy.locale} section`, async ({ page }) => {
    await mountHarness(page, detailBundle, state(copy.locale));
    await expect(page.getByRole("heading", { name: "Atlas Build", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: copy.overview })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: copy.verification }).click();
    await expect(page.getByRole("heading", { name: copy.verificationRecord })).toBeVisible();
    await page.getByRole("tab", { name: copy.projects }).click();
    await expect(page.getByText("Villa Atlas", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: copy.commissions }).click();
    await expect(page.getByRole("article").filter({ hasText: "Villa Atlas" }).getByText(copy.commissionDue, { exact: false })).toBeVisible();
    await page.getByRole("tab", { name: copy.reviews }).click();
    await expect(page.getByText("Excellent construction work and communication.")).toBeVisible();
    await page.getByRole("tab", { name: copy.activity }).click();
    await expect(page.getByText(copy.activityEmpty)).toBeVisible();
    await page.getByRole("tab", { name: copy.messages }).click();
    await expect(page.getByText(copy.emptyConversation)).toBeVisible();
    await page.getByRole("tab", { name: copy.internalNotes }).click();
    await expect(page.getByText(copy.emptyNotes)).toBeVisible();
    await page.getByRole("tab", { name: copy.messages }).press("Home");
    await expect(page.getByRole("tab", { name: copy.overview })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: copy.overview }).press("End");
    await expect(page.getByRole("tab", { name: copy.internalNotes })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("THIS PRIVATE CLIENT COMPANY MESSAGE MUST NEVER RENDER")).toHaveCount(0);

    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
  });
}
