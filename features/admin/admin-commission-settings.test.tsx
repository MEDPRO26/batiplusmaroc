import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
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
    <a href={href} {...props}>{children}</a>
  ),
  usePathname: () => "/admin/settings",
  getPathname: () => "/admin/settings",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import {
  addTierDraft,
  AdminCommissionSettingsView,
  formatBpsAsPercentage,
  parseWholeMad,
  percentageInputToBps,
  removeTierDraft,
  tiersToDrafts,
  updateTierDraft,
  validateTierDrafts,
} from "./components/admin-commission-settings-panel";
import { AdminShell } from "./components/admin-shell";

const tiers = [
  { minAmountMad: 0, maxAmountMad: 300_000, commissionRateBps: 300 },
  { minAmountMad: 300_001, maxAmountMad: 500_000, commissionRateBps: 500 },
  { minAmountMad: 500_001, maxAmountMad: null, commissionRateBps: 1_000 },
];

const configured = {
  configured: true,
  commissionTiers: tiers,
  commissionConfigVersion: 3,
  updatedAt: 1,
  updatedByUserId: "admin-1" as Id<"users">,
};

const drafts = tiersToDrafts(tiers);

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
          drafts={drafts}
          error=""
          onAdd={() => undefined}
          onChange={() => undefined}
          onRemove={() => undefined}
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

describe("admin marketplace commission tier settings", () => {
  test("maps the localized settings route and activates the existing nav item", () => {
    expect(routing.pathnames[routes.adminSettings]).toEqual({
      fr: "/admin/parametres",
      en: "/admin/settings",
    });
    expect(render("en")).toMatch(
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
    (input) => expect(percentageInputToBps(input)).toBeNull(),
  );

  test("parses formatted whole-MAD values and formats bps", () => {
    expect(parseWholeMad("300,000")).toBe(300_000);
    expect(parseWholeMad("500 001")).toBe(500_001);
    expect(parseWholeMad("300000.5")).toBeNull();
    expect(formatBpsAsPercentage(750)).toBe("7.50");
  });

  test("renders existing tiers, editable controls, version, and open-ended final tier", () => {
    const html = render("en");
    expect(html).toContain("Marketplace commission rules");
    expect(html).toContain("Version 3");
    expect(html).toContain('value="300000"');
    expect(html).toContain('value="300001"');
    expect(html).toContain('value="10.00"');
    expect(html).toContain("No limit");
    expect(html).toContain("Add tier");
    expect(html).toContain("Remove tier");
  });

  test("adds, edits, removes, and converts a tier draft", () => {
    const added = addTierDraft(drafts, "new-tier");
    expect(added).toHaveLength(4);
    expect(added.at(-1)).toMatchObject({ id: "new-tier", maxAmountMad: "" });

    const edited = updateTierDraft(added, "new-tier", "commissionPercent", "7.5");
    expect(edited.at(-1)?.commissionPercent).toBe("7.5");

    const removed = removeTierDraft(drafts, drafts[1].id);
    expect(removed).toHaveLength(2);
    expect(removed.at(-1)?.maxAmountMad).toBe("");
  });

  test("converts a valid edited schedule to authoritative integer values", () => {
    const edited = updateTierDraft(drafts, drafts[1].id, "commissionPercent", "7.5");
    expect(validateTierDrafts(edited)).toEqual({
      tiers: [tiers[0], { ...tiers[1], commissionRateBps: 750 }, tiers[2]],
    });
  });

  test.each([
    [
      "overlap",
      [
        { id: "a", minAmountMad: "0", maxAmountMad: "300000", commissionPercent: "3" },
        { id: "b", minAmountMad: "250000", maxAmountMad: "", commissionPercent: "5" },
      ],
      "overlap",
    ],
    [
      "gap",
      [
        { id: "a", minAmountMad: "0", maxAmountMad: "300000", commissionPercent: "3" },
        { id: "b", minAmountMad: "350000", maxAmountMad: "", commissionPercent: "5" },
      ],
      "gap",
    ],
    [
      "bounded final tier",
      [{ id: "a", minAmountMad: "0", maxAmountMad: "300000", commissionPercent: "3" }],
      "finalTierOpen",
    ],
  ] as const)("returns a targeted validation error for %s", (_name, value, error) => {
    expect(validateTierDrafts(value)).toEqual({ error });
  });

  test.each([
    ["en", "Marketplace commission rules", "Deal value from", "No limit", "Save changes"],
    ["fr", "Règles de commission", "Montant du contrat à partir de", "Sans limite", "Enregistrer les modifications"],
  ] as const)("renders the requested terminology in %s", (locale, title, from, noLimit, save) => {
    const html = render(locale);
    expect(html).toContain(title);
    expect(html).toContain(from);
    expect(html).toContain(noLimit);
    expect(html).toContain(save);
  });

  test("renders loading, unconfigured, validation, saving, success, and backend errors", () => {
    expect(render("en", { setting: undefined })).toContain('aria-busy="true"');
    expect(render("en", {
      setting: {
        configured: false,
        commissionTiers: [],
        commissionConfigVersion: null,
        updatedAt: null,
        updatedByUserId: null,
      },
      drafts: [{ id: "empty", minAmountMad: "0", maxAmountMad: "", commissionPercent: "" }],
    })).toContain("Commission rules must be configured");

    expect(render("en", { error: "Ranges cannot overlap." })).toContain('role="alert"');
    expect(render("en", { error: "Ranges cannot contain gaps." })).toContain("contain gaps");
    expect(render("en", { saving: true })).toContain("Saving…");
    expect(render("en", { success: "Commission rules updated successfully." }))
      .toContain('role="status"');
    expect(render("en", { error: "The commission rules could not be loaded or saved." }))
      .toContain("could not be loaded or saved");
  });
});
