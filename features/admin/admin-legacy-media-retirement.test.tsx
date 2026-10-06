import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
vi.mock("convex/react", () => ({ useQuery: vi.fn(), usePaginatedQuery: vi.fn(), useAction: () => vi.fn(), useConvex: () => ({ query: vi.fn() }) }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a>, usePathname: () => "/admin/companies" }));
import { AdminLegacyMediaRetirement } from "./components/admin-legacy-media-retirement";
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(useQuery).mockReturnValue(undefined);
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: [{ ingestionId: "ingestion", companyId: "company", companyName: "Atlas", projectTitle: "Villa", mediaType: "portfolioGallery", provider: "convex", ingestionStatus: "ingested", moderationStatus: "pending", retirementStatus: "not_ready", cacheVerificationRequired: false }], status: "CanLoadMore", loadMore: vi.fn() } as never);
});
function render(locale: "fr" | "en" = "en") { return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}><AdminLegacyMediaRetirement /></NextIntlClientProvider>); }
test.each(["en", "fr"] as const)("%s metadata only, explicit readiness check, bounded pagination", locale => {
  const copy = (locale === "fr" ? fr : en).adminLegacyRetirement; const html = render(locale);
  expect(html).toContain(copy.title); expect(html).toContain(copy.check); expect(html).toContain(copy.loadMore); expect(html).toContain(copy.moderation.pending);
  expect(html).not.toContain("<img"); expect(html).not.toContain("/api/storage/"); expect(html).not.toContain(copy.confirmRetire);
  expect(getFunctionName(vi.mocked(usePaginatedQuery).mock.calls[0][0])).toBe("legacyMediaIngestion/retirement:listRetirements");
  expect(vi.mocked(usePaginatedQuery).mock.calls[0][2]).toEqual({ initialNumItems: 20 }); expect(vi.mocked(useQuery).mock.calls[0][1]).toBe("skip");
});
test("retired provenance remains visible and never claims cache purge", () => {
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: [{ ingestionId: "ingestion", companyId: "company", companyName: "Atlas", projectTitle: null, mediaType: "companyLogo", provider: "convex", ingestionStatus: "ingested", moderationStatus: "approved", retirementStatus: "retired", cacheVerificationRequired: true }], status: "Exhausted", loadMore: vi.fn() } as never);
  const html = render(); expect(html).toContain(en.adminLegacyRetirement.status.retired); expect(html).toContain(en.adminLegacyRetirement.cacheRequired); expect(html).toContain(en.adminLegacyRetirement.cacheChecklist);
});
test.each(["en", "fr"] as const)("%s active retirement has no Retry control; expired and failed attempts do", locale => {
  const copy = (locale === "fr" ? fr : en).adminLegacyRetirement;
  vi.mocked(useQuery).mockReturnValue({ ready: false, retryable: false, retirementStatus: "retiring", blockers: [] });
  const active = render(locale);
  expect(active).toContain(copy.status.retiring); expect(active).not.toContain(copy.retry); expect(active).not.toContain(copy.retire);
  for (const status of ["ready", "failed"]) {
    vi.mocked(useQuery).mockReturnValue({ ready: true, retryable: true, retirementStatus: status, fingerprint: "fresh", blockers: [] });
    const retry = render(locale);
    expect(retry).toContain(copy.retry); expect(retry).not.toContain(copy.status.retiring); expect(retry).not.toContain(copy.retire);
  }
});
test("FR/EN retirement keys/placeholders match", () => {
  function flatten(value: Record<string, unknown>, prefix = ""): Record<string, string[]> {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[prefix + key, item.match(/\{\w+\}/g) ?? []]] : Object.entries(flatten(item as Record<string, unknown>, prefix + key + "."))));
  }
  expect(flatten(fr.adminLegacyRetirement)).toEqual(flatten(en.adminLegacyRetirement));
});
