import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  CompanyAdminNotes,
  deduplicateAdminNotes,
} from "@/features/admin/components/company-admin-notes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const mocks = vi.hoisted(() => ({
  results: [] as Array<Record<string, unknown>>,
  status: "Exhausted",
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(async () => ({})),
  usePaginatedQuery: () => ({
    results: mocks.results,
    status: mocks.status,
    loadMore: vi.fn(),
  }),
}));

function render(locale: "en" | "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      <CompanyAdminNotes companyId={"company-atlas" as never} />
    </NextIntlClientProvider>,
  );
}

describe("Company Admin notes UI", () => {
  beforeEach(() => {
    mocks.results = [];
    mocks.status = "Exhausted";
  });

  test.each([
    ["en", "Internal notes", "Visible only to Batiplus administrators.", "Add note", "No internal notes for this company yet."],
    ["fr", "Notes internes", "Visibles uniquement par les administrateurs Batiplus.", "Ajouter une note", "Aucune note interne pour cette entreprise pour le moment."],
  ] as const)("renders the private empty state and composer in %s", (locale, title, privacy, add, empty) => {
    const html = render(locale);
    expect(html).toContain(title);
    expect(html).toContain(privacy);
    expect(html).toContain(add);
    expect(html).toContain(empty);
    expect(html).toContain('maxLength="5000"');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("contenteditable");
  });

  test("renders escaped plain text with author and time and no edit/delete actions", () => {
    mocks.results = [{
      id: "note-one",
      body: "<script>alert(1)</script>\nPrivate context",
      authorDisplayName: "Ada Admin",
      createdAt: Date.UTC(2026, 8, 28, 16, 40),
    }];
    const html = render("en");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Ada Admin");
    expect(html).toContain("<time");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Delete<");
  });

  test("deduplicates overlapping cursor pages while preserving newest-first order", () => {
    const newest = { id: "newest", body: "new", authorDisplayName: "Admin", createdAt: 3 } as never;
    const older = { id: "older", body: "old", authorDisplayName: "Admin", createdAt: 1 } as never;
    expect(deduplicateAdminNotes([newest, newest, older]).map((note) => note.id))
      .toEqual(["newest", "older"]);
  });
});
