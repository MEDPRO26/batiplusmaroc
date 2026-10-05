import { readFileSync } from "node:fs";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const session = vi.hoisted(() => ({ token: "owner-session" as string | null }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => session.token }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: () => vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
import { CompanyOwnerLogoManager } from "./components/company-owner-logo-manager";
import { CompanyOnboardingForm } from "./components/company-onboarding-form";
import { CompanyProfileEditor } from "./components/company-profile-editor";

vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/features/auth/components/onboarding-chrome", () => ({ OnboardingChrome: () => null }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

function setup({ role = "company", owner = true, status = "pending", loading = false, completed = true } = {}) {
  vi.mocked(useQuery).mockImplementation(((ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref as never);
    if (name === "users:currentUser") return { _id: "owner", accountType: role, onboardingStatus: completed ? "completed" : "pending" };
    if (name === "companyVerification/index:getVerificationStatus") return { status: "draft", canManageDocuments: owner };
    if (name === "companyLogos/index:getMyLogos") return loading ? undefined : {
      approved: { imageId: "approved-A", moderationStatus: "approved" },
      submitted: { imageId: "submitted-B", moderationStatus: status, reason: status === "rejected" ? "Identifying phone number" : undefined },
    };
    return undefined;
  }) as never);
}
const render = (locale: "en" | "fr" = "en", component = <CompanyOwnerLogoManager />) => renderToStaticMarkup(
  <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}>{component}</NextIntlClientProvider>,
);
const queried = (path: string) => vi.mocked(useQuery).mock.calls.some(([ref, args]) => args !== "skip" && getFunctionName(ref as never) === path);

describe("owner logo UI access and language contract", () => {
  beforeEach(() => { vi.clearAllMocks(); session.token = "owner-session"; setup(); });

  test.each(["en", "fr"] as const)("%s explains review, privacy, optional upload and replacement", locale => {
    const html = render(locale); const text = locale === "fr" ? fr.companyLogo : en.companyLogo;
    expect(html).toContain(text.status.pending); expect(html).toContain(text.status.approved);
    expect(html).toContain(text.optional); expect(html).toContain(text.approvedHelp);
    expect(html).toContain("QR"); expect(html).toContain("5 Mi");
    expect(queried("companyLogos/index:getMyLogos")).toBe(true);
    expect(html).not.toContain("/api/storage/");
  });

  test("only the owner sees the rejection reason alongside the approved image", () => {
    setup({ status: "rejected" });
    const html = render(); expect(html).toContain("Rejection reason: Identifying phone number"); expect(html).toContain("Current approved logo");
    expect(html).toContain("You can upload a new image");
    vi.clearAllMocks(); setup({ owner: false, status: "rejected" });
    expect(render()).toBe(""); expect(queried("companyLogos/index:getMyLogos")).toBe(false);
  });

  test.each(["client", "admin", "owner"])("%s does not request Company-owner media", role => {
    setup({ role }); expect(render()).toBe(""); expect(queried("companyLogos/index:getMyLogos")).toBe(false);
    expect(queried("companyVerification/index:getVerificationStatus")).toBe(false);
  });

  test("signed-out users cannot subscribe to private image state", () => {
    session.token = null; expect(render()).toBe(""); expect(queried("companyLogos/index:getMyLogos")).toBe(false);
  });

  test("announces loading and disables upload before current state is loaded", () => {
    setup({ loading: true }); const html = render();
    expect(html).toContain('aria-busy="true"'); expect(html).toContain("Loading your logos"); expect(html).toContain("disabled");
  });

  test("staff skip the owner profile and onboarding queries as well as previews", () => {
    setup({ owner: false }); expect(render("en", <CompanyProfileEditor />)).toContain(en.ux.error.codes.COMPANY_OWNER_REQUIRED);
    expect(queried("companies/index:getProfileManager")).toBe(false);
    vi.clearAllMocks(); setup({ owner: false, completed: false });
    expect(render("en", <CompanyOnboardingForm />)).toContain(en.ux.error.codes.COMPANY_OWNER_REQUIRED);
    expect(queried("companies/index:getOnboardingProfile")).toBe(false);
    expect(queried("companyLogos/index:getMyLogos")).toBe(false);
  });

  test("FR/EN logo translations have identical keys and placeholders", () => {
    expect(Object.keys(fr.companyLogo).sort()).toEqual(Object.keys(en.companyLogo).sort());
    expect(Object.keys(fr.companyLogo.status)).toEqual(Object.keys(en.companyLogo.status));
    for (const key of Object.keys(en.companyLogo) as (keyof typeof en.companyLogo)[]) {
      const english = en.companyLogo[key]; const french = fr.companyLogo[key];
      if (typeof english === "string" && typeof french === "string") expect(french.match(/\{\w+\}/g)).toEqual(english.match(/\{\w+\}/g));
    }
  });

  test("all existing owner logo controls use the moderation contract, with no old R2 logo calls or onboarding fallback", () => {
    const onboarding = readFileSync("features/companies/components/company-onboarding-form.tsx", "utf8");
    const editor = readFileSync("features/companies/components/company-profile-editor.tsx", "utf8");
    const editing = readFileSync("features/companies/components/profile/profile-editing.tsx", "utf8");
    for (const source of [onboarding, editor, editing]) expect(source).not.toMatch(/purpose:\s*["']companyLogo["']|uploadImage\([^)]*["']companyLogo["']|useImageReplace\(["']companyLogo["']/);
    expect(onboarding).not.toContain("api.storage.r2"); expect(onboarding).not.toContain("logoUploadToken"); expect(onboarding).not.toContain("profile.logoUrl");
    expect(onboarding).toContain("<CompanyOwnerLogoManager"); expect(editor).toContain("<CompanyOwnerLogoManager");
  });
});
