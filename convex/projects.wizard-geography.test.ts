/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { isWizardLocationComplete, locationFormFromDraft, prepareStructuredLocationSave } from "../lib/geography/wizard-location";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const filled = {
  primaryCategory: "renovation" as const,
  title: "Safe rural renovation",
  propertyType: "house" as const,
  description: "A sufficiently detailed general renovation description.",
  surfaceUnknown: true,
  timeline: "flexible" as const,
};

async function wizardFor(status: "draft" | "needs_changes", location: Record<string, unknown>) {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) =>
    ctx.db.insert("users", {
      accountType: "client",
      onboardingStatus: "completed",
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const owner = t.withIdentity({ subject: `${ownerId}|test-session`, tokenIdentifier: `test|${ownerId}` });
  const { projectId } = await owner.mutation(api.projects.index.initializeDraft, {});
  await t.run((ctx) => ctx.db.patch(projectId, { status, ...filled, ...location }));
  const wizard = await owner.query(api.projects.index.getWizard, { projectId });
  return { t, owner, ownerId, projectId, wizard };
}

describe("GEO5 wizard resume", () => {
  test("a new empty draft is not treated as a located project", async () => {
    const t = convexTest(schema, modules);
    const ownerId: Id<"users"> = await t.run((ctx) =>
      ctx.db.insert("users", {
        accountType: "client",
        onboardingStatus: "completed",
        countryCode: "MA",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const owner = t.withIdentity({ subject: `${ownerId}|test-session`, tokenIdentifier: `test|${ownerId}` });
    const { projectId } = await owner.mutation(api.projects.index.initializeDraft, {});
    const wizard = await owner.query(api.projects.index.getWizard, { projectId });
    expect(wizard.draft?.resumeStep).toBe(1);
    expect(wizard.draft?.city).toBeNull();
    expect(wizard.draft?.location).toMatchObject({
      regionCode: null,
      provinceCode: null,
      communeName: null,
      localityName: null,
      legacyCity: null,
    });
  });

  test("region-only and region-plus-province drafts resume at location", async () => {
    expect((await wizardFor("draft", { regionCode: "09" })).wizard.draft?.resumeStep).toBe(2);
    expect((await wizardFor("draft", { regionCode: "09", provinceCode: "09.541" })).wizard.draft?.resumeStep).toBe(2);
  });

  test("a complete structured draft, with or without a commune, resumes on review", async () => {
    const complete = { regionCode: "09", provinceCode: "09.541", localityName: "Douar Y" };
    expect((await wizardFor("draft", complete)).wizard.draft?.resumeStep).toBe(5);
    expect((await wizardFor("draft", { ...complete, communeName: "Commune X" })).wizard.draft?.resumeStep).toBe(5);
  });

  test("legacy city-only drafts stay complete and mixed drafts return to location", async () => {
    expect((await wizardFor("draft", { city: "rabat" })).wizard.draft?.resumeStep).toBe(5);
    expect((await wizardFor("needs_changes", { city: "agadir", regionCode: "09" })).wizard.draft?.resumeStep).toBe(2);
  });

  test("the wizard payload saves structured fields and does not fabricate a city", async () => {
    const prepared = prepareStructuredLocationSave({
      regionCode: "09",
      provinceCode: "09.541",
      communeName: "Commune X",
      localityName: "Douar آيت ⵜⴰⵎⵍⵉⵍ",
    }, "continue");
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const state = await wizardFor("needs_changes", { city: "agadir", neighborhood: "Founty" });
    await state.owner.mutation(api.projects.index.saveStructuredLocation, {
      projectId: state.projectId,
      ...prepared.payload,
    });
    const project = await state.t.run((ctx) => ctx.db.get("projects", state.projectId));
    expect(project).toMatchObject({
      city: "agadir",
      regionCode: "09",
      provinceCode: "09.541",
      communeName: "Commune X",
      localityName: "Douar آيت ⵜⴰⵎⵍⵉⵍ",
      status: "needs_changes",
    });
    const wizard = await state.owner.query(api.projects.index.getWizard, { projectId: state.projectId });
    expect(wizard.draft?.resumeStep).toBe(5);
    expect(wizard.draft?.locationMode).toBe("structured");
    expect(wizard.draft?.location.legacyCity).toBeNull();
  });
});

const clearLocation = { regionCode: null, provinceCode: null, communeName: null, localityName: null };
const completeLocation = { regionCode: "09", provinceCode: "09.541", communeName: null, localityName: "Douar آيت ⵜⴰⵎⵍⵉⵍ" };
type WizardState = Awaited<ReturnType<typeof wizardFor>>;

async function snapshot(state: WizardState) {
  return await state.t.run(async (ctx) => ({
    project: await ctx.db.get(state.projectId),
    history: await ctx.db.query("projectStatusHistory").withIndex("by_projectId", (q) => q.eq("projectId", state.projectId)).take(20),
    activity: await ctx.db.query("marketplaceActivity").withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", state.projectId)).take(20),
    notifications: await ctx.db.query("notifications").take(20),
  }));
}
async function expectUnchanged(state: WizardState, operation: () => Promise<unknown>, code: string) {
  const before = await snapshot(state);
  await expect(operation()).rejects.toThrow(code);
  expect(await snapshot(state)).toEqual(before);
}

describe("GEO5.1 durable structured-location intent", () => {
  test("a genuine historical city-only Project keeps legacy saves, resume, submission and approval", async () => {
    const state = await wizardFor("draft", { city: "agadir", neighborhood: "Founty" });
    expect(state.wizard.draft).toMatchObject({ locationMode: null, resumeStep: 5, location: { legacyCity: "agadir" } });
    await state.owner.mutation(api.projects.index.saveLocation, { projectId: state.projectId, city: "rabat", neighborhood: "Agdal" });
    expect((await snapshot(state)).project).not.toHaveProperty("locationMode");
    await state.owner.mutation(api.projects.index.publishProject, { projectId: state.projectId });
    const adminId = await state.t.run((ctx) => ctx.db.insert("users", { accountType: "admin" }));
    await state.t.withIdentity({ subject: `${adminId}|test-session` }).mutation(api.admin.projects.approveProject, { projectId: state.projectId });
    expect((await snapshot(state)).project).toMatchObject({ city: "rabat", neighborhood: "Agdal", status: "published" });
    expect((await snapshot(state)).project).not.toHaveProperty("locationMode");
  });

  test.each(["draft", "needs_changes"] as const)("first all-empty structured save persists intent and reopens an old %s Project at Location", async (status) => {
    const state = await wizardFor(status, { city: "agadir", neighborhood: "Founty", lastCompletedStep: 6 });
    const before = await snapshot(state);
    await state.owner.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...clearLocation });
    expect(await snapshot(state)).toEqual({ ...before, project: {
      ...before.project, locationMode: "structured", updatedAt: expect.any(Number),
    } });
    const reopened = await state.owner.query(api.projects.index.getWizard, { projectId: state.projectId });
    expect(reopened.draft).toMatchObject({ locationMode: "structured", city: "agadir", neighborhood: "Founty", resumeStep: 2,
      location: { regionCode: null, provinceCode: null, communeName: null, localityName: null, legacyCity: null } });
    expect(isWizardLocationComplete(reopened.draft!)).toBe(false);
    const form = locationFormFromDraft(reopened.draft!);
    expect(form).toEqual({ regionCode: "", provinceCode: "", communeName: "", localityName: "" });
    expect(prepareStructuredLocationSave(form, "continue")).toMatchObject({ ok: false, field: "regionCode" });
    await expectUnchanged(state, () => state.owner.mutation(api.projects.index.publishProject, { projectId: state.projectId }), "PROJECT_INCOMPLETE");
  });

  test("changes and clears retain the marker, historical location and progress; completing geography permits both publication gates", async () => {
    const state = await wizardFor("needs_changes", { city: "agadir", neighborhood: "Founty", lastCompletedStep: 6 });
    for (const location of [completeLocation, clearLocation, { ...completeLocation, regionCode: "05", provinceCode: "05.081", localityName: "Aït Tamlil" }, clearLocation, completeLocation]) {
      await state.owner.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...location });
      const saved = await snapshot(state);
      expect(saved.project).toMatchObject({ locationMode: "structured", city: "agadir", neighborhood: "Founty", lastCompletedStep: 6, status: "needs_changes" });
      const reopened = await state.owner.query(api.projects.index.getWizard, { projectId: state.projectId });
      expect(reopened.draft?.locationMode).toBe("structured");
      expect(reopened.draft?.resumeStep).toBe(location.localityName ? 5 : 2);
      expect(isWizardLocationComplete(reopened.draft!)).toBe(Boolean(location.localityName));
      expect(saved.history).toEqual([]);
      expect(saved.activity).toHaveLength(1);
      expect(saved.notifications).toEqual([]);
    }
    await state.owner.mutation(api.projects.index.publishProject, { projectId: state.projectId });
    const adminId = await state.t.run((ctx) => ctx.db.insert("users", { accountType: "admin" }));
    await state.t.withIdentity({ subject: `${adminId}|test-session` }).mutation(api.admin.projects.approveProject, { projectId: state.projectId });
    const published = await snapshot(state);
    expect(published.project).toMatchObject({ locationMode: "structured", status: "published", city: "agadir", neighborhood: "Founty" });
    expect(published.history.map((row) => [row.oldStatus, row.newStatus])).toEqual([["needs_changes", "pending_review"], ["pending_review", "published"]]);
  });

  test.each(["empty", "complete", "fields without marker"] as const)("old browser saveLocation cannot restore legacy mode after %s structured conversion", async (shape) => {
    const state = await wizardFor("draft", { city: "agadir", neighborhood: "Founty", lastCompletedStep: 6 });
    const oldBrowser = state.t.withIdentity({ subject: `${state.ownerId}|old-browser-session` });
    if (shape === "fields without marker") {
      await state.t.run((ctx) => ctx.db.patch(state.projectId, { regionCode: "09" }));
    } else {
      await state.owner.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...(shape === "empty" ? clearLocation : completeLocation) });
    }
    await expectUnchanged(state, () => oldBrowser.mutation(api.projects.index.saveLocation, { projectId: state.projectId, city: "rabat", neighborhood: "Changed by old session" }), "PROJECT_STRUCTURED_LOCATION_REQUIRED");
  });

  test("Admin rejects a marked, cleared pending-review Project without history or activity changes", async () => {
    const state = await wizardFor("draft", { city: "agadir", neighborhood: "Founty" });
    await state.owner.mutation(api.projects.index.publishProject, { projectId: state.projectId });
    // Simulate a pending record that already lost its structured fields.
    await state.t.run((ctx) => ctx.db.patch(state.projectId, { locationMode: "structured" }));
    const adminId = await state.t.run((ctx) => ctx.db.insert("users", { accountType: "admin" }));
    const admin = state.t.withIdentity({ subject: `${adminId}|test-session` });
    await expectUnchanged(state, () => admin.mutation(api.admin.projects.approveProject, { projectId: state.projectId }), "PROJECT_INCOMPLETE");
    expect(await state.t.query(api.projects.index.getPublicProject, { projectId: state.projectId })).toBeNull();
    await admin.mutation(api.admin.projects.requestProjectChanges, { projectId: state.projectId, reason: "Complete the project location." });
    expect((await snapshot(state)).project?.status).toBe("needs_changes");
  });

  test.each([false, true])("invalid structured saves preserve marker state: already structured=%s", async (converted) => {
    const state = await wizardFor("draft", { city: "agadir", neighborhood: "Founty" });
    if (converted) await state.owner.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...clearLocation });
    await expectUnchanged(state, () => state.owner.mutation(api.projects.index.saveStructuredLocation, {
      projectId: state.projectId, ...completeLocation, provinceCode: "05.081",
    }), "PROJECT_PROVINCE_REGION_MISMATCH");
  });

  test.each(["other Client", "Company", "Admin", "anonymous"] as const)("unauthorized %s location writes cannot set or clear the marker", async (audience) => {
    for (const converted of [false, true]) {
      const state = await wizardFor("draft", { city: "agadir", neighborhood: "Founty" });
      if (converted) await state.owner.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...clearLocation });
      const accountType = audience === "Admin" ? "admin" : audience === "Company" ? "company" : "client";
      const caller = audience === "anonymous" ? state.t : state.t.withIdentity({
        subject: `${await state.t.run((ctx) => ctx.db.insert("users", { accountType, onboardingStatus: "completed" }))}|test-session`,
      });
      const code = audience === "anonymous" ? "NOT_AUTHENTICATED" : audience === "other Client" ? "PROJECT_NOT_FOUND" : "CLIENT_ACCOUNT_REQUIRED";
      await expectUnchanged(state, () => caller.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...clearLocation }), code);
      await expectUnchanged(state, () => caller.mutation(api.projects.index.saveLocation, { projectId: state.projectId, city: "rabat" }), code);
    }
  });

  test("editable-status guards still run before an old browser's mode check", async () => {
    const state = await wizardFor("draft", { city: "agadir" });
    await state.owner.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...completeLocation });
    await state.owner.mutation(api.projects.index.publishProject, { projectId: state.projectId });
    await expectUnchanged(state, () => state.owner.mutation(api.projects.index.saveLocation, { projectId: state.projectId, city: "rabat" }), "PROJECT_NOT_EDITABLE");
    await expectUnchanged(state, () => state.owner.mutation(api.projects.index.saveStructuredLocation, { projectId: state.projectId, ...clearLocation }), "PROJECT_NOT_EDITABLE");
  });
});
