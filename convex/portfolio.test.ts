/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { deletePublicMediaObject, headPublicMediaObject } from "./storage/r2Client";

const modules = import.meta.glob("./**/*.ts");

vi.mock("./storage/r2Client", () => ({
  createPresignedPutUrl: vi.fn(async () => "https://upload.example.test/presigned"),
  headPublicMediaObject: vi.fn(async () => ({
    ContentType: "image/jpeg",
    ContentLength: 10,
    ETag: '"test-etag"',
  })),
  readPublicMediaSignature: vi.fn(async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
  deletePublicMediaObject: vi.fn(async () => undefined),
}));

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "batiplus-test";
  process.env.R2_ENDPOINT = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
});

type TestBackend = ReturnType<typeof convexTest>;

async function seedCompany(t: TestBackend, options?: {
  accountType?: "client" | "company";
  role?: "owner" | "staff";
  onboardingStatus?: "pending" | "completed";
  verificationStatus?: "draft" | "pending" | "verified" | "rejected";
  slug?: string;
}) {
  return await t.run(async (ctx) => {
    const now = 100;
    const userId = await ctx.db.insert("users", {
      email: `${crypto.randomUUID()}@example.test`,
      accountType: options?.accountType ?? "company",
      onboardingStatus: options?.onboardingStatus ?? "completed",
      createdAt: now,
      updatedAt: now,
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Atlas Bâtiment",
      legalName: "Atlas Bâtiment SARL",
      slug: options?.slug ?? `atlas-${crypto.randomUUID().slice(0, 8)}`,
      phone: "0612345678",
      city: "Agadir",
      description: "Entreprise spécialisée dans les travaux de construction et de rénovation.",
      yearsExperience: 12,
      website: "https://atlas.example/",
      onboardingStatus: options?.onboardingStatus ?? "completed",
      verificationStatus: options?.verificationStatus ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("companyMembers", {
      companyId,
      userId,
      role: options?.role ?? "owner",
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("companyServices", {
      companyId,
      service: "renovation",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, companyId };
  });
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function uploadedImage(t: TestBackend, userId: Id<"users">, kind: "cover" | "media" = "cover", mime = "image/jpeg") {
  return await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("companyMembers")
      .filter((q) => q.eq(q.field("userId"), userId))
      .unique();
    if (!membership) throw new Error("Missing test membership");
    const uploadToken = crypto.randomUUID();
    const objectKey = `companies/${membership.companyId}/portfolio/pending/${kind}/${crypto.randomUUID()}.jpg`;
    await ctx.db.insert("publicMediaUploadIntents", {
      companyId: membership.companyId,
      userId,
      purpose: kind === "cover" ? "portfolioCover" : "portfolioMedia",
      expectedContentType: mime,
      expectedSize: 10,
      objectKey,
      token: uploadToken,
      expiresAt: Date.now() + 60_000,
      verifiedAt: Date.now(),
      createdAt: Date.now(),
    });
    return { uploadToken };
  });
}

const fields = {
  title: "Villa contemporaine à Agadir",
  description: "Construction complète avec finitions intérieures et aménagement des espaces extérieurs.",
  city: "Agadir",
  projectType: "construction" as const,
  surface: 280,
  durationMonths: 14,
  year: 2025,
};

describe("public company profile", () => {
  test("loads only completed companies and exposes verified badge accurately", async () => {
    for (const verificationStatus of ["verified", "pending", "rejected"] as const) {
      const t = convexTest(schema, modules);
      const slug = `profile-${verificationStatus}`;
      await seedCompany(t, { slug, verificationStatus });
      const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug });
      expect(profile).toMatchObject({ slug, name: "Atlas Bâtiment", isVerified: verificationStatus === "verified" });
    }

    const t = convexTest(schema, modules);
    await seedCompany(t, { slug: "incomplete", onboardingStatus: "pending" });
    await expect(t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "missing" })).resolves.toBeNull();
    await expect(t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "incomplete" })).resolves.toBeNull();
  });
});

describe("portfolio management", () => {
  test("owner creates, updates, publishes, and exposes one valid realization", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t, { slug: "atlas-public", verificationStatus: "verified" });
    const owner = asUser(t, userId);
    const coverImage = await uploadedImage(t, userId);
    const projectId = await owner.mutation(api.portfolio.index.createPortfolioProject, {
      ...fields,
      coverImage,
      extraImages: [],
    });
    await owner.mutation(api.portfolio.index.updatePortfolioProject, {
      ...fields,
      projectId,
      title: "Villa contemporaine livrée",
      extraImages: [],
    });
    await owner.mutation(api.portfolio.index.publishPortfolioProject, { projectId });

    const manager = await owner.query(api.portfolio.index.getPortfolioManager, {});
    expect(manager.projects).toHaveLength(1);
    expect(manager.projects[0]).toMatchObject({ title: "Villa contemporaine livrée", status: "published" });
    const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "atlas-public" });
    expect(profile?.portfolio).toHaveLength(1);
    expect(profile?.portfolio[0]).toMatchObject({ id: projectId, status: "published" });
  });

  test("client, staff, and another company cannot manage an owner portfolio", async () => {
    const t = convexTest(schema, modules);
    const first = await seedCompany(t, { slug: "first-company" });
    const second = await seedCompany(t, { slug: "second-company" });
    const client = await seedCompany(t, { accountType: "client", slug: "client-foundation" });
    const staff = await seedCompany(t, { role: "staff", slug: "staff-company" });
    const coverImage = await uploadedImage(t, first.userId);
    const projectId = await asUser(t, first.userId).mutation(api.portfolio.index.createPortfolioProject, { ...fields, coverImage, extraImages: [] });

    await expect(asUser(t, second.userId).mutation(api.portfolio.index.publishPortfolioProject, { projectId })).rejects.toThrow("PORTFOLIO_PROJECT_NOT_FOUND");
    await expect(asUser(t, client.userId).query(api.portfolio.index.getPortfolioManager, {})).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    await expect(asUser(t, staff.userId).query(api.portfolio.index.getPortfolioManager, {})).rejects.toThrow("COMPANY_OWNER_REQUIRED");
    await expect(t.query(api.portfolio.index.getPortfolioManager, {})).rejects.toThrow("NOT_AUTHENTICATED");
  });

  test("upload permission rejects unauthenticated, client, staff, and cross-company callers", async () => {
    const t = convexTest(schema, modules);
    const ownerCompany = await seedCompany(t, { slug: "upload-target" });
    const other = await seedCompany(t, { slug: "upload-other" });
    const client = await seedCompany(t, { accountType: "client", slug: "upload-client" });
    const staff = await seedCompany(t, { role: "staff", slug: "upload-staff" });
    const projectId = await asUser(t, ownerCompany.userId).mutation(api.portfolio.index.createPortfolioProject, {
      ...fields,
      coverImage: await uploadedImage(t, ownerCompany.userId),
      extraImages: [],
    });
    const args = { purpose: "portfolioMedia" as const, contentType: "image/jpeg", size: 10, portfolioProjectId: projectId };

    await expect(t.action(api.storage.r2.requestPublicMediaUpload, args)).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(asUser(t, client.userId).action(api.storage.r2.requestPublicMediaUpload, args)).rejects.toThrow("COMPANY_ACCOUNT_REQUIRED");
    await expect(asUser(t, staff.userId).action(api.storage.r2.requestPublicMediaUpload, args)).rejects.toThrow("COMPANY_OWNER_REQUIRED");
    await expect(asUser(t, other.userId).action(api.storage.r2.requestPublicMediaUpload, args)).rejects.toThrow("PORTFOLIO_PROJECT_NOT_FOUND");
  });

  test("a valid signed upload is HEAD-verified before cover and gallery metadata are saved", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, { slug: "verified-upload" });
    const owner = asUser(t, userId);
    const request = async (purpose: "portfolioCover" | "portfolioMedia") => {
      const intent = await owner.action(api.storage.r2.requestPublicMediaUpload, {
        purpose,
        contentType: "image/jpeg",
        size: 10,
      });
      await owner.action(api.storage.r2.verifyPublicMediaUpload, { uploadToken: intent.uploadToken });
      return { uploadToken: intent.uploadToken };
    };
    const projectId = await owner.mutation(api.portfolio.index.createPortfolioProject, {
      ...fields,
      coverImage: await request("portfolioCover"),
      extraImages: [{ ...(await request("portfolioMedia")), caption: "Façade terminée" }],
    });
    const state = await t.run(async (ctx) => ({
      project: await ctx.db.get(projectId),
      media: await ctx.db
        .query("portfolioMedia")
        .filter((q) => q.eq(q.field("portfolioProjectId"), projectId))
        .collect(),
      publicMedia: await ctx.db
        .query("publicMedia")
        .filter((q) => q.eq(q.field("companyId"), companyId))
        .collect(),
    }));
    expect(state.project?.coverMediaId).toBeDefined();
    expect(state.media).toHaveLength(1);
    expect(state.media[0]).toMatchObject({ sortOrder: 0, caption: "Façade terminée" });
    expect(state.publicMedia).toHaveLength(2);
    expect(state.publicMedia.every((item) => item.storageProvider === "r2")).toBe(true);
  });

  test("does not attach media when the R2 object cannot be found", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t, { slug: "missing-r2-object" });
    const owner = asUser(t, userId);
    const intent = await owner.action(api.storage.r2.requestPublicMediaUpload, {
      purpose: "portfolioCover",
      contentType: "image/jpeg",
      size: 10,
    });
    vi.mocked(headPublicMediaObject).mockRejectedValueOnce(new Error("NoSuchKey"));
    await expect(owner.action(api.storage.r2.verifyPublicMediaUpload, {
      uploadToken: intent.uploadToken,
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
    await expect(owner.mutation(api.portfolio.index.createPortfolioProject, {
      ...fields,
      coverImage: { uploadToken: intent.uploadToken },
      extraImages: [],
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
  });

  test("upload intents are owner-bound, single-use, typed, and reject duplicate image records", async () => {
    const t = convexTest(schema, modules);
    const first = await seedCompany(t, { slug: "upload-owner" });
    const second = await seedCompany(t, { slug: "upload-attacker" });
    const image = await uploadedImage(t, first.userId);

    await expect(asUser(t, second.userId).mutation(api.portfolio.index.createPortfolioProject, {
      ...fields, coverImage: image, extraImages: [],
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");

    await expect(asUser(t, second.userId).mutation(api.portfolio.index.createPortfolioProject, {
      ...fields,
      coverImage: { uploadToken: image.uploadToken },
      extraImages: [],
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");

    const owner = asUser(t, first.userId);
    const projectId = await owner.mutation(api.portfolio.index.createPortfolioProject, { ...fields, coverImage: image, extraImages: [] });
    await expect(owner.mutation(api.portfolio.index.createPortfolioProject, { ...fields, coverImage: image, extraImages: [] })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");

    await expect(owner.action(api.storage.r2.requestPublicMediaUpload, {
      purpose: "portfolioCover",
      contentType: "text/plain",
      size: 10,
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
    await expect(owner.action(api.storage.r2.requestPublicMediaUpload, {
      purpose: "portfolioCover",
      contentType: "image/jpeg",
      size: 10 * 1024 * 1024 + 1,
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");

    const duplicateCover = await uploadedImage(t, first.userId);
    await expect(owner.mutation(api.portfolio.index.createPortfolioProject, {
      ...fields,
      coverImage: duplicateCover,
      extraImages: [{ ...duplicateCover }],
    })).rejects.toThrow("INVALID_PORTFOLIO_IMAGE");

    const duplicateMedia = await uploadedImage(t, first.userId, "media");
    await expect(owner.mutation(api.portfolio.index.updatePortfolioProject, {
      ...fields,
      projectId,
      extraImages: [duplicateMedia, duplicateMedia],
    })).rejects.toThrow("INVALID_PORTFOLIO_IMAGE");
  });

  test("replaces a cover before deleting the now-unreferenced old R2 object", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t, { slug: "replace-cover" });
    const owner = asUser(t, userId);
    const projectId = await owner.mutation(api.portfolio.index.createPortfolioProject, {
      ...fields,
      coverImage: await uploadedImage(t, userId),
      extraImages: [],
    });
    const before = await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId);
      return project?.coverMediaId ? await ctx.db.get(project.coverMediaId) : null;
    });
    await owner.mutation(api.portfolio.index.updatePortfolioProject, {
      ...fields,
      projectId,
      coverImage: await uploadedImage(t, userId),
      extraImages: [],
    });
    const after = await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId);
      return {
        cover: project?.coverMediaId ? await ctx.db.get(project.coverMediaId) : null,
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      };
    });
    expect(after.cover?._id).not.toBe(before?._id);
    expect(before ? await t.run((ctx) => ctx.db.get(before._id)) : null).toBeNull();
    expect(after.scheduled).toHaveLength(1);
    expect(after.scheduled[0].name).toContain("storage/r2:deleteObjectIfUnreferenced");
  });

  test("rejects expired, unverified, and reused upload intents", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, { slug: "intent-security" });
    const owner = asUser(t, userId);
    const makeIntent = async (options: { expired?: boolean; verified?: boolean }) => await t.run(async (ctx) => {
      const token = crypto.randomUUID();
      await ctx.db.insert("publicMediaUploadIntents", {
        companyId,
        userId,
        purpose: "portfolioCover",
        expectedContentType: "image/jpeg",
        expectedSize: 10,
        objectKey: `companies/${companyId}/portfolio/pending/cover/${crypto.randomUUID()}.jpg`,
        token,
        expiresAt: options.expired ? Date.now() - 1 : Date.now() + 60_000,
        verifiedAt: options.verified ? Date.now() : undefined,
        createdAt: Date.now(),
      });
      return { uploadToken: token };
    });

    await expect(owner.mutation(api.portfolio.index.createPortfolioProject, {
      ...fields, coverImage: await makeIntent({ expired: true, verified: true }), extraImages: [],
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
    await expect(owner.mutation(api.portfolio.index.createPortfolioProject, {
      ...fields, coverImage: await makeIntent({ verified: false }), extraImages: [],
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");

    const reusable = await uploadedImage(t, userId);
    await owner.mutation(api.portfolio.index.createPortfolioProject, { ...fields, coverImage: reusable, extraImages: [] });
    await expect(owner.mutation(api.portfolio.index.createPortfolioProject, {
      ...fields, coverImage: reusable, extraImages: [],
    })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
  });

  test("cleans up an expired unclaimed R2 upload intent", async () => {
    const t = convexTest(schema, modules);
    const { userId, companyId } = await seedCompany(t, { slug: "orphan-cleanup" });
    const uploadToken = crypto.randomUUID();
    const objectKey = `companies/${companyId}/portfolio/pending/media/${crypto.randomUUID()}.jpg`;
    await t.run((ctx) => ctx.db.insert("publicMediaUploadIntents", {
      companyId,
      userId,
      purpose: "portfolioMedia",
      expectedContentType: "image/jpeg",
      expectedSize: 10,
      objectKey,
      token: uploadToken,
      expiresAt: Date.now() - 1,
      createdAt: Date.now() - 60_000,
    }));
    vi.mocked(deletePublicMediaObject).mockClear();
    await t.action(internal.storage.r2.cleanupExpiredUploadIntent, { uploadToken });
    const remaining = await t.run((ctx) => ctx.db
      .query("publicMediaUploadIntents")
      .filter((q) => q.eq(q.field("token"), uploadToken))
      .collect());
    expect(remaining).toHaveLength(0);
    expect(deletePublicMediaObject).toHaveBeenCalledWith(objectKey);
  });

  test("keeps legacy Convex Storage portfolio images readable", async () => {
    const t = convexTest(schema, modules);
    const { companyId } = await seedCompany(t, { slug: "legacy-storage" });
    const legacyStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["legacy"], { type: "image/jpeg" })));
    await t.run((ctx) => ctx.db.insert("portfolioProjects", {
      companyId,
      title: fields.title,
      description: fields.description,
      city: fields.city,
      projectType: fields.projectType,
      coverImageStorageId: legacyStorageId,
      status: "published",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "legacy-storage" });
    expect(profile?.portfolio).toHaveLength(1);
    expect(profile?.portfolio[0].coverImageUrl).toContain("http");
  });

  test("archived and draft realizations never appear publicly", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedCompany(t, { slug: "private-work" });
    const owner = asUser(t, userId);
    const coverImage = await uploadedImage(t, userId);
    const projectId = await owner.mutation(api.portfolio.index.createPortfolioProject, { ...fields, coverImage, extraImages: [] });
    expect((await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "private-work" }))?.portfolio).toHaveLength(0);
    await owner.mutation(api.portfolio.index.publishPortfolioProject, { projectId });
    await owner.mutation(api.portfolio.index.archivePortfolioProject, { projectId });
    expect((await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "private-work" }))?.portfolio).toHaveLength(0);
  });
});
