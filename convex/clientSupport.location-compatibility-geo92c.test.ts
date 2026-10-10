/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DetailedProjectLocation } from "../lib/geography/project-location";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const support = api.clientSupport.index;
type Backend = TestConvex<typeof schema>;
const NOW = Date.parse("2026-10-09T12:00:00Z");
const page = { paginationOpts: { numItems: 1, cursor: null } };
const structured = {
  locationMode: "structured", regionCode: "08", provinceCode: "08.401",
  communeName: "  Skoura  ", localityName: "Douar Aït . <Atlas> & ⴰⵣⵓⵍ", neighborhood: "Ancien quartier",
} as const;
const emptyLocation: DetailedProjectLocation = {
  regionCode: null, provinceCode: null, communeName: null, legacyCity: null,
  localityName: null, neighborhood: null,
};
const structuredLocation: DetailedProjectLocation = {
  regionCode: "08", provinceCode: "08.401", communeName: "  Skoura  ", legacyCity: null,
  localityName: "Douar Aït . <Atlas> & ⴰⵣⵓⵍ", neighborhood: "Ancien quartier",
};
const cases: { name: string; fields: Partial<Doc<"projects">>; expected: DetailedProjectLocation }[] = [
  { name: "structured without city", fields: structured, expected: structuredLocation },
  { name: "legacy city only", fields: { city: "tangier" }, expected: { ...emptyLocation, legacyCity: "tangier" } },
  { name: "missing region", fields: { provinceCode: "08.401" }, expected: { ...emptyLocation, provinceCode: "08.401" } },
  { name: "missing province", fields: { regionCode: "08" }, expected: { ...emptyLocation, regionCode: "08" } },
  { name: "locality only", fields: { localityName: "دوار آيت أطلس" }, expected: { ...emptyLocation, localityName: "دوار آيت أطلس" } },
  { name: "empty history", fields: {}, expected: emptyLocation },
  { name: "unknown or mismatched codes", fields: { regionCode: "historical", provinceCode: "08.401" }, expected: { ...emptyLocation, regionCode: "historical", provinceCode: "08.401" } },
  { name: "structured with retained city", fields: { ...structured, city: "rabat" }, expected: structuredLocation },
];

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); });

function caller(t: Backend, id: Id<"users">) {
  return t.withIdentity({ subject: `${id}|test-session`, tokenIdentifier: `test|${id}` });
}

async function setup(fields: Partial<Doc<"projects">> = structured) {
  const t = convexTest(schema, modules);
  const users = await t.run(async ctx => {
    const user = (accountType: "client" | "admin" | "company" | "seo_team") => ctx.db.insert("users", {
      accountType, onboardingStatus: "completed", firstName: accountType, createdAt: 1, updatedAt: 1,
    });
    return {
      client: await user("client"), otherClient: await user("client"), admin: await user("admin"),
      company: await user("company"), staff: await user("company"), seo: await user("seo_team"),
    };
  });
  const projectId = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", {
      name: "PRIVATE_COMPANY_SENTINEL", verificationStatus: "verified", onboardingStatus: "completed",
      createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("companyMembers", { companyId, userId: users.company, role: "owner", status: "active", createdAt: 1 });
    await ctx.db.insert("companyMembers", { companyId, userId: users.staff, role: "staff", status: "active", createdAt: 1 });
    return ctx.db.insert("projects", {
      clientId: users.client, countryCode: "MA", title: "Rural project", surfaceUnknown: true,
      visibility: "invite_only", status: "published", lastCompletedStep: 5,
      description: "PRIVATE_DESCRIPTION_SENTINEL", createdAt: 1, updatedAt: 1, ...fields,
    });
  });
  return { t, ...users, projectId };
}
type State = Awaited<ReturnType<typeof setup>>;

async function open(s: State) {
  const owner = caller(s.t, s.client);
  const first = await owner.mutation(support.requestSupport, { projectId: s.projectId, requestKind: "free_help" });
  await owner.mutation(support.requestSupport, { projectId: s.projectId, requestKind: "coordination_discussion" });
  return first;
}

async function summaries(s: State) {
  return [
    await caller(s.t, s.client).query(support.getMyConversation, { projectId: s.projectId }),
    await caller(s.t, s.admin).query(support.getAdminConversation, { projectId: s.projectId }),
    ...(await caller(s.t, s.admin).query(support.listAdminConversations, page)).page,
  ];
}

async function snapshot(t: Backend) {
  // These are bounded in-memory fixtures, not production table scans.
  return t.run(async ctx => ({
    projects: await ctx.db.query("projects").collect(),
    threads: await ctx.db.query("clientSupportConversations").collect(),
    entries: await ctx.db.query("clientSupportMessages").collect(),
    reads: await ctx.db.query("clientSupportConversationReads").collect(),
    agreements: await ctx.db.query("coordinationAgreements").collect(),
    versions: await ctx.db.query("coordinationAgreementVersions").collect(),
    initialQuotes: await ctx.db.query("projectQuotes").collect(),
    finalQuotes: await ctx.db.query("finalQuotes").collect(),
    revisions: await ctx.db.query("finalQuoteRevisions").collect(),
    deals: await ctx.db.query("deals").collect(),
    commissionHistory: await ctx.db.query("commissionStatusHistory").collect(),
    commissionTotals: await ctx.db.query("companyCommissionSummaries").collect(),
    activity: await ctx.db.query("marketplaceActivity").collect(),
    notifications: await ctx.db.query("notifications").collect(),
    notificationState: await ctx.db.query("notificationRecipientStates").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

describe("GEO9.2C authorized OC3 location summaries", () => {
  test.each(cases)("$name preserves recorded geography and request history without read side effects", async ({ fields, expected }) => {
    const s = await setup(fields);
    const thread = await open(s);
    const before = await snapshot(s.t);
    for (const summary of await summaries(s)) {
      expect(summary?.project).toEqual({
        id: s.projectId, title: "Rural project", city: fields.city ?? null, location: expected, status: "published",
      });
      expect(summary?.requestedKinds).toEqual(["free_help", "coordination_discussion"]);
      expect(summary?.entryCount).toBe(2);
      expect(summary?.project).not.toHaveProperty("siteAddress");
    }
    for (const [role, reader] of [["client", caller(s.t, s.client)], ["admin", caller(s.t, s.admin)]] as const) {
      const history = await reader.query(role === "client" ? support.listMyMessages : support.listAdminMessages, {
        conversationId: thread.conversationId, paginationOpts: { numItems: 10, cursor: null },
      });
      expect(history.page.map(entry => [entry.sequence, entry.kind === "request" && entry.requestKind])).toEqual([
        [1, "free_help"], [2, "coordination_discussion"],
      ]);
      expect(history.page.every(entry => !Object.prototype.hasOwnProperty.call(entry, "location"))).toBe(true);
    }
    expect(await snapshot(s.t)).toEqual(before);
  });

  test("opening support readers without a request creates no conversation, agreement or notification", async () => {
    const s = await setup();
    const before = await snapshot(s.t);
    expect(await summaries(s)).toEqual([null, null]);
    expect(await snapshot(s.t)).toEqual(before);
  });

  test.each(["otherClient", "company", "staff", "seo", "anonymous"] as const)("%s cannot retrieve private OC3 location", async role => {
    const s = await setup(); await open(s);
    const reader = role === "anonymous" ? s.t : caller(s.t, s[role]);
    const before = await snapshot(s.t);
    await expect(reader.query(support.getMyConversation, { projectId: s.projectId })).rejects.toThrow();
    await expect(reader.query(support.getAdminConversation, { projectId: s.projectId })).rejects.toThrow();
    await expect(reader.query(support.listAdminConversations, page)).rejects.toThrow();
    expect(await snapshot(s.t)).toEqual(before);
  });

  test("Client and Admin location readers retain their separate role boundaries", async () => {
    const s = await setup(); await open(s);
    await expect(caller(s.t, s.admin).query(support.getMyConversation, { projectId: s.projectId })).rejects.toThrow("CLIENT_ACCOUNT_REQUIRED");
    await expect(caller(s.t, s.client).query(support.getAdminConversation, { projectId: s.projectId })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(caller(s.t, s.client).query(support.listAdminConversations, page)).rejects.toThrow("ADMIN_REQUIRED");
  });

  test("ownership mismatch exposes geography and history to neither owner nor Admin", async () => {
    const s = await setup(); await open(s);
    await s.t.run(ctx => ctx.db.patch(s.projectId, { clientId: s.otherClient }));
    for (const id of [s.client, s.otherClient]) {
      await expect(caller(s.t, id).query(support.getMyConversation, { projectId: s.projectId })).rejects.toThrow();
    }
    await expect(caller(s.t, s.admin).query(support.getAdminConversation, { projectId: s.projectId })).rejects.toThrow("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
    expect((await caller(s.t, s.admin).query(support.listAdminConversations, page)).page).toEqual([]);
  });

  test("revoked Admin permissions are rechecked on both geography readers", async () => {
    const s = await setup(); await open(s);
    await summaries(s);
    await s.t.run(ctx => ctx.db.patch(s.admin, { accountType: "company" }));
    await expect(caller(s.t, s.admin).query(support.getAdminConversation, { projectId: s.projectId })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(caller(s.t, s.admin).query(support.listAdminConversations, page)).rejects.toThrow("ADMIN_REQUIRED");
  });

  test("missing Client onboarding blocks historical location for both roles", async () => {
    const s = await setup(); await open(s);
    await s.t.run(ctx => ctx.db.patch(s.client, { onboardingStatus: "pending" }));
    await expect(caller(s.t, s.client).query(support.getMyConversation, { projectId: s.projectId })).rejects.toThrow();
    await expect(caller(s.t, s.admin).query(support.getAdminConversation, { projectId: s.projectId })).rejects.toThrow("CLIENT_SUPPORT_CONVERSATION_NOT_FOUND");
    expect((await caller(s.t, s.admin).query(support.listAdminConversations, page)).page).toEqual([]);
  });

  test("native inbox pagination keeps no-city and incomplete Projects and independent read positions", async () => {
    const s = await setup(); await open(s);
    const ids = [s.projectId];
    for (const fields of [{ city: "rabat" as const }, {}]) {
      const id = await s.t.run(ctx => ctx.db.insert("projects", {
        clientId: s.client, countryCode: "MA", surfaceUnknown: true, status: "archived",
        visibility: "invite_only", lastCompletedStep: 1, createdAt: 1, updatedAt: 1, ...fields,
      }));
      ids.push(id);
      await caller(s.t, s.client).mutation(support.requestSupport, { projectId: id, requestKind: "free_help" });
    }
    const before = await snapshot(s.t);
    const results: FunctionReturnType<typeof support.listAdminConversations>["page"] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 4; i++) {
      const result: FunctionReturnType<typeof support.listAdminConversations> = await caller(s.t, s.admin).query(support.listAdminConversations, { paginationOpts: { numItems: 1, cursor } });
      results.push(...result.page);
      if (result.isDone) break;
      expect(result.continueCursor).not.toBe(cursor);
      cursor = result.continueCursor;
    }
    expect(results.map(item => item.project.id).sort()).toEqual(ids.sort());
    expect(results.map(item => item.unreadCount).sort()).toEqual([1, 1, 2]);
    expect(results.every(item => item.readThroughSequence === 0 && Object.prototype.hasOwnProperty.call(item.project, "location"))).toBe(true);
    expect(await snapshot(s.t)).toEqual(before);
  });
});
