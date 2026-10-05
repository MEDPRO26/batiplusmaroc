import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
const session = vi.hoisted(() => ({ token: "admin-session" as string | null, role: "admin" }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => session.token }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(), usePaginatedQuery: vi.fn(), useMutation: () => vi.fn(), useConvex: () => ({ query: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null, usePathname: () => "/admin/companies" }));
import { AdminPendingLogoQueue, logoReviewFingerprint, validLogoReason, type LogoReview } from "./components/admin-company-logo-review";
beforeEach(() => {
  vi.clearAllMocks(); session.token = "admin-session"; session.role = "admin";
  vi.mocked(useQuery).mockImplementation(() => ({ _id: "admin", accountType: session.role }) as never);
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: [{ imageId: "image", companyName: "Atlas", uploadedAt: 100, isCurrentSubmission: true }], status: "CanLoadMore", loadMore: vi.fn(), isLoading: false } as never);
});
function render(locale: "en" | "fr" = "en") { return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}><AdminPendingLogoQueue /></NextIntlClientProvider>); }
test.each(["en", "fr"] as const)("%s queue is metadata-only and paginated", locale => {
  const html = render(locale); const text = (locale === "fr" ? fr : en).adminCompanyLogos;
  expect(html).toContain(text.queueTitle); expect(html).toContain("Atlas"); expect(html).toContain(text.loadMore);
  expect(html).not.toContain("<img"); expect(html).not.toContain("/company-logos/");
  const [ref, args, options] = vi.mocked(usePaginatedQuery).mock.calls[0];
  expect(getFunctionName(ref)).toBe("companyLogos/index:listAdminLogos"); expect(args).toEqual({ status: "pending" }); expect(options).toEqual({ initialNumItems: 20 });
});
test.each(["company", "client", "seo_team", "owner"])("%s cannot subscribe to Admin review data", role => {
  session.role = role; expect(render()).toBe(""); expect(usePaginatedQuery).not.toHaveBeenCalled();
});
test("sign-out immediately removes the review scope", () => { session.token = null; expect(render()).toBe(""); expect(usePaginatedQuery).not.toHaveBeenCalled(); });
test("reject/hide reasons use the backend's normalized 3–500 character rule", () => {
  for (const value of ["", " x ", " \n\t ", "x".repeat(501)]) expect(validLogoReason(value)).toBe(false);
  for (const value of ["  a   b  ", "x".repeat(500)]) expect(validLogoReason(value)).toBe(true);
});
test("review identity changes with file, status or either Company pointer", () => {
  const review = { image: { imageId: "a", sha256: "hash", moderationStatus: "pending" }, currentSubmissionId: "a", approved: null, company: { companyId: "co" }, isCurrentSubmission: true, isCurrentApproved: false } as unknown as LogoReview;
  const fingerprint = logoReviewFingerprint(review);
  for (const change of [{ currentSubmissionId: "b" }, { isCurrentSubmission: false }, { approved: { imageId: "b" } },
    { image: { ...review.image, sha256: "other" } }, { image: { ...review.image, moderationStatus: "approved" } }]) {
    expect(logoReviewFingerprint({ ...review, ...change } as LogoReview)).not.toBe(fingerprint);
  }
});
test("FR/EN review strings have identical keys and placeholders", () => {
  function flatten(value: Record<string, unknown>, prefix = ""): Record<string, string[]> {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[prefix + key, item.match(/\{\w+\}/g) ?? []]] : Object.entries(flatten(item as Record<string, unknown>, prefix + key + "."))));
  }
  expect(flatten(fr.adminCompanyLogos)).toEqual(flatten(en.adminCompanyLogos));
});
