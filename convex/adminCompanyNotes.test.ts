/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as companyNotes from "./admin/companyNotes";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
}

async function seedUser(
  t: Backend,
  accountType: "admin" | "client" | "company" | "seo_team",
  name: string,
) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${name.toLowerCase()}-${crypto.randomUUID()}@notes.test`,
    firstName: name,
    lastName: "Test",
    accountType,
    onboardingStatus: "completed",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function seedCompany(t: Backend, name: string, slug: string) {
  return await t.run((ctx) => ctx.db.insert("companies", {
    name,
    legalName: `${name} SARL`,
    slug,
    city: "Rabat",
    description: "A public company description with enough detail.",
    onboardingStatus: "completed",
    verificationStatus: "verified",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function setup() {
  const t = convexTest(schema, modules);
  const adminA = await seedUser(t, "admin", "Ada");
  const adminB = await seedUser(t, "admin", "Yassin");
  const owner = await seedUser(t, "company", "Owner");
  const client = await seedUser(t, "client", "Client");
  const seo = await seedUser(t, "seo_team", "SEO");
  const companyId = await seedCompany(t, "Atlas Build", "atlas-build-notes");
  const otherCompanyId = await seedCompany(t, "Rif Build", "rif-build-notes");
  await t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId,
    userId: owner,
    role: "owner",
    status: "active",
    createdAt: 1,
  }));
  return { t, adminA, adminB, owner, client, seo, companyId, otherCompanyId };
}

const page = (numItems = 20, cursor: string | null = null) => ({
  paginationOpts: { numItems, cursor },
});

describe("Company Admin notes", () => {
  test("Admins create trimmed notes with a server-derived author and other Admins list them", async () => {
    const state = await setup();
    const created = await asUser(state.t, state.adminA).mutation(
      api.admin.companyNotes.createCompanyAdminNote,
      { companyId: state.companyId, body: "  Requested updated RC document.\nPlease verify on receipt.  " },
    );
    expect(created).toMatchObject({
      body: "Requested updated RC document.\nPlease verify on receipt.",
      authorDisplayName: "Ada Test",
    });

    const listed = await asUser(state.t, state.adminB).query(
      api.admin.companyNotes.listCompanyAdminNotes,
      { companyId: state.companyId, ...page() },
    );
    expect(listed.page).toEqual([created]);
    const stored = await state.t.run((ctx) => ctx.db.get(created.id));
    expect(stored).toMatchObject({
      companyId: state.companyId,
      authorAdminUserId: state.adminA,
      body: created.body,
    });
    expect(JSON.stringify(created)).not.toContain("@notes.test");
  });

  test("denies anonymous, Company, Client, and SEO reads and writes", async () => {
    const state = await setup();
    const callers = [state.owner, state.client, state.seo];
    await expect(state.t.query(api.admin.companyNotes.listCompanyAdminNotes, {
      companyId: state.companyId,
      ...page(),
    })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(state.t.mutation(api.admin.companyNotes.createCompanyAdminNote, {
      companyId: state.companyId,
      body: "Anonymous note",
    })).rejects.toThrow("NOT_AUTHENTICATED");
    for (const userId of callers) {
      await expect(asUser(state.t, userId).query(
        api.admin.companyNotes.listCompanyAdminNotes,
        { companyId: state.companyId, ...page() },
      )).rejects.toThrow("ADMIN_REQUIRED");
      await expect(asUser(state.t, userId).mutation(
        api.admin.companyNotes.createCompanyAdminNote,
        { companyId: state.companyId, body: "Forbidden note" },
      )).rejects.toThrow("ADMIN_REQUIRED");
    }
  });

  test("rejects invalid Companies and invalid body or page bounds", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminA);
    const missingCompany = await seedCompany(state.t, "Deleted Company", "deleted-company");
    await state.t.run((ctx) => ctx.db.delete(missingCompany));
    await expect(admin.mutation(api.admin.companyNotes.createCompanyAdminNote, {
      companyId: missingCompany,
      body: "Valid note",
    })).rejects.toThrow("COMPANY_NOT_FOUND");
    await expect(admin.query(api.admin.companyNotes.listCompanyAdminNotes, {
      companyId: missingCompany,
      ...page(),
    })).rejects.toThrow("COMPANY_NOT_FOUND");
    for (const body of ["", "   ", "x".repeat(5_001)]) {
      await expect(admin.mutation(api.admin.companyNotes.createCompanyAdminNote, {
        companyId: state.companyId,
        body,
      })).rejects.toThrow("INVALID_COMPANY_ADMIN_NOTE_BODY");
    }
    for (const numItems of [0, 31, 1.5, Number.NaN]) {
      await expect(admin.query(api.admin.companyNotes.listCompanyAdminNotes, {
        companyId: state.companyId,
        ...page(numItems),
      })).rejects.toThrow("INVALID_COMPANY_ADMIN_NOTE_PAGE_SIZE");
    }
  });

  test("paginates newest first without crossing the Company boundary", async () => {
    const state = await setup();
    const admin = asUser(state.t, state.adminA);
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300).mockReturnValueOnce(400);
    await admin.mutation(api.admin.companyNotes.createCompanyAdminNote, { companyId: state.companyId, body: "oldest" });
    await admin.mutation(api.admin.companyNotes.createCompanyAdminNote, { companyId: state.otherCompanyId, body: "OTHER-COMPANY-SENTINEL" });
    await admin.mutation(api.admin.companyNotes.createCompanyAdminNote, { companyId: state.companyId, body: "middle" });
    await admin.mutation(api.admin.companyNotes.createCompanyAdminNote, { companyId: state.companyId, body: "newest" });
    now.mockRestore();

    const first = await admin.query(api.admin.companyNotes.listCompanyAdminNotes, {
      companyId: state.companyId,
      ...page(2),
    });
    expect(first.page.map((note) => note.body)).toEqual(["newest", "middle"]);
    expect(first.isDone).toBe(false);
    const second = await admin.query(api.admin.companyNotes.listCompanyAdminNotes, {
      companyId: state.companyId,
      ...page(2, first.continueCursor),
    });
    expect(second.page.map((note) => note.body)).toEqual(["oldest"]);
    expect(JSON.stringify([first, second])).not.toContain("OTHER-COMPANY-SENTINEL");
  });

  test("keeps an internal-note sentinel out of Company, public, messaging, activity, and notifications DTOs", async () => {
    const state = await setup();
    const sentinel = "INTERNAL-ONLY-SENTINEL-123";
    await asUser(state.t, state.adminA).mutation(api.admin.companyNotes.createCompanyAdminNote, {
      companyId: state.companyId,
      body: sentinel,
    });
    const outputs = await Promise.all([
      asUser(state.t, state.owner).query(api.companies.index.getOnboardingProfile, {}),
      asUser(state.t, state.owner).query(api.companies.index.getProfileManager, {}),
      state.t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "atlas-build-notes" }),
      asUser(state.t, state.owner).query(api.adminCompanyMessaging.getMyConversation, {}),
      asUser(state.t, state.adminA).query(api.admin.companyActivity.listCompanyActivity, {
        companyId: state.companyId,
        ...page(),
      }),
      asUser(state.t, state.owner).query(api.notifications.index.listMyNotifications, page()),
      asUser(state.t, state.seo).query(api.seo.index.getSeoSession, {}),
    ]);
    expect(JSON.stringify(outputs)).not.toContain(sentinel);
    const separated = await state.t.run(async (ctx) => ({
      operationalMessages: await ctx.db.query("adminCompanyMessages").take(10),
      marketplaceActivity: await ctx.db.query("marketplaceActivity").take(10),
      notifications: await ctx.db.query("notifications").take(10),
    }));
    expect(separated).toEqual({
      operationalMessages: [],
      marketplaceActivity: [],
      notifications: [],
    });
  });

  test("exposes only create and list operations for the append-only feature", () => {
    expect(Object.keys(companyNotes).sort()).toEqual([
      "createCompanyAdminNote",
      "listCompanyAdminNotes",
    ]);
  });
});
