import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({ result: [] as unknown }));
vi.mock("convex/react", () => ({ useQuery: () => convex.result }));

import { CompanyCommissions } from "./components/company-commissions";

function render(locale: "en" | "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      <CompanyCommissions />
    </NextIntlClientProvider>,
  );
}

const due = {
  dealId: "deal-due",
  projectTitle: "Villa Anfa",
  agreedAmountMad: 395_000,
  commissionRateBps: 500,
  commissionAmountMad: 19_750,
  commissionConfigVersion: 2,
  commissionStatus: "due",
  beneficiary: "batiplus",
  createdAt: 1_790_000_000_000,
  paidAt: null,
  snapshotComplete: true,
};
const paid = {
  ...due,
  dealId: "deal-paid",
  projectTitle: "Riad Medina",
  commissionStatus: "paid",
  paidAt: 1_790_100_000_000,
};

describe("Company commission visibility UI", () => {
  beforeEach(() => { convex.result = []; });

  test("maps the localized Company commissions route", () => {
    expect(routing.pathnames[routes.companyCommissions]).toEqual({
      en: "/company/commissions",
      fr: "/espace-entreprise/commissions",
    });
  });

  test.each([
    ["en", "No commission obligations yet", "Total commission due"],
    ["fr", "Aucune commission à payer pour le moment", "Total des commissions dues"],
  ] as const)("renders localized %s empty and summary states", (locale, empty, summary) => {
    const html = render(locale);
    expect(html).toContain(empty);
    expect(html).toContain(summary);
  });

  test("renders due and paid badges with safe read-only details", () => {
    convex.result = [due, paid];
    const html = render("en");
    expect(html).toContain("Villa Anfa");
    expect(html).toContain("Riad Medina");
    expect(html).toContain("Due");
    expect(html).toContain("Paid");
    expect(html).toContain("19,750");
    expect(html).toContain("5%");
    expect(html).toContain("Batiplus");
    expect(html).not.toContain("payment note");
    expect(html).not.toContain("admin@example.test");
    expect(html).not.toMatch(/<button/i);
  });

  test("includes both card and table responsive presentations", () => {
    convex.result = [due];
    const html = render("en");
    expect(html).toContain("md:hidden");
    expect(html).toContain("hidden overflow-x-auto md:block");
  });

  test("renders an accessible loading skeleton", () => {
    convex.result = undefined;
    const html = render("fr");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Chargement des obligations de commission");
  });
});
