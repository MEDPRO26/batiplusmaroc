/**
 * DEVELOPMENT-ONLY project marketplace seed.
 *
 * The deployment must explicitly opt in with ALLOW_DEV_PROJECT_SEED=true.
 * Seed ownership is identified by a dedicated internal-only client plus the
 * exact stable title set below, so no production schema field is required.
 */
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  budgetValues,
  marketplaceBudgetRank,
  projectBudgetRanges,
  projectCategories,
  projectCities,
  projectPropertyTypes,
  projectTimelines,
} from "../projects/constants";
import { buildProjectMarketplaceSearchText } from "../projects/marketplaceSearch";
import { assertProjectTransition } from "../projects/state";

export const PROJECT_SEED_KEY = "batiplus-project-seed-v1";
export const PROJECT_SEED_CLIENT_EMAIL = `${PROJECT_SEED_KEY}-client@seed.invalid`;
export const PROJECT_SEED_ADMIN_EMAIL = `${PROJECT_SEED_KEY}-admin@seed.invalid`;

type SeedStatus = "published" | "pending_review" | "draft";
type SeedProject = {
  title: string;
  description: string;
  city: (typeof projectCities)[number];
  neighborhood: string;
  category: (typeof projectCategories)[number];
  propertyType: (typeof projectPropertyTypes)[number];
  surface: number;
  budgetRange: Exclude<(typeof projectBudgetRanges)[number], "unknown">;
  timeline: (typeof projectTimelines)[number];
  status: SeedStatus;
};

export const SEED_PROJECTS: readonly SeedProject[] = [
  {
    title: "Villa R+1 construction in Agadir",
    description: "Construction complète d'une villa R+1 contemporaine avec gros œuvre, étanchéité et finitions durables.",
    city: "agadir", neighborhood: "Founty", category: "houseConstruction", propertyType: "house",
    surface: 310, budgetRange: "500000_1000000", timeline: "six_plus_months", status: "published",
  },
  {
    title: "120 m² apartment renovation in Casablanca",
    description: "Rénovation complète d'un appartement à Maârif avec redistribution des pièces, cuisine et salles de bain.",
    city: "casablanca", neighborhood: "Maârif", category: "renovation", propertyType: "apartment",
    surface: 120, budgetRange: "100000_250000", timeline: "one_to_three_months", status: "published",
  },
  {
    title: "Structural work for R+3 building in Rabat",
    description: "Réalisation des fondations, poteaux, poutres et dalles en béton armé pour un immeuble résidentiel R+3.",
    city: "rabat", neighborhood: "Hay Riad", category: "buildingConstruction", propertyType: "building",
    surface: 760, budgetRange: "1000000_plus", timeline: "six_plus_months", status: "published",
  },
  {
    title: "Complete electrical renovation of a Marrakech riad",
    description: "Remise aux normes du tableau, recâblage complet, éclairage décoratif et préparation domotique d'un riad.",
    city: "marrakech", neighborhood: "Médina", category: "electrical", propertyType: "house",
    surface: 280, budgetRange: "100000_250000", timeline: "one_to_three_months", status: "published",
  },
  {
    title: "Swimming pool construction in Tangier",
    description: "Construction d'une piscine familiale en béton, local technique, filtration et plage antidérapante.",
    city: "tangier", neighborhood: "Malabata", category: "pool", propertyType: "house",
    surface: 55, budgetRange: "250000_500000", timeline: "three_to_six_months", status: "published",
  },
  {
    title: "Office interior fit-out in Fez",
    description: "Aménagement d'un plateau de bureaux avec cloisons acoustiques, faux plafonds et espaces collaboratifs.",
    city: "fes", neighborhood: "Ville Nouvelle", category: "interior", propertyType: "office",
    surface: 240, budgetRange: "250000_500000", timeline: "three_to_six_months", status: "published",
  },
  {
    title: "Plumbing renewal for Casablanca apartment block",
    description: "Remplacement des colonnes d'eau, évacuations et équipements sanitaires d'un immeuble occupé.",
    city: "casablanca", neighborhood: "Bourgogne", category: "plumbing", propertyType: "building",
    surface: 900, budgetRange: "500000_1000000", timeline: "three_to_six_months", status: "published",
  },
  {
    title: "Exterior painting for coastal villa in Agadir",
    description: "Préparation des façades, traitement des fissures et peinture extérieure résistante à l'air marin.",
    city: "agadir", neighborhood: "Sonaba", category: "painting", propertyType: "house",
    surface: 360, budgetRange: "under_50000", timeline: "asap", status: "published",
  },
  {
    title: "Luxury finishing for Palmeraie villa",
    description: "Second œuvre haut de gamme comprenant plâtre, revêtements, menuiseries intérieures et finitions décoratives.",
    city: "marrakech", neighborhood: "Palmeraie", category: "finishing", propertyType: "house",
    surface: 420, budgetRange: "500000_1000000", timeline: "three_to_six_months", status: "published",
  },
  {
    title: "Foundation reinforcement in Hay Riad",
    description: "Diagnostic puis renforcement localisé des fondations et voiles porteurs d'une maison en extension.",
    city: "rabat", neighborhood: "Hay Riad", category: "structural", propertyType: "house",
    surface: 260, budgetRange: "250000_500000", timeline: "one_to_three_months", status: "published",
  },
  {
    title: "R+4 residential building in Malabata",
    description: "Construction tous corps d'état d'un immeuble R+4 avec parking, ascenseur et terrasses communes.",
    city: "tangier", neighborhood: "Malabata", category: "buildingConstruction", propertyType: "building",
    surface: 1350, budgetRange: "1000000_plus", timeline: "six_plus_months", status: "published",
  },
  {
    title: "Traditional townhouse renovation in Fez Medina",
    description: "Restauration d'une maison traditionnelle avec conservation des zelliges, bois sculpté et ventilation naturelle.",
    city: "fes", neighborhood: "Médina", category: "renovation", propertyType: "house",
    surface: 190, budgetRange: "250000_500000", timeline: "three_to_six_months", status: "published",
  },
  {
    title: "Retail showroom interior in Casablanca",
    description: "Conception et réalisation d'un showroom avec mobilier intégré, éclairage commercial et parcours client.",
    city: "casablanca", neighborhood: "Aïn Sebaâ", category: "interior", propertyType: "shop",
    surface: 320, budgetRange: "250000_500000", timeline: "one_to_three_months", status: "published",
  },
  {
    title: "Villa plumbing and solar hot water in Agadir",
    description: "Installation sanitaire complète, réseau multicouche et chauffe-eau solaire pour une villa familiale.",
    city: "agadir", neighborhood: "Hay Mohammadi", category: "plumbing", propertyType: "house",
    surface: 280, budgetRange: "100000_250000", timeline: "one_to_three_months", status: "published",
  },
  {
    title: "Boutique hotel painting and plaster repair",
    description: "Réparation des enduits et remise en peinture intérieure d'un hôtel avec phasage pour maintenir l'activité.",
    city: "marrakech", neighborhood: "Guéliz", category: "painting", propertyType: "building",
    surface: 620, budgetRange: "100000_250000", timeline: "one_to_three_months", status: "published",
  },
  {
    title: "Contemporary villa construction in Souissi",
    description: "Construction clé en main d'une villa contemporaine avec sous-sol, isolation performante et jardin aménagé.",
    city: "rabat", neighborhood: "Souissi", category: "houseConstruction", propertyType: "house",
    surface: 480, budgetRange: "1000000_plus", timeline: "six_plus_months", status: "published",
  },
  {
    title: "Bay-view apartment renovation in Tangier",
    description: "Rénovation d'un appartement avec ouverture de la cuisine, isolation phonique et nouvelles menuiseries.",
    city: "tangier", neighborhood: "Marchan", category: "renovation", propertyType: "apartment",
    surface: 145, budgetRange: "100000_250000", timeline: "one_to_three_months", status: "pending_review",
  },
  {
    title: "Electrical upgrade for artisan workshop in Fez",
    description: "Mise à niveau électrique d'un atelier avec circuit triphasé, protections et éclairage de sécurité.",
    city: "fes", neighborhood: "Aïn Nokbi", category: "electrical", propertyType: "shop",
    surface: 180, budgetRange: "50000_100000", timeline: "within_1_month", status: "pending_review",
  },
  {
    title: "Office finishing package in Sidi Maarouf",
    description: "Projet de finitions pour bureaux comprenant faux plafond, sols techniques et peinture intérieure.",
    city: "casablanca", neighborhood: "Sidi Maarouf", category: "finishing", propertyType: "office",
    surface: 510, budgetRange: "250000_500000", timeline: "flexible", status: "draft",
  },
  {
    title: "Compact courtyard pool in Agadir",
    description: "Projet de petite piscine sur mesure avec banquette immergée, filtration compacte et terrasse en pierre.",
    city: "agadir", neighborhood: "Talborjt", category: "pool", propertyType: "house",
    surface: 32, budgetRange: "100000_250000", timeline: "flexible", status: "draft",
  },
] as const;

const seedTitles = new Set(SEED_PROJECTS.map((project) => project.title));

function assertDevSeedAllowed(confirmDevSeed: boolean) {
  if (!confirmDevSeed) throw new ConvexError("confirmDevSeed=true is required");
  if (process.env.ALLOW_DEV_PROJECT_SEED !== "true") {
    throw new ConvexError("ALLOW_DEV_PROJECT_SEED=true is required on the development deployment");
  }
}

function assertFixtureIntegrity() {
  const counts = { published: 0, pending_review: 0, draft: 0 };
  for (const project of SEED_PROJECTS) counts[project.status] += 1;
  if (
    SEED_PROJECTS.length !== 20 || seedTitles.size !== 20 ||
    counts.published !== 16 || counts.pending_review !== 2 || counts.draft !== 2
  ) {
    throw new ConvexError("Invalid project seed fixture");
  }
}

async function getOrCreateSeedUser(
  ctx: MutationCtx,
  options: { email: string; firstName: string; lastName: string; accountType: "client" | "admin" },
) {
  const existing = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", options.email)).unique();
  if (existing) {
    if (
      existing.accountType !== options.accountType || existing.firstName !== options.firstName ||
      existing.lastName !== options.lastName
    ) {
      throw new ConvexError(`Seed identity collision for ${options.email}`);
    }
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("users", {
    email: options.email,
    firstName: options.firstName,
    lastName: options.lastName,
    accountType: options.accountType,
    onboardingStatus: "completed",
    countryCode: "MA",
    termsAcceptedAt: now,
    marketingOptIn: false,
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureSeedClientProfile(ctx: MutationCtx, userId: Id<"users">) {
  const profiles = await ctx.db.query("clientProfiles").withIndex("by_userId", (q) => q.eq("userId", userId)).take(2);
  if (profiles.length > 1) throw new ConvexError("Duplicate seed client profile");
  if (profiles[0]) {
    if (profiles[0].onboardingStatus !== "completed") throw new ConvexError("Seed client profile collision");
    return;
  }
  const now = Date.now();
  await ctx.db.insert("clientProfiles", {
    userId,
    city: "Rabat",
    onboardingStatus: "completed",
    createdAt: now,
    updatedAt: now,
  });
}

function projectDocument(project: SeedProject, clientId: Id<"users">, index: number, now: number) {
  const budget = budgetValues[project.budgetRange];
  const createdAt = now - (SEED_PROJECTS.length - index) * 86_400_000;
  const submittedAt = createdAt + 3_600_000;
  const publishedAt = submittedAt + 3_600_000;
  const document = {
    clientId,
    primaryCategory: project.category,
    city: project.city,
    neighborhood: project.neighborhood,
    countryCode: "MA" as const,
    title: project.title,
    propertyType: project.propertyType,
    surface: project.surface,
    surfaceUnknown: false,
    description: project.description,
    budgetRange: project.budgetRange,
    budgetMin: budget.min,
    budgetMax: "max" in budget ? budget.max : undefined,
    budgetUnknown: budget.unknown,
    timeline: project.timeline,
    visibility: "marketplace" as const,
    status: project.status,
    lastCompletedStep: 6,
    createdAt,
    updatedAt: project.status === "draft" ? createdAt : project.status === "pending_review" ? submittedAt : publishedAt,
    submittedAt: project.status === "draft" ? undefined : submittedAt,
    publishedAt: project.status === "published" ? publishedAt : undefined,
  };
  return {
    ...document,
    marketplaceSearchText: buildProjectMarketplaceSearchText(document),
    marketplaceBudgetRank: marketplaceBudgetRank(project.budgetRange),
  };
}

const statusDistributionValidator = v.object({
  published: v.number(), pending_review: v.number(), draft: v.number(),
});

export const seedDemoProjects = internalMutation({
  args: { confirmDevSeed: v.boolean() },
  returns: v.object({
    createdProjects: v.number(), skippedProjects: v.number(), createdHistory: v.number(),
    statusDistribution: statusDistributionValidator,
    cities: v.array(v.string()), categories: v.array(v.string()),
    seedClientId: v.id("users"), seedAdminId: v.id("users"), projectIds: v.array(v.id("projects")),
  }),
  handler: async (ctx, args) => {
    assertDevSeedAllowed(args.confirmDevSeed);
    assertFixtureIntegrity();
    const clientId = await getOrCreateSeedUser(ctx, {
      email: PROJECT_SEED_CLIENT_EMAIL, firstName: "Batiplus", lastName: "Seed Client", accountType: "client",
    });
    const adminId = await getOrCreateSeedUser(ctx, {
      email: PROJECT_SEED_ADMIN_EMAIL, firstName: "Batiplus", lastName: "Seed Admin", accountType: "admin",
    });
    await ensureSeedClientProfile(ctx, clientId);

    const existing = await ctx.db.query("projects").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(21);
    if (existing.length > 20 || existing.some((project) => !project.title || !seedTitles.has(project.title))) {
      throw new ConvexError("Seed client owns unexpected projects; refusing to continue");
    }
    const existingByTitle = new Map(existing.map((project) => [project.title, project]));
    let createdProjects = 0;
    let skippedProjects = 0;
    let createdHistory = 0;
    const projectIds: Id<"projects">[] = [];
    const now = Date.now();

    for (const [index, fixture] of SEED_PROJECTS.entries()) {
      const found = existingByTitle.get(fixture.title);
      if (found) {
        projectIds.push(found._id);
        skippedProjects += 1;
        continue;
      }
      const doc = projectDocument(fixture, clientId, index, now);
      const projectId = await ctx.db.insert("projects", doc);
      projectIds.push(projectId);
      createdProjects += 1;
      if (fixture.status !== "draft") {
        assertProjectTransition("draft", "pending_review");
        await ctx.db.insert("projectStatusHistory", {
          projectId, oldStatus: "draft", newStatus: "pending_review", changedBy: clientId,
          changedAt: doc.submittedAt!, reason: `${PROJECT_SEED_KEY}: submitted`,
        });
        createdHistory += 1;
      }
      if (fixture.status === "published") {
        assertProjectTransition("pending_review", "published");
        await ctx.db.insert("projectStatusHistory", {
          projectId, oldStatus: "pending_review", newStatus: "published", changedBy: adminId,
          changedAt: doc.publishedAt!, reason: `${PROJECT_SEED_KEY}: approved`,
        });
        createdHistory += 1;
      }
    }

    return {
      createdProjects, skippedProjects, createdHistory,
      statusDistribution: { published: 16, pending_review: 2, draft: 2 },
      cities: [...new Set(SEED_PROJECTS.map((project) => project.city))].sort(),
      categories: [...new Set(SEED_PROJECTS.map((project) => project.category))].sort(),
      seedClientId: clientId, seedAdminId: adminId, projectIds,
    };
  },
});

export const clearDemoProjects = internalMutation({
  args: { confirmDevSeed: v.boolean() },
  returns: v.object({ deletedProjects: v.number(), deletedHistory: v.number(), skippedProjects: v.number() }),
  handler: async (ctx, args) => {
    assertDevSeedAllowed(args.confirmDevSeed);
    const seedClient = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", PROJECT_SEED_CLIENT_EMAIL)).unique();
    if (!seedClient) return { deletedProjects: 0, deletedHistory: 0, skippedProjects: 0 };
    const owned = await ctx.db.query("projects").withIndex("by_clientId", (q) => q.eq("clientId", seedClient._id)).take(21);
    if (owned.length > 20 || owned.some((project) => !project.title || !seedTitles.has(project.title))) {
      throw new ConvexError("Seed client owns unexpected projects; refusing cleanup");
    }
    let deletedProjects = 0;
    let deletedHistory = 0;
    for (const project of owned) {
      const [history, media, attachments] = await Promise.all([
        ctx.db.query("projectStatusHistory").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).take(3),
        ctx.db.query("projectMedia").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).take(1),
        ctx.db.query("projectAttachments").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).take(1),
      ]);
      if (media.length || attachments.length) {
        throw new ConvexError(`Seed project ${project._id} has user-added files; refusing cleanup`);
      }
      for (const row of history) {
        if (!row.reason?.startsWith(PROJECT_SEED_KEY)) {
          throw new ConvexError(`Seed project ${project._id} has non-seed history; refusing cleanup`);
        }
        await ctx.db.delete(row._id);
        deletedHistory += 1;
      }
      await ctx.db.delete(project._id);
      deletedProjects += 1;
    }
    return { deletedProjects, deletedHistory, skippedProjects: SEED_PROJECTS.length - deletedProjects };
  },
});

const snapshotProjectValidator = v.object({
  id: v.id("projects"), clientId: v.id("users"), title: v.union(v.string(), v.null()),
  status: v.string(), updatedAt: v.number(),
});

/** Development verification snapshot. Bounded and internal-only. */
export const inspectDemoProjects = internalQuery({
  args: {},
  returns: v.object({
    totalProjects: v.number(), seedProjects: v.number(), nonSeedProjects: v.array(snapshotProjectValidator),
    statusDistribution: statusDistributionValidator,
    brokenClientReferences: v.number(), invalidHistoryProjects: v.number(), duplicateSeedTitles: v.number(),
  }),
  handler: async (ctx: QueryCtx) => {
    const projects = await ctx.db.query("projects").withIndex("by_createdAt").take(101);
    if (projects.length > 100) throw new ConvexError("Verification snapshot is intentionally limited to 100 projects");
    const seedClient = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", PROJECT_SEED_CLIENT_EMAIL)).unique();
    const seeded = seedClient
      ? projects.filter((project) => project.clientId === seedClient._id && project.title && seedTitles.has(project.title))
      : [];
    const seededIds = new Set(seeded.map((project) => project._id));
    const titleCounts = new Map<string, number>();
    let brokenClientReferences = 0;
    let invalidHistoryProjects = 0;
    for (const project of projects) {
      if (!(await ctx.db.get(project.clientId))) brokenClientReferences += 1;
    }
    for (const project of seeded) {
      titleCounts.set(project.title!, (titleCounts.get(project.title!) ?? 0) + 1);
      const history = await ctx.db.query("projectStatusHistory").withIndex("by_projectId_and_changedAt", (q) => q.eq("projectId", project._id)).take(3);
      const expected = project.status === "published" ? ["pending_review", "published"] : project.status === "pending_review" ? ["pending_review"] : [];
      if (history.length !== expected.length || history.some((row, index) => row.newStatus !== expected[index])) {
        invalidHistoryProjects += 1;
      }
    }
    return {
      totalProjects: projects.length,
      seedProjects: seeded.length,
      nonSeedProjects: projects.filter((project) => !seededIds.has(project._id)).map((project) => ({
        id: project._id, clientId: project.clientId, title: project.title ?? null,
        status: project.status, updatedAt: project.updatedAt,
      })),
      statusDistribution: {
        published: seeded.filter((project) => project.status === "published").length,
        pending_review: seeded.filter((project) => project.status === "pending_review").length,
        draft: seeded.filter((project) => project.status === "draft").length,
      },
      brokenClientReferences,
      invalidHistoryProjects,
      duplicateSeedTitles: [...titleCounts.values()].filter((count) => count > 1).length,
    };
  },
});
