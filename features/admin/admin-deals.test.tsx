import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({ result: [] as unknown[] }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("convex/react", () => ({ useQuery: () => convex.result, useMutation: () => vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/admin/deals",
  getPathname: () => "/admin/deals",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import { AdminDealsPanel } from "./components/admin-deals-panel";
import { AdminShell } from "./components/admin-shell";

function render(locale: "en" | "fr") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca"><AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminDealsPanel /></AdminShell></NextIntlClientProvider>);
}

describe("admin Deal commission tracking", () => {
  beforeEach(() => { convex.result = []; });

  test.each([["en", "Deals &amp; commissions", "Search project or company"], ["fr", "Transactions et commissions", "Rechercher un projet ou une entreprise"]] as const)("renders the localized %s queue", (locale, title, search) => {
    const html = render(locale);
    expect(html).toContain(title);
    expect(html).toContain(search);
    expect(html).toContain("admin@example.test");
  });

  test("renders immutable commission snapshot values and due status", () => {
    convex.result = [{ dealId: "deal-1", projectId: "project-1", projectTitle: "Villa Rabat", companyId: "company-1", companyName: "Atlas Build", agreedAmountMad: 395000, commissionRateBps: 500, commissionAmountMad: 19750, commissionConfigVersion: 3, commissionStatus: "due", createdAt: 1790000000000, paidAt: null, paidByAdminName: null, paymentReference: null, paymentNote: null }];
    const html = render("en");
    expect(html).toContain("Villa Rabat");
    expect(html).toContain("Atlas Build");
    expect(html).toContain("19,750");
    expect(html).toContain("5%");
    expect(html).toContain("Due");
  });
});
