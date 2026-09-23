import { useQuery } from "convex/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "Jan 1, 2024" }),
}));
vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ Link: () => null, useRouter: vi.fn() }));
vi.mock("@/features/shared/components/app-feedback", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import {
  ClientProfileEditor,
  ClientProfileEditorSkeleton,
} from "./components/client-profile-editor";

function objectShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(objectShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, objectShape(child)]),
    );
  }
  return typeof value;
}

describe("client profile management UX contract", () => {
  test("FR and EN expose the same client profile translation shape", () => {
    expect(objectShape(fr.clientProfileManager)).toEqual(objectShape(en.clientProfileManager));
    expect(en.clientProfileManager.save).toBe("Save changes");
    expect(fr.clientProfileManager.save).toBe("Enregistrer les modifications");
    expect(en.clientProfileManager.myInfo).toBe("My info");
    expect(fr.clientProfileManager.myInfo).toBe("Mes informations");
    expect(en.clientProfileManager.contact.emailHelp).toContain("cannot be changed");
    expect(fr.clientProfileManager.contact.emailHelp).toContain("ne peut pas être modifié");
    expect(en.meta.clientProfile.title).toContain("My profile");
    expect(fr.meta.clientProfile.title).toContain("Mon profil");
  });

  test("renders an announced loading skeleton", () => {
    const html = renderToStaticMarkup(
      <ClientProfileEditorSkeleton label="Loading your profile…" />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading your profile…");
    expect(html.match(/skeleton-block/g)?.length).toBeGreaterThan(5);
  });

  test("renders editable fields, private contact, activity, and initials fallback", () => {
    let queryIndex = 0;
    vi.mocked(useQuery).mockImplementation(() => {
      queryIndex += 1;
      if (queryIndex === 1) {
        return { accountType: "client", onboardingStatus: "completed" } as never;
      }
      return {
        firstName: "Amine",
        lastName: "Benali",
        initials: "AB",
        profilePhotoUrl: null,
        city: "Rabat",
        phone: "0612345678",
        email: "amine@example.test",
        joinedAt: 1_700_000_000_000,
        projectsPostedCount: 2,
        projectsCompletedCount: 1,
      } as never;
    });

    const html = renderToStaticMarkup(<ClientProfileEditor />);
    expect(html).toContain("settingsTitle");
    expect(html).toContain("myInfo");
    expect(html).toContain("accountTypeLead");
    expect(html).toContain("Amine");
    expect(html).toContain("Benali");
    expect(html).toContain("amine@example.test");
    expect(html).toContain('name="firstName"');
    expect(html).toContain('name="lastName"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('name="city"');
    expect(html).toContain("AB");
    expect(html).toContain("activity.projectsPosted");
    expect(html).toContain('aria-label="edit"');
  });
});
