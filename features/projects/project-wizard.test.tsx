import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("@/features/auth/components/onboarding-chrome", () => ({
  OnboardingChrome: ({ progressLabel }: { progressLabel: string }) => (
    <div role="progressbar">{progressLabel}</div>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import {
  ProjectWizardSkeleton,
  shouldInitializeDraft,
  WIZARD_ORDER,
  wizardResumeStep,
} from "./components/project-wizard";

describe("project wizard contract", () => {
  test("FR and EN contain the same five progressive steps without budget or upload steps", () => {
    expect(Object.keys(fr.projectWizard).sort()).toEqual(Object.keys(en.projectWizard).sort());
    expect(Object.keys(fr.projectWizard.steps)).toEqual(["1", "2", "3", "4", "5"]);
    expect(Object.keys(en.projectWizard.categoryOptions)).toEqual(
      Object.keys(fr.projectWizard.categoryOptions),
    );
    expect(en.projectWizard.steps["1"].title).toBe("What do you need done?");
    expect(fr.projectWizard.steps["1"].title).toContain("Quel type de projet");
    expect(en.projectWizard.steps["2"].title).toBe("Where is your project?");
    expect(fr.projectWizard.steps["2"].title).toContain("Où se situe");
    expect(en.projectWizard.steps["4"].title).toBe("When would you like to start?");
    expect(fr.projectWizard.steps["4"].title).toContain("Quand souhaitez-vous commencer");
    expect(en.projectWizard.steps["5"].title).toBe("Review your project");
    expect(fr.projectWizard.steps["5"].title).toContain("Vérifiez votre projet");
    expect(JSON.stringify(en.projectWizard).toLowerCase()).not.toContain("budget");
    expect(JSON.stringify(fr.projectWizard).toLowerCase()).not.toContain("budget");
    expect(en.projectWizard.publish).toBe("Publish project");
    expect(fr.projectWizard.publish).toBe("Publier le projet");
    expect(en.projectWizard.review).toMatchObject({
      category: expect.any(String),
      location: expect.any(String),
      projectTitle: expect.any(String),
      propertyType: expect.any(String),
      surface: expect.any(String),
      description: expect.any(String),
      timeline: expect.any(String),
    });
    expect(Object.keys(en.projectWizard.review).sort()).toEqual(
      Object.keys(fr.projectWizard.review).sort(),
    );
  });

  test("does not initialize another draft after project submission", () => {
    const ready = {
      canLoad: true,
      hasInitialProject: false,
      draftMissing: true,
      started: false,
    };
    expect(shouldInitializeDraft({ ...ready, submitted: false })).toBe(true);
    expect(shouldInitializeDraft({ ...ready, submitted: true })).toBe(false);
    expect(
      shouldInitializeDraft({ ...ready, submitted: false, started: true }),
    ).toBe(false);
  });

  test("asks for the project details first and resumes at the first unanswered screen", () => {
    expect(WIZARD_ORDER).toEqual([3, 2, 1, 4, 5]);
    const empty = { primaryCategory: null, customCategoryText: null, city: null, title: null, propertyType: null, surface: null, surfaceUnknown: false, description: null, timeline: null };
    const details = { ...empty, title: "Apartment renovation", propertyType: "apartment" as const, surfaceUnknown: true, description: "Complete apartment renovation." };
    expect(wizardResumeStep(empty)).toBe(3);
    // A category saved under the previous order does not skip the details screen.
    expect(wizardResumeStep({ ...empty, primaryCategory: "renovation" })).toBe(3);
    expect(wizardResumeStep(details)).toBe(2);
    expect(wizardResumeStep({ ...details, city: "rabat" })).toBe(1);
    expect(wizardResumeStep({ ...details, city: "rabat", primaryCategory: "other" })).toBe(1);
    expect(wizardResumeStep({ ...details, city: "rabat", primaryCategory: "renovation" })).toBe(4);
    expect(wizardResumeStep({ ...details, city: "rabat", primaryCategory: "renovation", timeline: "flexible" })).toBe(5);
  });

  test("loading skeleton is announced", () => {
    const html = renderToStaticMarkup(
      <ProjectWizardSkeleton label="Loading draft" progressLabel="Step 1 of 5" />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Loading draft");
    expect(html).toContain("skeleton-block");
  });
});
