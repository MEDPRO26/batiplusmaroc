import { expect, test, type Page } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

type Status = "draft" | "pending" | "rejected" | "verified";
let bundle = "";
const site = "https://verification-test.convex.site";
const tax = { documentId: "tax-document", documentType: "tax_compliance", fileName: "current-certificate.pdf" };
const verification = { legalName: "Atlas SARL", ice: "001234567890123", rcNumber: "RC123", legalRepresentative: "Sara El Amrani", phone: "0612345678", address: "12 avenue Hassan II, Agadir", submittedAt: null, rejectionReason: "Replace the expired certificate", documents: [] };
function state(locale: "en" | "fr", status: Status, documents: typeof tax[] = [], owner = true) {
  return { __locale: locale, __authToken: "owner-convex-session", __pathname: "/espace-entreprise/verification", __queries: {
    "users.currentUser": { accountType: "company", onboardingStatus: "completed" },
    "companyVerification.index.getVerificationStatus": { status, canManageDocuments: owner },
    "companyVerification.index.getVerificationForm": { ...verification, status, documents },
    "companyVerification.index.getDocumentDownloadUrl": `${site}/company-verification/documents/tax-document`,
  }, __mutationResults: { "companyVerification.index.generateDocumentUploadUrl": { uploadUrl: `${site}/company-verification/upload`, uploadToken: "bound-upload-token" }, "companyVerification.index.submitVerification": { status: "pending" } } };
}
async function interceptUpload(page: Page, ok = true) {
  await page.route(`${site}/company-verification/upload`, async route => {
    const request = route.request();
    expect(request.headers().authorization).toBe("Bearer owner-convex-session");
    expect(request.headers()["x-upload-token"]).toBe("bound-upload-token");
    expect(request.url()).not.toContain("owner-convex-session");
    await route.fulfill({ status: ok ? 200 : 400, contentType: "application/json", body: JSON.stringify(ok ? { storageId: "bound-storage" } : {}) });
  });
}
async function selectTax(page: Page, locale: "en" | "fr") {
  const t = (locale === "en" ? en : fr).auth.companyVerification;
  await page.getByLabel(t.chooseDocument.replace("{document}", t.documents.tax_compliance), { exact: true }).setInputFiles({ name: "new-certificate.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 test") });
}
test.beforeAll(async () => {
  bundle = await buildHarness(`import { CompanyVerificationForm } from "./features/companies/components/company-verification-form";`, `<CompanyVerificationForm />`);
});

for (const locale of ["en", "fr"] as const) {
  const t = (locale === "en" ? en : fr).auth.companyVerification;
  test(`${locale}: draft uploads directly and enables submit only after upload`, async ({ page }) => {
    await mountHarness(page, bundle, state(locale, "draft"));
    const submit = page.getByRole("button", { name: t.submit, exact: true });
    await expect(submit).toBeDisabled();
    await interceptUpload(page); await selectTax(page, locale);
    await expect(page.getByText("new-certificate.pdf", { exact: true })).toBeVisible();
    await expect(submit).toBeEnabled(); await expect(page.getByRole("button", { name: t.viewDocument })).toBeVisible();
    await submit.click(); await expect(page.getByRole("heading", { name: t.pending.title })).toBeVisible();
    const calls = await page.evaluate(() => (window as unknown as { __mutationCalls: Array<{ path: string; args: Record<string, unknown> }> }).__mutationCalls);
    expect(calls.find(call => call.path.endsWith("submitVerification"))?.args.documents).toEqual([{ documentType: "tax_compliance", storageId: "bound-storage", uploadToken: "bound-upload-token", fileName: "new-certificate.pdf" }]);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
  test(`${locale}: pending is locked`, async ({ page }) => {
    await mountHarness(page, bundle, state(locale, "pending", [tax]));
    await expect(page.getByRole("heading", { name: t.pending.title })).toBeVisible();
    await expect(page.getByText(t.pending.noAction)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0); await expect(page.getByText(tax.fileName)).toHaveCount(0);
  });
  test(`${locale}: rejected owner views current file, replaces and resubmits`, async ({ page }) => {
    await mountHarness(page, bundle, state(locale, "rejected", [tax]));
    await expect(page.getByText(verification.rejectionReason)).toBeVisible();
    await expect(page.getByRole("button", { name: t.resubmit })).toBeEnabled();
    await page.route(`${site}/company-verification/documents/tax-document`, async route => {
      expect(route.request().headers().authorization).toBe("Bearer owner-convex-session");
      await route.fulfill({ contentType: "application/pdf", body: "%PDF-1.7 own file" });
    });
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: t.viewDocument }).click(); expect((await download).suggestedFilename()).toBe(tax.fileName);
    await interceptUpload(page);
    await page.getByLabel(t.replaceDocument.replace("{document}", t.documents.tax_compliance), { exact: true }).setInputFiles({ name: "replacement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 replacement") });
    await expect(page.getByRole("button", { name: t.resubmit })).toBeEnabled();
    await page.getByRole("button", { name: t.resubmit }).click(); await expect(page.getByRole("heading", { name: t.pending.title })).toBeVisible();
  });
  test(`${locale}: verified success and staff status have no document controls`, async ({ page }) => {
    await mountHarness(page, bundle, state(locale, "verified", [tax]));
    await expect(page.getByRole("heading", { name: t.verified.title })).toBeVisible(); await expect(page.getByText(t.verified.lead)).toBeVisible(); await expect(page.getByText(t.verified.badge, { exact: true })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await mountHarness(page, bundle, state(locale, "rejected", [tax], false));
    await expect(page.getByText(t.staffLead)).toBeVisible(); await expect(page.getByText(tax.fileName)).toHaveCount(0); await expect(page.getByText(verification.rejectionReason)).toHaveCount(0); await expect(page.locator('input[type="file"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __queryCalls: string[] }).__queryCalls)).not.toContain("companyVerification.index.getVerificationForm");
  });
  for (const status of ["draft", "pending", "rejected", "verified"] as const) {
    test(`${locale}: ${status} has no mobile overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 780 });
      await mountHarness(page, bundle, state(locale, status, status === "draft" ? [] : [{ ...tax, fileName: "certificate-" + "x".repeat(140) + ".pdf" }]));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }
}
test("failed or invalid uploads keep submit disabled and offer recovery", async ({ page }) => {
  await mountHarness(page, bundle, state("en", "draft")); await interceptUpload(page, false); await selectTax(page, "en");
  await expect(page.getByRole("button", { name: en.auth.companyVerification.submit })).toBeDisabled();
  await page.getByRole("button", { name: en.auth.companyVerification.removeFile }).click();
  await expect(page.getByText("new-certificate.pdf")).toHaveCount(0);
  await page.getByLabel("Choose file for Tax Compliance Certificate", { exact: true }).setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
  await expect(page.getByText(en.auth.companyVerification.validation.document)).toBeVisible(); await expect(page.getByRole("button", { name: en.auth.companyVerification.submit })).toBeDisabled();
});

test("a live Admin rejection resets claimed upload tokens and allows keeping current files", async ({ page }) => {
  await mountHarness(page, bundle, state("en", "draft")); await interceptUpload(page); await selectTax(page, "en");
  await page.getByRole("button", { name: en.auth.companyVerification.submit, exact: true }).click();
  await expect(page.getByRole("heading", { name: en.auth.companyVerification.pending.title })).toBeVisible();
  for (const status of ["pending", "rejected"] as const) {
    await page.evaluate(({ status, document }) => {
      const target = window as unknown as { __queries: Record<string, Record<string, unknown>> };
      target.__queries["companyVerification.index.getVerificationStatus"] = { status, canManageDocuments: true };
      target.__queries["companyVerification.index.getVerificationForm"] = { ...target.__queries["companyVerification.index.getVerificationForm"], status, submittedAt: 200, documents: [document] };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, { status, document: tax });
    await expect(page.getByRole("heading", { name: status === "pending" ? en.auth.companyVerification.pending.title : en.auth.companyVerification.rejected.title })).toBeVisible();
  }
  await page.getByRole("button", { name: en.auth.companyVerification.resubmit, exact: true }).click();
  const documents = await page.evaluate(() => {
    const calls = (window as unknown as { __mutationCalls: Array<{ path: string; args: { documents?: unknown[] } }> }).__mutationCalls;
    return calls.filter(call => call.path.endsWith("submitVerification")).at(-1)?.args.documents;
  });
  expect(documents).toEqual([]);
});
