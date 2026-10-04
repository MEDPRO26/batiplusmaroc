"use client";

import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

export type PublicMarketplaceCompany = FunctionReturnType<typeof api.companies.directory.listPublicCompanies>["page"][number];

/** Promotional cards use the same privacy/eligibility boundary as the directory. */
export function usePublicCompanyPreview({ limit, service, enabled = true }: { limit: number; service?: string; enabled?: boolean }) {
  const { results, status } = usePaginatedQuery(
    api.companies.directory.listPublicCompanies,
    enabled ? { service, verifiedOnly: true, sort: service ? "relevance" : "newest" } : "skip",
    { initialNumItems: limit },
  );
  return {
    companies: Array.from(new Map(results.map(company => [company.id, company])).values()).slice(0, limit),
    loading: status === "LoadingFirstPage",
  };
}
