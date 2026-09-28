import { expect, test } from "@playwright/test";
import {
  buildHarness,
  hasHorizontalOverflow,
  mountHarness,
} from "./support/component-harness";

let bundle = "";

test.beforeAll(async () => {
  bundle = await buildHarness(
    `import { AdminShell } from "./features/admin/components/admin-shell";
     import { AdminVerificationPanel } from "./features/admin/components/admin-verification-panel";`,
    `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin">
       <AdminVerificationPanel />
     </AdminShell>`,
  );
});

function state(locale: "en" | "fr") {
  const companyId = "company-atlas";
  const emptyContext = {
    amountMad: null,
    commissionAmountMad: null,
    commissionRateBps: null,
    currency: null,
    rating: null,
    revisionNumber: null,
    proposedDate: null,
    proposedTime: null,
    timezone: null,
    scheduledEpoch: null,
  };
  return {
    __locale: locale,
    __queries: {
      "admin.verification.listCompanyVerifications": [{
        companyId,
        companyName: "Atlas Build",
        city: "Rabat",
        ice: "001234567890123",
        rcNumber: "RC-88",
        legalRepresentative: "Sara El Amrani",
        submittedAt: Date.UTC(2026, 8, 25),
        documentCount: 0,
        status: "verified",
      }],
      "admin.verification.getCompanyVerificationReview": {
        companyId,
        companyName: "Atlas Build",
        slug: "atlas-build",
        city: "Rabat",
        description: "Construction and renovation company.",
        publicPhone: "+212612345678",
        legalName: "Atlas Build SARL",
        ice: "001234567890123",
        rcNumber: "RC-88",
        legalRepresentative: "Sara El Amrani",
        phone: "+212612345678",
        address: "12 avenue Hassan II, Rabat",
        submittedAt: Date.UTC(2026, 8, 25),
        status: "verified",
        latestRejectionReason: null,
        documents: [],
        history: [],
      },
    },
    __paginatedQueries: {
      "admin.companyActivity.listCompanyActivity": {
        status: "CanLoadMore",
        results: [
          {
            id: "activity:commission",
            source: "marketplace_activity",
            eventType: "commission_paid",
            category: "deals",
            companyId,
            project: { projectId: "project-atlas", title: "Villa Atlas", status: "completed" },
            entity: { type: "deal", id: "deal-atlas" },
            actor: { type: "admin", displayName: "Ada Admin" },
            occurredAt: Date.UTC(2026, 8, 28, 12),
            oldStatus: "due",
            newStatus: "paid",
            context: { ...emptyContext, commissionAmountMad: 12_000, commissionRateBps: 500, currency: "MAD" },
          },
          {
            id: "verification:submitted",
            source: "verification_history",
            eventType: "verification_submitted",
            category: "verification",
            companyId,
            project: null,
            entity: { type: "company_verification", id: companyId },
            actor: { type: "company", displayName: "Sara El Amrani" },
            occurredAt: Date.UTC(2026, 8, 25, 10),
            oldStatus: "draft",
            newStatus: "pending",
            context: emptyContext,
          },
        ],
      },
    },
    __privateMessageSentinel: "THIS PRIVATE MESSAGE MUST NEVER RENDER",
  };
}

for (const copy of [
  {
    locale: "en" as const,
    review: "Review",
    activity: "Company activity",
    commission: "Commission paid",
    submitted: "Verification submitted",
    loadMore: "Load more activity",
  },
  {
    locale: "fr" as const,
    review: "Examiner",
    activity: "Activité de l’entreprise",
    commission: "Commission payée",
    submitted: "Vérification soumise",
    loadMore: "Charger plus d’activité",
  },
]) {
  test(`Admin selects a Company and sees the bounded ${copy.locale} timeline`, async ({ page }) => {
    await mountHarness(page, bundle, state(copy.locale));
    await page.getByRole("button", { name: copy.review, exact: true }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { name: "Atlas Build" })).toBeVisible();
    await expect(drawer.getByRole("heading", { name: copy.activity })).toBeVisible();
    await expect(drawer.getByText(copy.commission, { exact: true })).toBeVisible();
    await expect(drawer.getByText(copy.submitted, { exact: true })).toBeVisible();
    await expect(drawer.getByText("Villa Atlas", { exact: false })).toBeVisible();
    await expect(drawer.getByText("THIS PRIVATE MESSAGE MUST NEVER RENDER")).toHaveCount(0);
    await expect(drawer.getByRole("link")).toHaveAttribute("href", "/admin/deals");
    await drawer.getByRole("button", { name: copy.loadMore }).click();
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { __paginationCalls?: Array<{ path: string; numItems: number }> }
    ).__paginationCalls)).toEqual([{
      path: "admin.companyActivity.listCompanyActivity",
      numItems: 20,
    }]);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(drawer).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
  });
}
