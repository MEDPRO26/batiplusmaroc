import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({ result: undefined as unknown }));
vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));
vi.mock("convex/react", () => ({ useQuery: () => convex.result }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/site-visits",
  getPathname: () => "/admin/site-visits",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import { AdminSiteVisitsPanel } from "./components/admin-site-visits-panel";
import { AdminShell } from "./components/admin-shell";

const visit = {
  assessmentId: "assessment-1" as Id<"siteAssessments">,
  projectId: "project-1" as Id<"projects">,
  projectTitle: "Riad renovation",
  clientName: "Sara Client",
  companyName: "Atlas Build",
  assessmentStatus: "accepted" as const,
  visitDate: "2026-09-30",
  visitTime: "10:00",
  city: "rabat" as const,
  proposedBy: "company" as const,
  status: "confirmed" as const,
  finalQuoteStatus: "not_available" as const,
  riskSignal: null,
  sortAt: Date.UTC(2026, 8, 30, 10),
};

describe("admin site visit tracking", () => {
  test("maps the localized site visit routes", () => {
    expect(routing.pathnames[routes.adminSiteVisits]).toEqual({
      fr: "/admin/visites-techniques",
      en: "/admin/site-visits",
    });
  });

  test.each([
    ["en", en, "Site visits", "Visit date/time"],
    ["fr", fr, "Visites techniques", "Date/heure de visite"],
  ] as const)(
    "renders the read-only %s tracking workspace",
    (locale, messages, heading, dateLabel) => {
      convex.result = [visit];
      const html = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="Africa/Casablanca"
        >
          <AdminShell
            email="admin@example.test"
            firstName="Ada"
            lastName="Admin"
          >
            <AdminSiteVisitsPanel />
          </AdminShell>
        </NextIntlClientProvider>,
      );
      expect(html).toContain(heading);
      expect(html).toContain(dateLabel);
      expect(html).toMatch(
        new RegExp(
          `aria-current="page"[^>]*>(?:(?!</span>)[\\s\\S])*${heading}</span>`,
        ),
      );
      expect(html).toContain("Atlas Build");
      expect(html).toContain("sm:grid-cols-2");
      expect(html).not.toContain("18 Avenue Mohammed V, Rabat");
      expect(html).not.toContain(">Confirm</button>");
      expect(html).not.toContain(">Confirmer</button>");
    },
  );
});
