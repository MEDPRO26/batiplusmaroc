import { expect, test } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

let adminBundle = "";
let companyBundle = "";
let publicBundle = "";
const companyId = "company-atlas";
const fixedAt = Date.UTC(2026, 8, 28, 16, 40);
const sentinel = "INTERNAL-ONLY-SENTINEL-123";

test.beforeAll(async () => {
  adminBundle = await buildHarness(
    `import { AdminShell } from "./features/admin/components/admin-shell";
     import { AdminCompanyDetailPanel } from "./features/admin/components/admin-company-detail-panel";`,
    `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminCompanyDetailPanel companyId="${companyId}" initialTab="internalNotes" /></AdminShell>`,
  );
  companyBundle = await buildHarness(
    `import { CompanyOperationalMessaging } from "./features/operations/components/company-operational-messaging";`,
    `<CompanyOperationalMessaging />`,
  );
  publicBundle = await buildHarness(
    `import { CompanyDirectory } from "./features/companies/components/company-directory";`,
    `<CompanyDirectory />`,
  );
});

function summary() {
  return {
    companyId,
    name: "Atlas Build",
    legalName: "Atlas Build SARL",
    description: "Construction and renovation company.",
    city: "Rabat",
    serviceAreas: ["rabat"],
    services: ["renovation"],
    verificationStatus: "verified",
    onboardingStatus: "completed",
    createdAt: fixedAt,
    logoUrl: null,
    publicProfileSlug: "atlas-build",
    activeMemberCount: 2,
    membersTruncated: false,
    members: [],
    reviewSummary: { count: 0, rating: null },
    dealSummary: { activeCount: 0, completedCount: 0, truncated: false },
    commissionSummary: { dueCount: 0, dueAmountMad: 0, truncated: false },
    portfolio: [],
    portfolioHasMore: false,
  };
}

function adminState(locale: "en" | "fr", notes: Array<Record<string, unknown>> = [], status = "Exhausted") {
  return {
    __locale: locale,
    __pathname: "/admin/companies/company-atlas",
    __queries: {
      "admin.companies.getCompanySummary": summary(),
      "adminCompanyMessaging.getAdminConversation": null,
    },
    __paginatedQueries: {
      "admin.companyNotes.listCompanyAdminNotes": { status, results: notes },
    },
    __mutationCalls: [],
  };
}

test("Admin EN adds an immutable note, retains failures, paginates, and receives realtime notes", async ({ page }) => {
  await mountHarness(page, adminBundle, adminState("en", [{
    id: "note-current",
    body: "Current private context",
    authorDisplayName: "Ada Admin",
    createdAt: fixedAt,
  }], "CanLoadMore"));
  await expect(page.getByRole("tab", { name: "Internal Notes" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Visible only to Batiplus administrators.")).toBeVisible();
  await expect(page.getByText("Current private context")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  const textarea = page.getByRole("textbox", { name: "Note", exact: true });
  const add = page.getByRole("button", { name: "Add note" });
  await textarea.fill("   ");
  await expect(add).toBeDisabled();
  await expect(textarea).toHaveAttribute("maxlength", "5000");

  const failedDraft = "Requested updated RC document before final verification.";
  await textarea.fill(failedDraft);
  await page.evaluate(() => {
    (window as typeof window & { __mutationErrors: Record<string, string> }).__mutationErrors = {
      "admin.companyNotes.createCompanyAdminNote": "private backend detail",
    };
  });
  await add.click();
  await expect(page.getByRole("alert")).toContainText("Your text is still here");
  await expect(textarea).toHaveValue(failedDraft);
  await expect(page.getByText("private backend detail")).toHaveCount(0);

  await page.evaluate(({ fixedAt }) => {
    const target = window as typeof window & {
      __mutationErrors?: Record<string, string>;
      __mutationHandlers: Record<string, (args: { body: string }) => Promise<unknown>>;
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    delete target.__mutationErrors;
    target.__mutationHandlers = {
      "admin.companyNotes.createCompanyAdminNote": async ({ body }) => {
        const current = target.__paginatedQueries["admin.companyNotes.listCompanyAdminNotes"];
        target.__paginatedQueries["admin.companyNotes.listCompanyAdminNotes"] = {
          ...current,
          results: [{ id: "note-new", body, authorDisplayName: "Ada Admin", createdAt: fixedAt + 1 }, ...current.results],
        };
        window.dispatchEvent(new Event("convex-harness-update"));
        return {};
      },
    };
  }, { fixedAt });
  await add.click();
  await expect(page.getByText(failedDraft)).toBeVisible();
  await expect(textarea).toHaveValue("");

  await page.evaluate(({ fixedAt }) => {
    const target = window as typeof window & {
      __paginationHandlers: Record<string, () => void>;
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    target.__paginationHandlers = {
      "admin.companyNotes.listCompanyAdminNotes": () => {
        const current = target.__paginatedQueries["admin.companyNotes.listCompanyAdminNotes"];
        target.__paginatedQueries["admin.companyNotes.listCompanyAdminNotes"] = {
          status: "Exhausted",
          results: [...current.results, current.results[0], { id: "note-old", body: "Older note", authorDisplayName: "Yassin Admin", createdAt: fixedAt - 1 }],
        };
        window.dispatchEvent(new Event("convex-harness-update"));
      },
    };
  }, { fixedAt });
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator("[data-admin-note]")).toHaveCount(3);
  await expect(page.getByText("Older note")).toBeVisible();

  await page.evaluate(({ fixedAt }) => {
    const target = window as typeof window & {
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    const current = target.__paginatedQueries["admin.companyNotes.listCompanyAdminNotes"];
    target.__paginatedQueries["admin.companyNotes.listCompanyAdminNotes"] = {
      ...current,
      results: [{ id: "note-admin-b", body: "Admin B realtime note", authorDisplayName: "Yassin Admin", createdAt: fixedAt + 2 }, ...current.results],
    };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { fixedAt });
  await expect(page.getByText("Admin B realtime note")).toBeVisible();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await expect(textarea).toBeVisible();
    await expect(page.getByRole("button", { name: "Add note" })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  }
});

test("Admin FR completes the localized add-note flow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mountHarness(page, adminBundle, adminState("fr"));
  await expect(page.getByRole("tab", { name: "Notes internes" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Visibles uniquement par les administrateurs Batiplus.")).toBeVisible();
  const textarea = page.getByRole("textbox", { name: "Note", exact: true });
  await page.evaluate(({ fixedAt }) => {
    const target = window as typeof window & {
      __mutationHandlers: Record<string, (args: { body: string }) => Promise<unknown>>;
      __paginatedQueries: Record<string, { status: string; results: Array<Record<string, unknown>> }>;
    };
    target.__mutationHandlers = {
      "admin.companyNotes.createCompanyAdminNote": async ({ body }) => {
        target.__paginatedQueries["admin.companyNotes.listCompanyAdminNotes"] = {
          status: "Exhausted",
          results: [{ id: "note-fr", body, authorDisplayName: "Ada Admin", createdAt: fixedAt }],
        };
        window.dispatchEvent(new Event("convex-harness-update"));
        return {};
      },
    };
  }, { fixedAt });
  await textarea.fill("Document RC mis à jour demandé.");
  await page.getByRole("button", { name: "Ajouter une note" }).click();
  await expect(page.getByText("Document RC mis à jour demandé.")).toBeVisible();
  await expect(textarea).toHaveValue("");
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test("internal-note sentinel is absent from Company operations and the public Company profile", async ({ page }) => {
  await mountHarness(page, companyBundle, {
    __locale: "en",
    __pathname: "/company/batiplus",
    __queries: {
      "users.currentUser": { accountType: "company", onboardingStatus: "completed" },
      "adminCompanyMessaging.getMyConversation": null,
    },
    __paginatedQueries: {},
    __internalAdminNoteSentinel: sentinel,
  });
  await expect(page.getByRole("heading", { name: "Batiplus support", exact: true }).first()).toBeVisible();
  await expect(page.getByText(sentinel)).toHaveCount(0);

  await mountHarness(page, publicBundle, {
    __locale: "en",
    __pathname: "/companies",
    __queries: {
      "portfolio.index.getPublicCompanyProfile": {
        id: companyId, slug: "atlas-build", name: "Atlas Build", logoUrl: null,
        coverImageUrl: null, isVerified: true, city: "Rabat", description: "Public company description",
        services: ["renovation"], serviceAreas: ["rabat"], yearsExperience: 8,
        foundedYear: 2018, companySize: "2to10", languages: ["french"], website: null,
        portfolio: [], rating: null, reviewCount: 0, reviews: [],
      },
    },
    __paginatedQueries: {
      "companies.directory.listPublicCompanies": {
        status: "Exhausted",
        results: [{ id: companyId, slug: "atlas-build", name: "Atlas Build", logoUrl: null, isVerified: true, city: "Rabat", description: "Public company description", services: ["renovation"], yearsExperience: 8, rating: null, reviewCount: 0, portfolio: [], createdAt: fixedAt }],
      },
    },
    __internalAdminNoteSentinel: sentinel,
  });
  await page.getByRole("button", { name: "View profile" }).click();
  await expect(page.getByRole("dialog")).toContainText("Public company description");
  await expect(page.getByText(sentinel)).toHaveCount(0);
});
