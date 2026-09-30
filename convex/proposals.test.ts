/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|session`,
    tokenIdentifier: `test|${userId}`,
  });
}

async function createProposalTestCompany(t: Backend, namespace: string) {
  return await t.run(async (ctx) => {
    const clientUserId = await ctx.db.insert("users", {
      email: `client@${namespace}.test`,
      accountType: "client",
      onboardingStatus: "completed",
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    });
    const companyUserId = await ctx.db.insert("users", {
      email: `company@${namespace}.test`,
      accountType: "company",
      onboardingStatus: "completed",
      countryCode: "MA",
      createdAt: 1,
      updatedAt: 1,
    });
    const companyId = await ctx.db.insert("companies", {
      name: `Atlas ${namespace}`,
      onboardingStatus: "completed",
      verificationStatus: "verified",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("companyMembers", {
      companyId,
      userId: companyUserId,
      role: "owner",
      status: "active",
      createdAt: 1,
    });
    return { clientUserId, companyUserId, companyId };
  });
}

type ListedProposalStatus =
  | "submitted"
  | "viewed"
  | "shortlisted"
  | "discussion_open"
  | "declined"
  | "withdrawn";

async function insertProposal(
  t: Backend,
  context: Awaited<ReturnType<typeof createProposalTestCompany>>,
  input: { label: string; status: ListedProposalStatus; submittedAt: number },
) {
  return await t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      clientId: context.clientUserId,
      title: `Proposal project ${input.label}`,
      countryCode: "MA",
      surfaceUnknown: true,
      visibility: "marketplace",
      status: "published",
      lastCompletedStep: 6,
      createdAt: input.submittedAt,
      updatedAt: input.submittedAt,
    });
    return await ctx.db.insert("projectQuotes", {
      projectId,
      companyId: context.companyId,
      submittedByUserId: context.companyUserId,
      message: `Proposal ${input.label}`,
      estimatedPrice: 100_000 + input.submittedAt,
      currency: "MAD",
      estimatedDuration: 30,
      availableStartDate: "2099-01-01",
      scope: `Scope ${input.label}`,
      quoteType: "initial",
      status: input.status,
      createdAt: input.submittedAt,
      updatedAt: input.submittedAt,
      submittedAt: input.submittedAt,
    });
  });
}

test("Company proposals are the globally newest 200 across status partitions", async () => {
  const t = convexTest(schema, modules);
  const context = await createProposalTestCompany(t, "proposal-global-order");

  const submittedIds: Id<"projectQuotes">[] = [];
  for (let index = 1; index <= 150; index += 1) {
    submittedIds.push(
      await insertProposal(t, context, {
        label: `submitted-${index}`,
        status: "submitted",
        submittedAt: 1_000 + index,
      }),
    );
  }
  const declinedIds: Id<"projectQuotes">[] = [];
  for (let index = 1; index <= 100; index += 1) {
    declinedIds.push(
      await insertProposal(t, context, {
        label: `declined-${index}`,
        status: "declined",
        submittedAt: index,
      }),
    );
  }

  const proposals = await asUser(t, context.companyUserId).query(
    api.proposals.index.listMyProposals,
    {},
  );
  const repeated = await asUser(t, context.companyUserId).query(
    api.proposals.index.listMyProposals,
    {},
  );

  expect(proposals).toHaveLength(200);
  expect(proposals.map((proposal) => proposal.quoteId)).toEqual([
    ...submittedIds.slice().reverse(),
    ...declinedIds.slice(50).reverse(),
  ]);
  expect(proposals.map((proposal) => proposal.submittedAt)).toEqual(
    Array.from({ length: 150 }, (_, index) => 1_150 - index).concat(
      Array.from({ length: 50 }, (_, index) => 100 - index),
    ),
  );
  expect(repeated.map((proposal) => proposal.quoteId)).toEqual(
    proposals.map((proposal) => proposal.quoteId),
  );

  const openStatuses = new Set(["submitted", "viewed", "shortlisted"]);
  const closedStatuses = new Set(["declined", "withdrawn"]);
  expect(proposals.filter((proposal) => openStatuses.has(proposal.status))).toHaveLength(
    150,
  );
  expect(
    proposals.filter((proposal) => proposal.status === "discussion_open"),
  ).toHaveLength(0);
  expect(proposals.filter((proposal) => closedStatuses.has(proposal.status))).toHaveLength(
    50,
  );
  for (const displacedOlderId of declinedIds.slice(0, 50)) {
    expect(proposals.map((proposal) => proposal.quoteId)).not.toContain(displacedOlderId);
  }
});

test("Company proposal result limit is bounded at the newest 200 rows", async () => {
  const t = convexTest(schema, modules);
  const context = await createProposalTestCompany(t, "proposal-result-limit");
  const quoteIds: Id<"projectQuotes">[] = [];
  for (let index = 1; index <= 205; index += 1) {
    quoteIds.push(
      await insertProposal(t, context, {
        label: `viewed-${index}`,
        status: "viewed",
        submittedAt: index,
      }),
    );
  }

  const proposals = await asUser(t, context.companyUserId).query(
    api.proposals.index.listMyProposals,
    {},
  );

  expect(proposals).toHaveLength(200);
  expect(proposals.map((proposal) => proposal.quoteId)).toEqual(
    quoteIds.slice(5).reverse(),
  );
  expect(proposals.map((proposal) => proposal.submittedAt)).toEqual(
    Array.from({ length: 200 }, (_, index) => 205 - index),
  );
  for (const oldestOverflowId of quoteIds.slice(0, 5)) {
    expect(proposals.map((proposal) => proposal.quoteId)).not.toContain(oldestOverflowId);
  }
});
