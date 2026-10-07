import { expect, test } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

let bundle = "";
const reviewPath = "admin.verification.getCompanyVerificationReview";
const companyId = "company-atlas";
const downloadUrl = "https://verification-test.convex.site/company-verification/documents/tax-atlas";
test.beforeAll(async () => {
  bundle = await buildHarness(`import { AdminCompanyVerification } from "./features/admin/components/admin-company-verification";`, `<AdminCompanyVerification companyId="${companyId}" companyName="Atlas Build" />`);
});
function state(locale: "en" | "fr" = "en", status = "pending", tax = true) {
  return { __locale: locale, __authToken: "private-admin-session", __queries: { [reviewPath]: {
    companyId, companyName: "Atlas Build", city: "Rabat", legalName: "Atlas Build SARL", ice: "001234567890123", rcNumber: "88", legalRepresentative: "Sara", phone: "+212612345678", address: "12 avenue Hassan II, Rabat", status, submittedAt: status === "draft" ? null : Date.UTC(2026, 8, 20), latestRejectionReason: "Replace the expired certificate",
    documents: tax ? [{ documentId: "tax-atlas", documentType: "tax_compliance", fileName: "tax-certificate.pdf", uploadedAt: Date.UTC(2026, 8, 19), downloadUrl }] : [],
    history: [{ historyId: "audit", action: "verification_submitted", oldStatus: "draft", newStatus: "pending", changedAt: Date.UTC(2026, 8, 20), changedBy: { firstName: "Sara", lastName: "Owner", email: "owner@example.test" }, rejectionReason: null }],
  } } };
}
for (const copy of [
  { locale: "en" as const, required: "Required document", optional: "Optional documents", tax: "Tax Compliance Certificate", approve: "Approve", reject: "Reject", confirmApprove: "Confirm approval", confirmReject: "Confirm rejection", cancel: "Cancel", reason: "Rejection reason", view: "View document", approved: "Company verification approved.", rejected: "Company verification rejected." },
  { locale: "fr" as const, required: "Document obligatoire", optional: "Documents facultatifs", tax: "Attestation de régularité fiscale", approve: "Approuver", reject: "Refuser", confirmApprove: "Confirmer l’approbation", confirmReject: "Confirmer le refus", cancel: "Annuler", reason: "Motif du refus", view: "Voir le document", approved: "Vérification de l’entreprise approuvée.", rejected: "Vérification de l’entreprise refusée." },
]) {
  test(`${copy.locale}: required certificate, audit and all four states fit mobile and tablet`, async ({ page }) => {
    for (const status of ["draft", "pending", "rejected", "verified"]) {
      await mountHarness(page, bundle, state(copy.locale, status));
      await expect(page.getByRole("heading", { name: copy.required, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: copy.optional, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: copy.tax, exact: true })).toBeVisible();
      await expect(page.getByText("Sara Owner", { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: copy.approve, exact: true })).toHaveCount(status === "pending" ? 1 : 0);
      await expect(page.getByRole("button", { name: copy.reject, exact: true })).toHaveCount(status === "pending" ? 1 : 0);
      await expect(page.getByText("Replace the expired certificate", { exact: true })).toHaveCount(status === "rejected" ? 1 : 0);
      expect(await page.locator('a[href*="convex.site"]').count()).toBe(0);
      for (const width of [1440, 1024, 768, 375, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await hasHorizontalOverflow(page)).toBe(false); }
    }
  });
  test(`${copy.locale}: approval requires confirmation; cancellation restores focus`, async ({ page }) => {
    await mountHarness(page, bundle, state(copy.locale));
    const approve = page.getByRole("button", { name: copy.approve, exact: true });
    await approve.click();
    const dialog = page.getByRole("dialog", { name: copy.confirmApprove });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __mutationCalls?: unknown[] }).__mutationCalls ?? [])).toHaveLength(0);
    await dialog.getByRole("button", { name: copy.cancel }).click(); await expect(approve).toBeFocused();
    await approve.click(); await page.setViewportSize({ width: 320, height: 568 }); expect(await hasHorizontalOverflow(page)).toBe(false);
    await page.getByRole("dialog").getByRole("button", { name: copy.confirmApprove }).click();
    await expect(page.getByRole("status")).toHaveText(copy.approved);
    const calls = await page.evaluate(() => (window as unknown as { __mutationCalls: unknown[] }).__mutationCalls);
    expect(calls).toEqual([{ path: "admin.verification.approveCompanyVerification", args: { companyId } }]);
    await page.evaluate(path => { const w = window as unknown as { __queries: Record<string, { status: string }> }; w.__queries[path].status = "verified"; window.dispatchEvent(new Event("convex-harness-update")); }, reviewPath);
    await expect(approve).toHaveCount(0); await expect(page.getByRole("dialog")).toHaveCount(0);
  });
  test(`${copy.locale}: rejection needs a nonempty reason and an explicit confirmation`, async ({ page }) => {
    await mountHarness(page, bundle, state(copy.locale));
    await page.getByRole("button", { name: copy.reject, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: copy.confirmReject });
    const confirm = dialog.getByRole("button", { name: copy.confirmReject });
    await expect(confirm).toBeDisabled(); await dialog.getByLabel(copy.reason, { exact: true }).fill("   "); await expect(confirm).toBeDisabled();
    await dialog.getByLabel(copy.reason, { exact: true }).fill("Replace expired certificate"); await expect(confirm).toBeEnabled();
    for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true); }
    await confirm.click(); await expect(page.getByRole("status")).toHaveText(copy.rejected);
    expect(await page.evaluate(() => (window as unknown as { __mutationCalls: unknown[] }).__mutationCalls)).toEqual([{ path: "admin.verification.rejectCompanyVerification", args: { companyId, reason: "Replace expired certificate" } }]);
    await page.evaluate(path => { const w = window as unknown as { __queries: Record<string, { status: string }> }; w.__queries[path].status = "rejected"; window.dispatchEvent(new Event("convex-harness-update")); }, reviewPath);
    await expect(page.getByRole("button", { name: copy.reject, exact: true })).toHaveCount(0);
  });
}

test("missing required certificate blocks approval and failed decisions remain recoverable", async ({ page }) => {
  await mountHarness(page, bundle, state("en", "pending", false));
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("required document is missing");
  await mountHarness(page, bundle, { ...state(), __mutationErrors: { "admin.verification.approveCompanyVerification": "private storage detail" } });
  await page.getByRole("button", { name: "Approve", exact: true }).click(); await page.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("The verification action could not be completed.");
  await expect(page.getByText("private storage detail")).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeFocused();
});

test("Admin document review fetches directly from Convex with a bearer header and no token in the URL", async ({ page, baseURL }) => {
  const allowedOrigin = new URL(baseURL!).origin;
  let requestUrl = ""; let authorization: string | undefined;
  await page.route(downloadUrl, async route => {
    requestUrl = route.request().url(); authorization = route.request().headers().authorization;
    expect(route.request().headers().origin).toBe(allowedOrigin);
    await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.7 private certificate", headers: { "Access-Control-Allow-Origin": allowedOrigin, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  });
  await mountHarness(page, bundle, state());
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "View document" }).click();
  expect((await download).suggestedFilename()).toBe("tax-certificate.pdf");
  expect(requestUrl).toBe(downloadUrl); expect(authorization).toBe("Bearer private-admin-session"); expect(new URL(requestUrl).search).toBe("");
  await page.unroute(downloadUrl);
  await page.route(downloadUrl, route => route.fulfill({ status: 404, body: "Not found", headers: { "Access-Control-Allow-Origin": allowedOrigin } }));
  await page.getByRole("button", { name: "View document" }).click(); await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
});

test("a concurrent status change closes an open decision dialog", async ({ page }) => {
  await mountHarness(page, bundle, state()); await page.getByRole("button", { name: "Approve", exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(path => { const w = window as unknown as { __queries: Record<string, { status: string }> }; w.__queries[path].status = "rejected"; window.dispatchEvent(new Event("convex-harness-update")); }, reviewPath);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __mutationCalls?: unknown[] }).__mutationCalls ?? [])).toHaveLength(0);
});
