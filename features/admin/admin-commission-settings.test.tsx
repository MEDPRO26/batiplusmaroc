import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));
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
  usePathname: () => "/admin/settings",
  getPathname: () => "/admin/settings",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import {
  AdminCommissionSettingsView,
  formatBpsAsPercentage,
  percentageInputToBps,
} from "./components/admin-commission-settings-panel";
import { AdminShell } from "./components/admin-shell";

const configured = {
  configured: true,
  commissionRateBps: 1_000,
  updatedAt: 1,
  updatedByUserId: "admin-1" as Id<"users">,
};

function render(
  locale: "fr" | "en",
  props: Partial<React.ComponentProps<typeof AdminCommissionSettingsView>> = {},
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      <AdminShell email="admin@example.test" firstName="Ada" lastName="Admin">
        <AdminCommissionSettingsView
          error=""
          input="10.00"
          onInputChange={() => undefined}
          onSubmit={() => undefined}
          saving={false}
          setting={configured}
          success=""
          {...props}
        />
      </AdminShell>
    </NextIntlClientProvider>,
  );
}

describe("admin marketplace commission settings", () => {
  test("maps the localized settings route and activates the existing nav item", () => {
    expect(routing.pathnames[routes.adminSettings]).toEqual({
      fr: "/admin/parametres",
      en: "/admin/settings",
    });
    const html = render("en");
    expect(html).toMatch(
      /aria-current="page"[^>]*>(?:(?!<\/span>)[\s\S])*Settings<\/span>/,
    );
  });

  test.each([
    ["10", 1_000],
    ["10.5", 1_050],
    ["7.50", 750],
    ["7,5", 750],
    ["0", 0],
    ["30.00", 3_000],
  ])("converts valid percentage %s to integer bps", (input, expected) => {
    expect(percentageInputToBps(input)).toBe(expected);
  });

  test.each(["", "abc", "10.005", "-1", "30.01", "100"])(
    "rejects invalid percentage input %s",
    (input) => {
      expect(percentageInputToBps(input)).toBeNull();
    },
  );

  test("formats basis points without floating-point percentage authority", () => {
    expect(formatBpsAsPercentage(750)).toBe("7.50");
    expect(formatBpsAsPercentage(1_050)).toBe("10.50");
  });

  test.each([
    [
      "en",
      "Marketplace commission",
      "Commission rate",
      "Applies to new Deals only.",
      "Save changes",
    ],
    [
      "fr",
      "Commission de la marketplace",
      "Taux de commission",
      "S’applique uniquement aux nouveaux contrats.",
      "Enregistrer les modifications",
    ],
  ] as const)(
    "renders the editable configured form in %s",
    (locale, title, label, scope, save) => {
      const html = render(locale);
      expect(html).toContain(title);
      expect(html).toContain(label);
      expect(html).toContain(scope);
      expect(html).toContain(save);
      expect(html).toContain('name="commissionRate"');
      expect(html).toContain('value="10.00"');
      expect(html).not.toContain('name="commissionRate" disabled=""');
      expect(html).toContain("md:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]");
    },
  );

  test("renders loading and explicit unconfigured states", () => {
    const loading = render("en", { setting: undefined, input: "" });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading commission settings");

    const empty = render("en", {
      setting: {
        configured: false,
        commissionRateBps: null,
        updatedAt: null,
        updatedByUserId: null,
      },
      input: "",
    });
    expect(empty).toContain("Commission configuration required");
    expect(empty).toContain('value=""');
  });

  test("renders validation, saving, success, and backend error feedback", () => {
    const invalid = render("en", {
      error: "Invalid commission rate",
      input: "31",
    });
    expect(invalid).toContain('role="alert"');
    expect(invalid).toContain("Invalid commission rate");

    const saving = render("en", { saving: true });
    expect(saving).toContain("Saving…");
    expect(saving).toContain('disabled=""');

    const success = render("en", {
      success: "Commission updated successfully",
    });
    expect(success).toContain('role="status"');
    expect(success).toContain("Commission updated successfully");

    const backendError = render("en", {
      error: "The commission setting could not be loaded or saved. Please try again.",
    });
    expect(backendError).toContain("could not be loaded or saved");
  });
});
