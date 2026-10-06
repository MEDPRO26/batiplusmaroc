import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
const session = vi.hoisted(() => ({ token: "admin-session" as string | null, role: "admin" }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => session.token }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(), usePaginatedQuery: vi.fn(), useAction: () => vi.fn() }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a>, usePathname: () => "/admin/companies" }));
vi.mock("./components/admin-legacy-media-retirement", () => ({ AdminLegacyMediaRetirement: () => null }));
import { AdminLegacyMediaIngestion } from "./components/admin-legacy-media-ingestion";
beforeEach(() => {
  vi.clearAllMocks(); session.token = "admin-session"; session.role = "admin";
  vi.mocked(useQuery).mockImplementation(() => ({ _id: "admin", accountType: session.role }) as never);
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: [{ mediaType: "companyLogo", provider: "r2", companyId: "company", companyName: "Atlas", projectTitle: null, order: null, sourceKey: "opaque", state: null, hasModeratedState: false }], status: "CanLoadMore", loadMore: vi.fn() } as never);
});
function render(locale: "en" | "fr" = "en") { return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}><AdminLegacyMediaIngestion /></NextIntlClientProvider>); }
test.each(["en", "fr"] as const)("%s metadata-only bounded candidates and ingestion warning", locale => {
  const html = render(locale); const copy = (locale === "fr" ? fr : en).adminLegacyMedia;
  expect(html).toContain(copy.title); expect(html).toContain(copy.lead); expect(html).toContain(copy.ingest); expect(html).toContain(copy.loadMore);
  expect(html).not.toContain("<img"); expect(html).not.toContain("/api/storage/");
  const [ref, args, options] = vi.mocked(usePaginatedQuery).mock.calls[0];
  expect(getFunctionName(ref)).toBe("legacyMediaIngestion/index:listCandidates"); expect(args).toEqual({ mediaType: "companyLogo" }); expect(options).toEqual({ initialNumItems: 20 });
});
test.each(["company", "client", "seo_team"])("%s never subscribes to candidates", role => { session.role = role; expect(render()).toBe(""); expect(usePaginatedQuery).not.toHaveBeenCalled(); });
test("sign-out clears operational scope", () => { session.token = null; expect(render()).toBe(""); expect(usePaginatedQuery).not.toHaveBeenCalled(); });
test.each(["processing", "ingested", "conflict", "failed"] as const)("%s state is translated and review is reused", status => {
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: [{ mediaType: "companyLogo", provider: "convex", companyId: "company", companyName: "Atlas", projectTitle: null, order: null, sourceKey: "opaque", state: { status, imageId: "image" }, hasModeratedState: true }], status: "Exhausted", loadMore: vi.fn() } as never);
  const html = render(); expect(html).toContain(en.adminLegacyMedia.status[status]); expect(html).toContain(en.adminLegacyMedia.review);
  if (status === "failed") expect(html).toContain(en.adminLegacyMedia.retry);
  expect(html).not.toContain("Approve");
});
test("FR/EN keys and placeholders match", () => {
  function flatten(value: Record<string, unknown>, prefix = ""): Record<string, string[]> {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[prefix + key, item.match(/\{\w+\}/g) ?? []]] : Object.entries(flatten(item as Record<string, unknown>, prefix + key + "."))));
  }
  expect(flatten(fr.adminLegacyMedia)).toEqual(flatten(en.adminLegacyMedia));
});
