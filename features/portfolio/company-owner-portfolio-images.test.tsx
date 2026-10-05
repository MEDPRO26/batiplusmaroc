import { readFileSync } from "node:fs";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import type { Id } from "@/convex/_generated/dataModel";

const session = vi.hoisted(() => ({ token: "owner" as string | null }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => session.token }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: () => vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), Link: () => null }));
import { CompanyOwnerPortfolioImages } from "./components/company-owner-portfolio-images";
import { PortfolioManager } from "./components/portfolio-manager";

function setup({ role = "company", owner = true, completed = true, loading = false } = {}) {
  vi.mocked(useQuery).mockImplementation(((ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const path = getFunctionName(ref as never);
    if (path === "users:currentUser") return { _id: "owner", accountType: role, onboardingStatus: completed ? "completed" : "pending" };
    if (path === "companyVerification/index:getVerificationStatus") return { status: "draft", canManageDocuments: owner };
    const approved = { imageId: "A", moderationStatus: "approved" };
    const rejected = { imageId: "B", moderationStatus: "rejected", reason: "Identifying phone number" };
    if (path === "portfolioImages/index:getMyImages") return loading ? undefined : {
      cover: { approved, submitted: rejected }, gallery: [
        { slotId: "slot-1", approved, submitted: { imageId: "C", moderationStatus: "pending" } },
        { slotId: "slot-2", approved: null, submitted: rejected },
      ],
    };
    return undefined;
  }) as never);
}
const queried = (path: string) => vi.mocked(useQuery).mock.calls.some(([ref, args]) => args !== "skip" && getFunctionName(ref as never) === path);
function render(locale: "en" | "fr" = "en", component = <CompanyOwnerPortfolioImages portfolioProjectId={"project" as Id<"portfolioProjects">} publicUrls={[]} />) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} timeZone="Africa/Casablanca">{component}</NextIntlClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); session.token = "owner"; setup(); });

test.each(["en", "fr"] as const)("%s: separate cover and independent slots explain publication, privacy and retry", locale => {
  const html = render(locale); const copy = locale === "fr" ? fr.portfolioImages : en.portfolioImages;
  for (const key of ["guidance", "publicationHelp", "approvedHelp", "galleryHelp", "pendingHelp", "rejectedHelp", "limits", "omittedGallery"] as const) expect(html).toContain(copy[key]);
  expect(html).toContain(copy.status.pending); expect(html).toContain(copy.status.approved); expect(html).toContain(copy.status.rejected);
  expect(html).toContain("Identifying phone number"); expect(html).toContain('data-slot-id="slot-1"'); expect(html).toContain('data-slot-id="slot-2"');
  expect(html).not.toMatch(/\/api\/storage\/|r2\.dev/);
});
test.each(["client", "admin", "staff", "owner"])("%s skips owner image subscriptions", role => {
  setup({ role }); expect(render()).toBe(""); expect(queried("portfolioImages/index:getMyImages")).toBe(false);
});
test("staff Company membership skips images and metadata manager, and cannot see reasons", () => {
  setup({ owner: false }); expect(render()).toBe(""); expect(render("en", <PortfolioManager />)).toContain(en.ux.error.codes.COMPANY_OWNER_REQUIRED);
  expect(queried("portfolioImages/index:getMyImages")).toBe(false); expect(queried("portfolio/index:getPortfolioManager")).toBe(false);
});
test.each(["signed-out", "incomplete"])("%s skips private state", mode => {
  if (mode === "signed-out") session.token = null; else setup({ completed: false });
  expect(render()).toBe(""); expect(queried("portfolioImages/index:getMyImages")).toBe(false);
});
test("loading state does not offer uploads before authoritative slots arrive", () => {
  setup({ loading: true }); const html = render(); expect(html).toContain('aria-busy="true"'); expect(html).not.toContain('type="file"');
});
test("FR/EN image copy has identical keys and placeholders", () => {
  expect(Object.keys(fr.portfolioImages).sort()).toEqual(Object.keys(en.portfolioImages).sort());
  expect(Object.keys(fr.portfolioImages.status)).toEqual(Object.keys(en.portfolioImages.status));
  for (const key of Object.keys(en.portfolioImages) as (keyof typeof en.portfolioImages)[]) {
    const english = en.portfolioImages[key]; const french = fr.portfolioImages[key];
    if (typeof english === "string" && typeof french === "string") expect(french.match(/\{\w+\}/g)).toEqual(english.match(/\{\w+\}/g));
  }
});
test("owner controls have no legacy R2 upload, approval or storage URL fallback", () => {
  const manager = readFileSync("features/portfolio/components/portfolio-manager.tsx", "utf8");
  const images = readFileSync("features/portfolio/components/company-owner-portfolio-images.tsx", "utf8");
  for (const source of [manager, images]) expect(source).not.toMatch(/api\.storage\.r2|requestPublicMediaUpload|verifyPublicMediaUpload|portfolioImages\.index\.(approve|reject|hide)/);
  expect(manager).not.toMatch(/coverRequired|extraImages|coverImage:\s/);
  expect(manager).toContain("<CompanyOwnerPortfolioImages"); expect(images).toContain("intent.uploadToken"); expect(images).not.toContain("intent.uploadUrl");
});
