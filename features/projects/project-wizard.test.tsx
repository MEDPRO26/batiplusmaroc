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

import { ProjectWizardSkeleton, resumeWizardStep } from "./components/project-wizard";

describe("project wizard contract", () => {
  test("FR and EN contain the same six progressive steps without an upload step", () => {
    expect(Object.keys(fr.projectWizard).sort()).toEqual(Object.keys(en.projectWizard).sort());
    expect(Object.keys(fr.projectWizard.steps)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(Object.keys(en.projectWizard.categoryOptions)).toEqual(
      Object.keys(fr.projectWizard.categoryOptions),
    );
    expect(en.projectWizard.steps["1"].title).toBe("What do you need done?");
    expect(fr.projectWizard.steps["1"].title).toContain("Quel type de projet");
    expect(en.projectWizard.steps["2"].title).toBe("Where is your project?");
    expect(fr.projectWizard.steps["2"].title).toContain("Où se situe");
    expect(en.projectWizard.steps["5"].title).toBe("When would you like to start?");
    expect(fr.projectWizard.steps["5"].title).toContain("Quand souhaitez-vous commencer");
    expect(en.projectWizard.steps["6"].title).toBe("Review your project");
    expect(fr.projectWizard.steps["6"].title).toContain("Vérifiez votre projet");
    expect(en.projectWizard.steps["6"].title.toLowerCase()).not.toContain("photo");
    expect(en.projectWizard.steps["6"].title.toLowerCase()).not.toContain("document");
    expect(en.projectWizard.publish).toBe("Publish project");
    expect(fr.projectWizard.publish).toBe("Publier le projet");
    expect(en.projectWizard.review).toMatchObject({
      category: expect.any(String),
      location: expect.any(String),
      projectTitle: expect.any(String),
      propertyType: expect.any(String),
      surface: expect.any(String),
      description: expect.any(String),
      budget: expect.any(String),
      timeline: expect.any(String),
    });
    expect(Object.keys(en.projectWizard.review).sort()).toEqual(
      Object.keys(fr.projectWizard.review).sort(),
    );
  });

  test("resume maps completed timeline and old files step to review", () => {
    expect(resumeWizardStep(0)).toBe(1);
    expect(resumeWizardStep(1)).toBe(2);
    expect(resumeWizardStep(2)).toBe(3);
    expect(resumeWizardStep(3)).toBe(4);
    expect(resumeWizardStep(4)).toBe(5);
    expect(resumeWizardStep(5)).toBe(6);
    expect(resumeWizardStep(6)).toBe(6);
    expect(resumeWizardStep(7)).toBe(6);
  });

  test("loading skeleton is announced", () => {
    const html = renderToStaticMarkup(
      <ProjectWizardSkeleton label="Loading draft" progressLabel="Step 1 of 6" />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Loading draft");
    expect(html).toContain("skeleton-block");
  });
});
