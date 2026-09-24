import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));

vi.mock("convex/react", () => ({
  useQuery: () => [],
  useMutation: () => vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/verification",
  getPathname: () => "/admin/verification",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
}));

import { AdminVerificationPanel } from "./components/admin-verification-panel";

describe("admin verification panel", () => {
  test.each([
    ["en", "Verification", "Pending"],
    ["fr", "Vérification", "En attente"],
  ] as const)("renders %s copy for the verification area", (locale, title, pending) => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
        <AdminVerificationPanel email="admin@example.test" firstName="Ada" lastName="Admin" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(title);
    expect(html).toContain(pending);
    expect(html).toContain("admin@example.test");
  });
});
