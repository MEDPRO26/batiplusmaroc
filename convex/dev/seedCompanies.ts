/**
 * DEVELOPMENT-ONLY company marketplace seed.
 *
 * Creates fictional Moroccan construction companies for directory/filter testing.
 * Does not create auth users or company members.
 *
 * Safety:
 * - Internal mutations only (not callable from the client)
 * - Requires confirmDevSeed: true
 * - Refuses when ALLOW_DEV_SEED is explicitly "false"
 * - Idempotent via stable `seed-demo-*` slugs
 * - Cleanup deletes only those seeded rows
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { buildCompanyDirectorySearchText } from "../companies/directory";

export const SEED_SLUG_PREFIX = "seed-demo-";

const companyServiceValidator = v.union(
  v.literal("houseConstruction"),
  v.literal("renovation"),
  v.literal("structural"),
  v.literal("finishing"),
  v.literal("architecture"),
  v.literal("interior"),
  v.literal("electrical"),
  v.literal("plumbing"),
  v.literal("joinery"),
  v.literal("pool"),
);

type CompanyService =
  | "houseConstruction"
  | "renovation"
  | "structural"
  | "finishing"
  | "architecture"
  | "interior"
  | "electrical"
  | "plumbing"
  | "joinery"
  | "pool";

type VerificationStatus = "draft" | "pending" | "verified" | "rejected";
type PortfolioStatus = "draft" | "published" | "hidden";
type ProjectType =
  | "construction"
  | "renovation"
  | "structural"
  | "finishing"
  | "interior"
  | "exterior"
  | "other";

type SeedPortfolio = {
  title: string;
  description: string;
  city: string;
  projectType: ProjectType;
  year: number;
  surface: number;
  durationMonths: number;
  status: PortfolioStatus;
};

type SeedCompany = {
  slug: string;
  name: string;
  legalName: string;
  city: string;
  phone: string;
  website: string;
  yearsExperience: number;
  foundedYear: number;
  companySize: string;
  languages: string[];
  serviceAreas: string[];
  shortDescription: string;
  services: CompanyService[];
  onboardingStatus: "pending" | "completed";
  verificationStatus: VerificationStatus;
  portfolio: SeedPortfolio[];
};

/**
 * Extra flavor fields (founded year, size, languages, service areas) are woven
 * into `description` because the companies schema does not store them yet.
 */
function buildDescription(company: SeedCompany) {
  const areas = company.serviceAreas.join(", ");
  const langs = company.languages.join("/");
  return [
    company.shortDescription,
    `Fondée en ${company.foundedYear} · ${company.companySize} · Langues: ${langs}.`,
    `Zones d'intervention: ${areas}.`,
    "[Batiplus seed-demo — fictional company for development only]",
  ].join(" ");
}

export const DEMO_COMPANIES: readonly SeedCompany[] = [
  {
    slug: `${SEED_SLUG_PREFIX}atlas-batiments-agadir`,
    name: "Atlas Bâtiments Agadir",
    legalName: "Atlas Bâtiments Agadir SARL",
    city: "Agadir",
    phone: "+212528201101",
    website: "https://atlas-batiments-agadir.example",
    yearsExperience: 18,
    foundedYear: 2007,
    companySize: "21–50 employés",
    languages: ["FR", "AR", "EN"],
    serviceAreas: ["Agadir", "Inezgane", "Ait Melloul"],
    shortDescription:
      "Constructeur résidentiel spécialisé dans les villas contemporaines et les petits collectifs sur la côte sud.",
    services: ["houseConstruction", "structural", "finishing"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Villa Founty vue mer",
        description: "Construction neuve d'une villa R+1 avec piscine et finitions haut de gamme.",
        city: "Agadir",
        projectType: "construction",
        year: 2024,
        surface: 280,
        durationMonths: 14,
        status: "published",
      },
      {
        title: "Résidence Tikiouine",
        description: "Immeuble R+3 de 12 logements avec structure béton et second œuvre complet.",
        city: "Agadir",
        projectType: "construction",
        year: 2022,
        surface: 920,
        durationMonths: 18,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}casablanca-renov-plus`,
    name: "Casablanca Rénov Plus",
    legalName: "Casablanca Rénov Plus SARL",
    city: "Casablanca",
    phone: "+212522301202",
    website: "https://casa-renov-plus.example",
    yearsExperience: 11,
    foundedYear: 2014,
    companySize: "11–20 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Casablanca", "Mohammedia", "Ain Sebaa"],
    shortDescription:
      "Rénovation d'appartements et de locaux professionnels avec coordination tous corps d'état.",
    services: ["renovation", "finishing", "interior"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Appartement Maarif",
        description: "Réaménagement complet d'un T3 avec cuisine ouverte et isolation phonique.",
        city: "Casablanca",
        projectType: "renovation",
        year: 2025,
        surface: 95,
        durationMonths: 4,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}marrakech-structure-pro`,
    name: "Marrakech Structure Pro",
    legalName: "Marrakech Structure Pro SARL",
    city: "Marrakech",
    phone: "+212524401303",
    website: "https://marrakech-structure-pro.example",
    yearsExperience: 15,
    foundedYear: 2010,
    companySize: "51–100 employés",
    languages: ["FR", "AR", "EN"],
    serviceAreas: ["Marrakech", "Ourika", "Essaouira"],
    shortDescription:
      "Gros œuvre et structures béton pour villas touristiques, riads et équipements hôteliers.",
    services: ["structural", "houseConstruction", "architecture"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Riad Guéliz",
        description: "Renforcement structurel et extension d'un riad patrimonial.",
        city: "Marrakech",
        projectType: "structural",
        year: 2023,
        surface: 410,
        durationMonths: 10,
        status: "published",
      },
      {
        title: "Villa Palmeraie",
        description: "Gros œuvre d'une villa contemporaine sur terrain en pente.",
        city: "Marrakech",
        projectType: "construction",
        year: 2021,
        surface: 350,
        durationMonths: 9,
        status: "draft",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}rabat-finitions-elegance`,
    name: "Rabat Finitions Élégance",
    legalName: "Rabat Finitions Élégance SARL",
    city: "Rabat",
    phone: "+212537501404",
    website: "https://rabat-finitions.example",
    yearsExperience: 9,
    foundedYear: 2016,
    companySize: "6–10 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Rabat", "Salé", "Témara"],
    shortDescription:
      "Second œuvre soigné : plâtrerie, peinture, menuiserie intérieure et finitions décoratives.",
    services: ["finishing", "joinery", "interior"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Appartement Hassan",
        description: "Finitions haut de gamme avec boiseries et éclairage intégré.",
        city: "Rabat",
        projectType: "finishing",
        year: 2024,
        surface: 140,
        durationMonths: 3,
        status: "published",
      },
      {
        title: "Bureau Agdal",
        description: "Aménagement de bureaux open space avec cloisons acoustiques.",
        city: "Rabat",
        projectType: "interior",
        year: 2023,
        surface: 220,
        durationMonths: 5,
        status: "published",
      },
      {
        title: "Villa Souissi (brouillon)",
        description: "Projet en préparation — échantillons de finitions.",
        city: "Rabat",
        projectType: "finishing",
        year: 2025,
        surface: 300,
        durationMonths: 6,
        status: "draft",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}tanger-electric-nord`,
    name: "Tanger Electric Nord",
    legalName: "Tanger Electric Nord SARL",
    city: "Tangier",
    phone: "+212539601505",
    website: "https://tanger-electric-nord.example",
    yearsExperience: 13,
    foundedYear: 2012,
    companySize: "11–20 employés",
    languages: ["FR", "AR", "ES"],
    serviceAreas: ["Tangier", "Tétouan", "Fnideq"],
    shortDescription:
      "Installations électriques résidentielles et tertiaires, domotique et mise aux normes.",
    services: ["electrical", "renovation"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Résidence Malabata",
        description: "Câblage complet et tableaux électriques pour 24 appartements.",
        city: "Tangier",
        projectType: "other",
        year: 2024,
        surface: 1800,
        durationMonths: 7,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}agadir-piscines-bleu`,
    name: "Agadir Piscines Bleu",
    legalName: "Agadir Piscines Bleu SARL",
    city: "Agadir",
    phone: "+212528201606",
    website: "https://agadir-piscines-bleu.example",
    yearsExperience: 8,
    foundedYear: 2017,
    companySize: "6–10 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Agadir", "Taghazout", "Tamraght"],
    shortDescription:
      "Conception et construction de piscines privées, spa et aménagements extérieurs.",
    services: ["pool", "finishing"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Piscine Taghazout",
        description: "Piscine à débordement avec plage immergée et local technique.",
        city: "Taghazout",
        projectType: "exterior",
        year: 2025,
        surface: 48,
        durationMonths: 3,
        status: "published",
      },
      {
        title: "Spa privé Anza",
        description: "Petit bassin chauffé et terrasse en pierre naturelle.",
        city: "Agadir",
        projectType: "exterior",
        year: 2023,
        surface: 22,
        durationMonths: 2,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}casa-plomberie-expert`,
    name: "Casa Plomberie Expert",
    legalName: "Casa Plomberie Expert SARL",
    city: "Casablanca",
    phone: "+212522301707",
    website: "https://casa-plomberie-expert.example",
    yearsExperience: 16,
    foundedYear: 2009,
    companySize: "11–20 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Casablanca", "Bouskoura", "Nouaceur"],
    shortDescription:
      "Plomberie sanitaire, réseaux d'eau chaude et dépannages pour chantiers neufs et rénovation.",
    services: ["plumbing", "renovation", "finishing"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Tour Anfa",
        description: "Réseaux sanitaires et colonnes montantes pour un immeuble de bureaux.",
        city: "Casablanca",
        projectType: "other",
        year: 2022,
        surface: 4500,
        durationMonths: 11,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}marrakech-interieur-studio`,
    name: "Marrakech Intérieur Studio",
    legalName: "Marrakech Intérieur Studio SARL",
    city: "Marrakech",
    phone: "+212524401808",
    website: "https://marrakech-interieur-studio.example",
    yearsExperience: 7,
    foundedYear: 2018,
    companySize: "1–5 employés",
    languages: ["FR", "EN", "AR"],
    serviceAreas: ["Marrakech", "Agafay"],
    shortDescription:
      "Architecture d'intérieur et aménagement clé en main pour riads et maisons d'hôtes.",
    services: ["interior", "architecture", "finishing"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Riad Médina",
        description: "Design intérieur contemporain mêlant tadelakt et luminaires artisanaux.",
        city: "Marrakech",
        projectType: "interior",
        year: 2024,
        surface: 260,
        durationMonths: 6,
        status: "published",
      },
      {
        title: "Suite Atlas",
        description: "Suite parentale avec dressing et salle de bain en marbre.",
        city: "Marrakech",
        projectType: "interior",
        year: 2023,
        surface: 55,
        durationMonths: 2,
        status: "draft",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}rabat-architecture-ligne`,
    name: "Rabat Architecture Ligne",
    legalName: "Rabat Architecture Ligne SARL",
    city: "Rabat",
    phone: "+212537501909",
    website: "https://rabat-architecture-ligne.example",
    yearsExperience: 20,
    foundedYear: 2005,
    companySize: "11–20 employés",
    languages: ["FR", "AR", "EN"],
    serviceAreas: ["Rabat", "Kénitra", "Skhirat"],
    shortDescription:
      "Conception architecturale et suivi de chantier pour villas individuelles et équipements légers.",
    services: ["architecture", "houseConstruction", "structural"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Villa Skhirat",
        description: "Maison bioclimatique avec patio central et toiture végétalisée.",
        city: "Skhirat",
        projectType: "construction",
        year: 2023,
        surface: 320,
        durationMonths: 16,
        status: "published",
      },
      {
        title: "Maison Kénitra",
        description: "Projet architectural R+1 avec garage et jardin.",
        city: "Kénitra",
        projectType: "construction",
        year: 2021,
        surface: 210,
        durationMonths: 12,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}tanger-menuiserie-atlantique`,
    name: "Tanger Menuiserie Atlantique",
    legalName: "Tanger Menuiserie Atlantique SARL",
    city: "Tangier",
    phone: "+212539602010",
    website: "https://tanger-menuiserie-atlantique.example",
    yearsExperience: 12,
    foundedYear: 2013,
    companySize: "11–20 employés",
    languages: ["FR", "AR", "ES"],
    serviceAreas: ["Tangier", "Asilah", "Larache"],
    shortDescription:
      "Menuiserie bois et aluminium : portes, fenêtres, placards et façades légères.",
    services: ["joinery", "finishing", "renovation"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Façade aluminium Marina",
        description: "Menuiseries aluminium à rupture de pont thermique pour un immeuble neuf.",
        city: "Tangier",
        projectType: "exterior",
        year: 2024,
        surface: 600,
        durationMonths: 5,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}agadir-gros-oeuvre-sud`,
    name: "Agadir Gros Œuvre Sud",
    legalName: "Agadir Gros Oeuvre Sud SARL",
    city: "Agadir",
    phone: "+212528202111",
    website: "https://agadir-gros-oeuvre-sud.example",
    yearsExperience: 22,
    foundedYear: 2003,
    companySize: "51–100 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Agadir", "Tiznit", "Taroudant"],
    shortDescription:
      "Entreprise de gros œuvre pour programmes résidentiels et équipements publics régionaux.",
    services: ["structural", "houseConstruction"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "École Taroudant",
        description: "Structure béton d'un groupe scolaire de 12 salles.",
        city: "Taroudant",
        projectType: "structural",
        year: 2022,
        surface: 1400,
        durationMonths: 14,
        status: "published",
      },
      {
        title: "Lotissement Drarga",
        description: "Villas jumelées — gros œuvre et toitures.",
        city: "Agadir",
        projectType: "construction",
        year: 2020,
        surface: 2400,
        durationMonths: 20,
        status: "published",
      },
      {
        title: "Hangar Tiznit (brouillon)",
        description: "Avant-projet structure métallique.",
        city: "Tiznit",
        projectType: "structural",
        year: 2025,
        surface: 800,
        durationMonths: 6,
        status: "draft",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}casa-construction-horizon`,
    name: "Casa Construction Horizon",
    legalName: "Casa Construction Horizon SARL",
    city: "Casablanca",
    phone: "+212522302212",
    website: "https://casa-construction-horizon.example",
    yearsExperience: 14,
    foundedYear: 2011,
    companySize: "21–50 employés",
    languages: ["FR", "AR", "EN"],
    serviceAreas: ["Casablanca", "Berrechid", "Settat"],
    shortDescription:
      "Construction de maisons individuelles et villas clé en main en région casablancaise.",
    services: ["houseConstruction", "architecture", "finishing"],
    onboardingStatus: "completed",
    verificationStatus: "verified",
    portfolio: [
      {
        title: "Villa Californie",
        description: "Maison familiale avec jardin et garage double.",
        city: "Casablanca",
        projectType: "construction",
        year: 2024,
        surface: 260,
        durationMonths: 13,
        status: "published",
      },
    ],
  },
  // --- 5 pending ---
  {
    slug: `${SEED_SLUG_PREFIX}marrakech-renov-medina`,
    name: "Marrakech Rénov Médina",
    legalName: "Marrakech Renov Medina SARL",
    city: "Marrakech",
    phone: "+212524402313",
    website: "https://marrakech-renov-medina.example",
    yearsExperience: 6,
    foundedYear: 2019,
    companySize: "6–10 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Marrakech"],
    shortDescription:
      "Rénovation de riads et maisons traditionnelles dans la médina et les quartiers historiques.",
    services: ["renovation", "structural", "joinery"],
    onboardingStatus: "completed",
    verificationStatus: "pending",
    portfolio: [
      {
        title: "Maison Derb Debbachi",
        description: "Réhabilitation d'une maison traditionnelle avec patio.",
        city: "Marrakech",
        projectType: "renovation",
        year: 2024,
        surface: 180,
        durationMonths: 8,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}rabat-elec-capitale`,
    name: "Rabat Élec Capitale",
    legalName: "Rabat Elec Capitale SARL",
    city: "Rabat",
    phone: "+212537502414",
    website: "https://rabat-elec-capitale.example",
    yearsExperience: 5,
    foundedYear: 2020,
    companySize: "1–5 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Rabat", "Salé"],
    shortDescription:
      "Électricité générale, tableaux divisionnaires et éclairage LED pour logements et commerces.",
    services: ["electrical", "renovation"],
    onboardingStatus: "completed",
    verificationStatus: "pending",
    portfolio: [
      {
        title: "Commerce Agdal",
        description: "Réfection électrique complète d'un local commercial.",
        city: "Rabat",
        projectType: "renovation",
        year: 2025,
        surface: 80,
        durationMonths: 1,
        status: "published",
      },
      {
        title: "Villa Hay Riad (brouillon)",
        description: "Devis domotique en cours.",
        city: "Rabat",
        projectType: "other",
        year: 2025,
        surface: 200,
        durationMonths: 2,
        status: "draft",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}tanger-plomberie-detroit`,
    name: "Tanger Plomberie Détroit",
    legalName: "Tanger Plomberie Detroit SARL",
    city: "Tangier",
    phone: "+212539602515",
    website: "https://tanger-plomberie-detroit.example",
    yearsExperience: 10,
    foundedYear: 2015,
    companySize: "6–10 employés",
    languages: ["FR", "AR", "ES"],
    serviceAreas: ["Tangier", "Martil"],
    shortDescription:
      "Plomberie et réseaux d'évacuation pour immeubles et villas du nord du Maroc.",
    services: ["plumbing", "finishing"],
    onboardingStatus: "completed",
    verificationStatus: "pending",
    portfolio: [
      {
        title: "Immeuble Iberia",
        description: "Colonnes d'eau et évacuation pour 18 lots.",
        city: "Tangier",
        projectType: "other",
        year: 2023,
        surface: 1200,
        durationMonths: 6,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}agadir-amenagement-costa`,
    name: "Agadir Aménagement Costa",
    legalName: "Agadir Amenagement Costa SARL",
    city: "Agadir",
    phone: "+212528202616",
    website: "https://agadir-amenagement-costa.example",
    yearsExperience: 4,
    foundedYear: 2021,
    companySize: "1–5 employés",
    languages: ["FR", "AR", "EN"],
    serviceAreas: ["Agadir", "Taghazout"],
    shortDescription:
      "Aménagement intérieur de residences de vacances et appartements meublés.",
    services: ["interior", "finishing", "joinery"],
    onboardingStatus: "completed",
    verificationStatus: "pending",
    portfolio: [
      {
        title: "Studio Taghazout",
        description: "Aménagement compact avec kitchenette et rangements sur mesure.",
        city: "Taghazout",
        projectType: "interior",
        year: 2024,
        surface: 38,
        durationMonths: 1,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}casa-structure-atlantique`,
    name: "Casa Structure Atlantique",
    legalName: "Casa Structure Atlantique SARL",
    city: "Casablanca",
    phone: "+212522302717",
    website: "https://casa-structure-atlantique.example",
    yearsExperience: 17,
    foundedYear: 2008,
    companySize: "21–50 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Casablanca", "El Jadida"],
    shortDescription:
      "Structures béton et renforcement parasismique pour bâtiments résidentiels et tertiaires.",
    services: ["structural", "architecture"],
    onboardingStatus: "completed",
    verificationStatus: "pending",
    portfolio: [
      {
        title: "Renforcement Sidi Maarouf",
        description: "Reprise en sous-œuvre et renforcement de planchers.",
        city: "Casablanca",
        projectType: "structural",
        year: 2022,
        surface: 700,
        durationMonths: 5,
        status: "published",
      },
      {
        title: "Parking El Jadida",
        description: "Structure d'un parking semi-enterré.",
        city: "El Jadida",
        projectType: "structural",
        year: 2021,
        surface: 2100,
        durationMonths: 9,
        status: "draft",
      },
    ],
  },
  // --- 3 draft / unverified ---
  {
    slug: `${SEED_SLUG_PREFIX}marrakech-batir-ensemble`,
    name: "Marrakech Bâtir Ensemble",
    legalName: "Marrakech Batir Ensemble SARL",
    city: "Marrakech",
    phone: "+212524402818",
    website: "https://marrakech-batir-ensemble.example",
    yearsExperience: 3,
    foundedYear: 2022,
    companySize: "1–5 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Marrakech"],
    shortDescription:
      "Jeune entreprise générale pour petites constructions et extensions résidentielles.",
    services: ["houseConstruction", "renovation"],
    onboardingStatus: "completed",
    verificationStatus: "draft",
    portfolio: [
      {
        title: "Extension Targa",
        description: "Ajout d'une chambre et d'une salle de bain en RDC.",
        city: "Marrakech",
        projectType: "construction",
        year: 2024,
        surface: 42,
        durationMonths: 3,
        status: "draft",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}rabat-second-oeuvre-draft`,
    name: "Rabat Second Œuvre Draft",
    legalName: "Rabat Second Oeuvre Draft SARL",
    city: "Rabat",
    phone: "+212537502919",
    website: "https://rabat-second-oeuvre-draft.example",
    yearsExperience: 2,
    foundedYear: 2023,
    companySize: "1–5 employés",
    languages: ["FR"],
    serviceAreas: ["Rabat"],
    shortDescription:
      "Profil en cours de constitution — second œuvre et petites finitions (données de démo).",
    services: ["finishing", "plumbing", "electrical"],
    onboardingStatus: "completed",
    verificationStatus: "draft",
    portfolio: [
      {
        title: "Essai finitions",
        description: "Fiche portfolio brouillon pour tests UI.",
        city: "Rabat",
        projectType: "finishing",
        year: 2025,
        surface: 60,
        durationMonths: 1,
        status: "draft",
      },
      {
        title: "Salle de bain Salé",
        description: "Rénovation sanitaires — en préparation.",
        city: "Salé",
        projectType: "renovation",
        year: 2025,
        surface: 12,
        durationMonths: 1,
        status: "published",
      },
    ],
  },
  {
    slug: `${SEED_SLUG_PREFIX}tanger-travaux-draft`,
    name: "Tanger Travaux Draft",
    legalName: "Tanger Travaux Draft SARL",
    city: "Tangier",
    phone: "+212539603020",
    website: "https://tanger-travaux-draft.example",
    yearsExperience: 1,
    foundedYear: 2024,
    companySize: "1–5 employés",
    languages: ["FR", "AR"],
    serviceAreas: ["Tangier"],
    shortDescription:
      "Compte démo non vérifié pour tester les filtres directory et l'onboarding marketplace.",
    services: ["renovation", "joinery", "pool"],
    onboardingStatus: "completed",
    verificationStatus: "draft",
    portfolio: [
      {
        title: "Terrasse Malabata",
        description: "Aménagement extérieur léger — brouillon.",
        city: "Tangier",
        projectType: "exterior",
        year: 2025,
        surface: 35,
        durationMonths: 1,
        status: "draft",
      },
    ],
  },
];

function assertDevSeedAllowed() {
  if (process.env.ALLOW_DEV_SEED === "false") {
    throw new Error(
      "Refusing seed: ALLOW_DEV_SEED=false on this Convex deployment. Development seed only.",
    );
  }
}

async function deleteCompanyTree(ctx: MutationCtx, companyId: Id<"companies">) {
  const services = await ctx.db
    .query("companyServices")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .collect();
  for (const row of services) {
    await ctx.db.delete(row._id);
  }

  const projects = await ctx.db
    .query("portfolioProjects")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .collect();
  for (const project of projects) {
    const media = await ctx.db
      .query("portfolioMedia")
      .withIndex("by_portfolioProjectId", (q) => q.eq("portfolioProjectId", project._id))
      .collect();
    for (const item of media) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(project._id);
  }

  const verification = await ctx.db
    .query("companyVerifications")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .unique();
  if (verification) {
    const docs = await ctx.db
      .query("companyVerificationDocuments")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    await ctx.db.delete(verification._id);
  }

  const history = await ctx.db
    .query("companyVerificationHistory")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .collect();
  for (const row of history) {
    await ctx.db.delete(row._id);
  }

  await ctx.db.delete(companyId);
}

const seedResultValidator = v.object({
  createdCompanies: v.number(),
  skippedCompanies: v.number(),
  createdServices: v.number(),
  createdPortfolio: v.number(),
  verification: v.object({
    verified: v.number(),
    pending: v.number(),
    draft: v.number(),
  }),
  cities: v.array(v.string()),
  services: v.array(companyServiceValidator),
  companySlugs: v.array(v.string()),
  logs: v.array(v.string()),
});

export const seedDemoCompanies = internalMutation({
  args: {
    confirmDevSeed: v.boolean(),
  },
  returns: seedResultValidator,
  handler: async (ctx, args) => {
    if (!args.confirmDevSeed) {
      throw new Error("Refusing seed: pass confirmDevSeed: true. Development use only.");
    }
    assertDevSeedAllowed();

    if (DEMO_COMPANIES.length !== 20) {
      throw new Error(`Seed data integrity error: expected 20 companies, got ${DEMO_COMPANIES.length}`);
    }

    const now = Date.now();
    const logs: string[] = [];
    let createdCompanies = 0;
    let skippedCompanies = 0;
    let createdServices = 0;
    let createdPortfolio = 0;
    const verification = { verified: 0, pending: 0, draft: 0 };
    const citySet = new Set<string>();
    const serviceSet = new Set<CompanyService>();
    const companySlugs: string[] = [];

    for (const company of DEMO_COMPANIES) {
      if (!company.slug.startsWith(SEED_SLUG_PREFIX)) {
        throw new Error(`Seed slug must start with ${SEED_SLUG_PREFIX}: ${company.slug}`);
      }

      const existing = await ctx.db
        .query("companies")
        .withIndex("by_slug", (q) => q.eq("slug", company.slug))
        .unique();

      if (existing) {
        skippedCompanies += 1;
        companySlugs.push(company.slug);
        citySet.add(company.city);
        for (const service of company.services) serviceSet.add(service);
        if (company.verificationStatus === "verified") verification.verified += 1;
        else if (company.verificationStatus === "pending") verification.pending += 1;
        else if (company.verificationStatus === "draft") verification.draft += 1;
        logs.push(`skip existing ${company.slug}`);
        continue;
      }

      const description = buildDescription(company);
      const directorySearchText = buildCompanyDirectorySearchText({
        name: company.name,
        city: company.city,
        services: company.services,
      });

      const companyId = await ctx.db.insert("companies", {
        name: company.name,
        legalName: company.legalName,
        slug: company.slug,
        phone: company.phone,
        city: company.city,
        description,
        yearsExperience: company.yearsExperience,
        website: company.website,
        directorySearchText,
        onboardingStatus: company.onboardingStatus,
        verificationStatus: company.verificationStatus,
        createdAt: now,
        updatedAt: now,
      });

      for (const service of company.services) {
        await ctx.db.insert("companyServices", {
          companyId,
          service,
          createdAt: now,
          updatedAt: now,
        });
        createdServices += 1;
        serviceSet.add(service);
      }

      for (const project of company.portfolio) {
        await ctx.db.insert("portfolioProjects", {
          companyId,
          title: project.title,
          description: project.description,
          city: project.city,
          projectType: project.projectType,
          surface: project.surface,
          durationMonths: project.durationMonths,
          year: project.year,
          status: project.status,
          createdAt: now,
          updatedAt: now,
        });
        createdPortfolio += 1;
      }

      createdCompanies += 1;
      companySlugs.push(company.slug);
      citySet.add(company.city);
      if (company.verificationStatus === "verified") verification.verified += 1;
      else if (company.verificationStatus === "pending") verification.pending += 1;
      else if (company.verificationStatus === "draft") verification.draft += 1;
      logs.push(
        `created ${company.slug} (${company.city}, ${company.verificationStatus}, ${company.services.length} services, ${company.portfolio.length} portfolio)`,
      );
    }

    return {
      createdCompanies,
      skippedCompanies,
      createdServices,
      createdPortfolio,
      verification,
      cities: [...citySet].sort(),
      services: [...serviceSet].sort() as CompanyService[],
      companySlugs,
      logs,
    };
  },
});

const clearResultValidator = v.object({
  deletedCompanies: v.number(),
  deletedServices: v.number(),
  deletedPortfolio: v.number(),
  deletedSlugs: v.array(v.string()),
  logs: v.array(v.string()),
});

export const clearDemoCompanies = internalMutation({
  args: {
    confirmDevSeed: v.boolean(),
  },
  returns: clearResultValidator,
  handler: async (ctx, args) => {
    if (!args.confirmDevSeed) {
      throw new Error("Refusing cleanup: pass confirmDevSeed: true. Development use only.");
    }
    assertDevSeedAllowed();

    const logs: string[] = [];
    const deletedSlugs: string[] = [];
    let deletedCompanies = 0;
    let deletedServices = 0;
    let deletedPortfolio = 0;

    for (const company of DEMO_COMPANIES) {
      const existing = await ctx.db
        .query("companies")
        .withIndex("by_slug", (q) => q.eq("slug", company.slug))
        .unique();
      if (!existing) {
        logs.push(`nothing to delete for ${company.slug}`);
        continue;
      }
      if (!existing.slug?.startsWith(SEED_SLUG_PREFIX)) {
        logs.push(`safety skip non-seed slug ${existing.slug ?? "(missing)"}`);
        continue;
      }

      const serviceCount = (
        await ctx.db
          .query("companyServices")
          .withIndex("by_companyId", (q) => q.eq("companyId", existing._id))
          .collect()
      ).length;
      const portfolioCount = (
        await ctx.db
          .query("portfolioProjects")
          .withIndex("by_companyId", (q) => q.eq("companyId", existing._id))
          .collect()
      ).length;

      await deleteCompanyTree(ctx, existing._id);
      deletedCompanies += 1;
      deletedServices += serviceCount;
      deletedPortfolio += portfolioCount;
      deletedSlugs.push(company.slug);
      logs.push(`deleted ${company.slug} (+${serviceCount} services, +${portfolioCount} portfolio)`);
    }

    return {
      deletedCompanies,
      deletedServices,
      deletedPortfolio,
      deletedSlugs,
      logs,
    };
  },
});
