import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({ rows: [] as unknown[] | undefined }));
vi.mock("convex/react", () => ({ useQuery: () => state.rows, useMutation: () => vi.fn() }));
vi.mock("./components/admin-shell", () => ({
  ADMIN_PRESS: "",
  AdminPage: ({ header, children }: { header: ReactNode; children: ReactNode }) => <div>{header}{children}</div>,
}));
import { AdminServicesPanel } from "./components/admin-services-panel";

describe("Admin service catalog rollout warning", () => {
  test.each([["en", en], ["fr", fr]] as const)("warns about an empty catalog in %s and stops after seeding", (locale, messages) => {
    const render = () => renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages}><AdminServicesPanel /></NextIntlClientProvider>);
    state.rows = [];
    expect(render()).toContain(messages.adminServices.emptyWarning);
    state.rows = undefined;
    expect(render()).not.toContain(messages.adminServices.emptyWarning);
    state.rows = [{ _id: "service-1", slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", isActive: true, sortOrder: 0 }];
    expect(render()).not.toContain(messages.adminServices.emptyWarning);
  });
});
