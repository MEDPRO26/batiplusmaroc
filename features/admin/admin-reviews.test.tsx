import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("convex/react", () => ({ useQuery: () => convex.rows, useMutation: () => vi.fn() }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/admin/reviews",
  getPathname: () => "/admin/reviews",
}));

import { AdminReviewsPanel } from "./components/admin-reviews-panel";
import { AdminShell } from "./components/admin-shell";

function render(locale: "en" | "fr") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca"><AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminReviewsPanel /></AdminShell></NextIntlClientProvider>);
}

describe("Admin review moderation", () => {
  beforeEach(() => { convex.rows = [{ reviewId: "review-1", dealId: "deal-1", projectId: "project-1", projectTitle: "Villa Atlas", companyId: "company-1", companyName: "Atlas Build", clientName: "Samira B", rating: 5, comment: "Excellent construction work and communication.", moderationStatus: "visible", createdAt: 1_790_000_000_000, moderatedAt: null }]; });

  test("maps and activates the localized review route", () => {
    expect(routing.pathnames[routes.adminReviews]).toEqual({ fr: "/admin/avis", en: "/admin/reviews" });
    expect(render("en")).toMatch(/aria-current="page"[^>]*>(?:(?!<\/span>)[\s\S])*Reviews<\/span>/);
  });

  test.each([["en", "Review client feedback", "Hide review"], ["fr", "Consultez les retours clients", "Masquer l’avis"]] as const)("renders immutable moderation controls in %s", (locale, lead, action) => {
    const html = render(locale);
    expect(html).toContain(lead);
    expect(html).toContain("Atlas Build");
    expect(html).toContain("Villa Atlas");
    expect(html).toContain("Excellent construction work and communication.");
    expect(html).toContain(action);
    expect(html).not.toMatch(/Edit review|Modifier l’avis/);
  });

  test("renders restore for a hidden review", () => {
    convex.rows = [{ ...(convex.rows[0] as Record<string, unknown>), moderationStatus: "hidden" }];
    expect(render("en")).toContain("Restore review");
  });
});
