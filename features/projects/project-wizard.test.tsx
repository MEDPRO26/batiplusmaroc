import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
vi.mock("@/features/auth/components/onboarding-chrome", () => ({ OnboardingChrome: ({ progressLabel }: { progressLabel: string }) => <div role="progressbar">{progressLabel}</div> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => children, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
import { ProjectWizardSkeleton } from "./components/project-wizard";

describe("project wizard contract", () => {
  test("FR and EN contain the same six progressive steps and stable choice labels", () => { expect(Object.keys(fr.projectWizard).sort()).toEqual(Object.keys(en.projectWizard).sort()); expect(Object.keys(fr.projectWizard.steps)).toEqual(["1", "2", "3", "4", "5", "6"]); expect(Object.keys(en.projectWizard.categoryOptions)).toEqual(Object.keys(fr.projectWizard.categoryOptions)); expect(en.projectWizard.steps["1"].title).toBe("What do you need done?"); expect(fr.projectWizard.steps["1"].title).toContain("Quel type de projet"); });
  test("loading skeleton is announced", () => { const html = renderToStaticMarkup(<ProjectWizardSkeleton label="Loading draft" progressLabel="Step 1 of 6" />); expect(html).toContain('role="progressbar"'); expect(html).toContain("Loading draft"); expect(html).toContain("skeleton-block"); });
});
