import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
const session = vi.hoisted(() => ({ token: "admin-session" as string | null, role: "admin" }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => session.token }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(), usePaginatedQuery: vi.fn(), useMutation: () => vi.fn(), useConvex: () => ({ query: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null, usePathname: () => "/admin/companies" }));
import { AdminPortfolioImageQueue, portfolioReviewFingerprint, validPortfolioReason, type PortfolioImageReview } from "./components/admin-portfolio-image-review";
beforeEach(() => {
  vi.clearAllMocks(); session.token = "admin-session"; session.role = "admin";
  vi.mocked(useQuery).mockImplementation(() => ({ _id: "admin", accountType: session.role }) as never);
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: [{ imageId: "image", companyName: "Atlas", projectTitle: "Courtyard", purpose: "gallery", gallerySortOrder: 2, uploadedAt: 100, moderationStatus: "pending", isCurrentSubmission: true, isCurrentApproved: false }], status: "CanLoadMore", loadMore: vi.fn(), isLoading: false } as never);
});
function render(locale: "en" | "fr" = "en", companyId?: Id<"companies">) { return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}><AdminPortfolioImageQueue companyId={companyId} /></NextIntlClientProvider>); }
test.each(["en", "fr"] as const)("%s metadata queue includes independent slot context without private downloads", locale => {
  const html = render(locale); const text = (locale === "fr" ? fr : en).adminPortfolioImages;
  expect(html).toContain(text.queueTitle); expect(html).toContain("Atlas"); expect(html).toContain("Courtyard");
  expect(html).toContain(text.gallerySlot.replace("{number}", "3")); expect(html).toContain(text.loadMore);
  expect(html).not.toContain("<img"); expect(html).not.toContain("/portfolio-images/");
  const [ref, args, options] = vi.mocked(usePaginatedQuery).mock.calls[0];
  expect(getFunctionName(ref)).toBe("portfolioImages/index:listAdminImages"); expect(args).toEqual({ status: "pending" }); expect(options).toEqual({ initialNumItems: 20 });
  expect(vi.mocked(useQuery).mock.calls).toHaveLength(1);
});
test("Company detail scopes the same paginated queue to that Company", () => {
  render("en", "company-a" as Id<"companies">);
  expect(vi.mocked(usePaginatedQuery).mock.calls[0][1]).toEqual({ status: "pending", companyId: "company-a" });
});
test.each(["company", "client", "seo_team", "owner", "staff"])("%s cannot subscribe to private Admin review data", role => {
  session.role = role; expect(render()).toBe(""); expect(usePaginatedQuery).not.toHaveBeenCalled();
});
test("sign-out removes all review subscriptions", () => { session.token = null; expect(render()).toBe(""); expect(usePaginatedQuery).not.toHaveBeenCalled(); });
test("reject/hide reason validation follows the normalized 3–500 character rule", () => {
  for (const reason of ["", " x ", " \n\t ", "x".repeat(501)]) expect(validPortfolioReason(reason)).toBe(false);
  for (const reason of ["  a   b  ", "x".repeat(500)]) expect(validPortfolioReason(reason)).toBe(true);
});
test("review identity includes exact bytes, status, project publication, gallery order and both slot references", () => {
  const review = { image: { imageId: "a", sha256: "hash", moderationStatus: "pending" }, currentSubmissionId: "a", submitted: { imageId: "a" }, approved: null, gallerySortOrder: 0, company: { companyId: "co" }, project: { portfolioProjectId: "project", status: "draft" }, isCurrentSubmission: true, isCurrentApproved: false } as unknown as PortfolioImageReview;
  const fingerprint = portfolioReviewFingerprint(review);
  for (const change of [{ currentSubmissionId: "b" }, { submitted: { imageId: "b" } }, { isCurrentSubmission: false }, { approved: { imageId: "b" } }, { gallerySortOrder: 1 },
    { project: { ...review.project, status: "published" } }, { image: { ...review.image, sha256: "other" } }, { image: { ...review.image, moderationStatus: "approved" } }]) {
    expect(portfolioReviewFingerprint({ ...review, ...change } as PortfolioImageReview)).not.toBe(fingerprint);
  }
});
test("FR/EN review strings share all keys and placeholders", () => {
  function flatten(value: Record<string, unknown>, prefix = ""): Record<string, string[]> {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[prefix + key, item.match(/\{\w+\}/g) ?? []]] : Object.entries(flatten(item as Record<string, unknown>, prefix + key + "."))));
  }
  expect(flatten(fr.adminPortfolioImages)).toEqual(flatten(en.adminPortfolioImages));
});
