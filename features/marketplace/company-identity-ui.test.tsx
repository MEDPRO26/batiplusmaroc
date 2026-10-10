import { readFileSync } from "node:fs";
import { createFormatter, createTranslator, NextIntlClientProvider } from "next-intl";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => "session" }));
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "fr",
  selection: null as "companies" | "renovation" | null,
  responses: new Map<string, unknown>(),
  queries: [] as Array<{ name: string; args: unknown; limit?: number }>,
  loading: false,
}));
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference);
    state.queries.push({ name, args });
    return args === "skip" ? undefined : state.responses.get(name);
  },
  usePaginatedQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown, options: { initialNumItems: number }) => {
    const name = getFunctionName(reference);
    state.queries.push({ name, args, limit: options.initialNumItems });
    return { results: args === "skip" ? [] : state.responses.get(name) ?? [], status: state.loading ? "LoadingFirstPage" : "Exhausted", loadMore: vi.fn() };
  },
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => react.useState(
    state.selection === "companies" && initial === "projects" ? "companies"
      : state.selection === "renovation" && initial === null ? "renovation" : initial,
  ) };
});
vi.mock("next/image", () => ({ default: ({ alt, src, unoptimized }: { alt: string; src: string; unoptimized?: boolean }) => <span data-image-alt={alt} data-src={src} data-unoptimized={unoptimized || undefined} /> }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => state.locale,
  getFormatter: async () => createFormatter({ locale: state.locale, timeZone: "Africa/Casablanca" }),
  getTranslations: async (namespace: string) => createTranslator({ locale: state.locale, messages: state.locale === "en" ? en : fr, namespace: namespace as keyof typeof en }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string; params?: Record<string, string> } }) => {
    const pathname = typeof href === "string" ? href : Object.entries(href.params ?? {}).reduce((value, [key, param]) => value.replace(`[${key}]`, param), href.pathname);
    return <a href={`/${state.locale}${pathname}`} {...props}>{children}</a>;
  },
  getPathname: () => `/${state.locale}/entreprises/s2mbou`,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { CategoryMarketplace } from "@/components/home/category-marketplace";
import { MarketplaceFeed } from "@/components/home/marketplace-feed";
import { HiringCompanyPreviews } from "@/components/how-it-works/hiring-company-previews";
import { CompanyDirectory } from "@/features/companies/components/company-directory";
import { PublicCompanyProfile } from "@/features/companies/components/public-company-profile";
import { ClientProjectInvitations } from "@/features/invitations/components/client-project-invitations";
import { ConversationContextPanel } from "@/features/messages/components/conversation-context-panel";
import { MessagesInboxView } from "@/features/messages/components/messages-inbox";
import { QuoteReviewContent, ReceivedQuoteCard, type ReceivedQuoteDetail } from "@/features/quotes/components/client-received-quotes";
import { SiteAssessmentPanel } from "@/features/site-assessments/components/site-assessment-panel";
import { FinalQuoteSheet } from "@/features/final-quotes/components/conversation-final-quote-panel";
import { MarketplaceWorkflowCard } from "./components/conversation-marketplace-workflow";
import { NotificationItem } from "@/features/notifications/components/notification-item";
import { ClientProjectCurrentStep } from "@/features/projects/components/client-project-current-step";
import { ClientDealCompletion } from "@/features/projects/components/client-project-details";

const FULL_NAME = "S2MBOU SARL", SAFE_NAME = "S2**** SA**";
const projectId = "project-1" as Id<"projects">;
const companyId = "company-1" as Id<"companies">;
const conversationId = "conversation-1" as Id<"conversations">;
const company: FunctionReturnType<typeof api.companies.directory.listPublicCompanies>["page"][number] = {
  id: companyId, slug: "s2mbou", name: SAFE_NAME, description: `Work by ${SAFE_NAME}.`, city: "Rabat", isVerified: true,
  yearsExperience: 10, services: ["renovation"], serviceNames: [{ slug: "renovation", nameFr: "Rénovation", nameEn: "Renovation" }],
  serviceAreas: ["rabat"], coverageScopeKeys: [], logoUrl: "https://media.example.test/logo.webp", coverImageUrl: "https://media.example.test/cover.webp", portfolio: [], rating: null, reviewCount: 0,
};
const quote: ReceivedQuoteDetail = {
  id: "quote-1" as Id<"projectQuotes">, projectId, companyId, message: `Offer by ${SAFE_NAME}.`, scope: "All materials and labour.",
  estimatedPrice: 100_000, currency: "MAD", estimatedDuration: 30, availableStartDate: "2099-01-01", quoteType: "initial", status: "shortlisted",
  createdAt: 1, updatedAt: 1, submittedAt: 1, withdrawnAt: null, company: { name: SAFE_NAME, slug: company.slug, city: company.city, description: company.description, logoUrl: company.logoUrl, isVerified: true }, history: [],
};
const thread: FunctionReturnType<typeof api.messages.index.listMyThreads>[number] = {
  id: conversationId, projectId, quoteId: quote.id, projectTitle: "Renovation", otherPartyName: SAFE_NAME, otherPartyAvatarUrl: company.logoUrl,
  companySlug: company.slug, status: "active", preview: `Offer by ${SAFE_NAME}: attachment.pdf`, lastMessageAt: 1, unread: false,
};
const assessment: NonNullable<FunctionReturnType<typeof api.siteVisits.index.getForConversation>["assessment"]> = {
  id: "assessment-1" as Id<"siteAssessments">, projectId, companyId, companyName: SAFE_NAME, initialQuoteId: quote.id, conversationId,
  status: "invited", invitedAt: 1, acceptedAt: null, clientNote: null, companyNote: null, updatedAt: 1, visit: null,
};
const finalQuote: NonNullable<FunctionReturnType<typeof api.finalQuotes.index.getForConversation>["finalQuote"]> = {
  id: "final-quote-1" as Id<"finalQuotes">, projectId, companyId, companyName: SAFE_NAME, conversationId, status: "submitted", requestTrigger: "client_request", requestedAt: 1,
  changesRequestReason: null, acceptedAt: null, declinedAt: null, withdrawnAt: null, currentRevisionId: "revision-1" as Id<"finalQuoteRevisions">,
  canRequest: false, canSubmit: false, canReview: true, canWithdraw: false,
  revisions: [{ id: "revision-1" as Id<"finalQuoteRevisions">, revisionNumber: 1, price: 100_000, currency: "MAD", duration: 30,
    plannedStartDate: "2099-01-01", validUntil: "2099-02-01", scope: `Work by ${SAFE_NAME}.`, inclusions: "Materials", exclusions: "Permits", paymentTerms: "On completion", companyNote: null,
    hasPdf: true, pdfFileName: "final-quote.pdf", pdfSize: 1_024, submittedAt: 1 }],
};

function render(node: ReactNode) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={state.locale} messages={state.locale === "en" ? en : fr} timeZone="Africa/Casablanca" now={new Date(1_790_000_000_000)}>{node}</NextIntlClientProvider>);
}
function expectSafe(html: string) {
  expect(html).toContain(SAFE_NAME);
  expect(html).not.toContain(FULL_NAME);
  expect(html).not.toContain("realName");
  expect(html).not.toContain("legalName");
}

describe("Company identity is displayed from backend-safe DTOs", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://logo-test.convex.site");
    state.locale = "en"; state.selection = null; state.queries = []; state.responses.clear(); state.loading = false;
    state.responses.set("companies/directory:listPublicCompanies", [{ ...company, realName: FULL_NAME, legalName: FULL_NAME }]);
    state.responses.set("serviceCatalog:listActive", []);
    state.responses.set("siteVisits/index:getForConversation", { viewerType: "client", canInvite: false, assessment });
    state.responses.set("finalQuotes/index:getForConversation", { viewerType: "client", canRequest: false, canPrepare: false, finalQuote });
    state.responses.set("finalQuotes/index:getPdfDownloadUrl", "https://files.example.test/final-quote.pdf");
  });
  afterEach(() => vi.unstubAllEnvs());

  for (const locale of ["en", "fr"] as const) {
    test.each([null, "https://logo-test.convex.site/company-logos/private/pending", "https://logo-test.convex.site/company-logos/private/rejected", "https://media.example.test/legacy-logo.png", "https://logo-test.convex.site/company-logos/public/approved"])(`${locale} logo consumers fail closed for %s and retain supplied masked names`, async logoUrl => {
      state.locale = locale;
      const row = { ...company, logoUrl };
      state.responses.set("companies/directory:listPublicCompanies", [row]);
      const proposal = { ...quote, company: { ...quote.company, logoUrl } };
      const summary = { ...thread, otherPartyAvatarUrl: logoUrl };
      const surfaces = [
        <CompanyDirectory key="directory" />,
        <ReceivedQuoteCard key="proposal" quote={proposal} onOpen={vi.fn()} />,
        <QuoteReviewContent key="quote" quote={proposal} confirmDecline={false} error={null} success={null} pendingAction={null} onReview={vi.fn()} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} />,
        <MessagesInboxView key="inbox" accountType="client" projects={[]} threads={[summary]} />,
        <ConversationContextPanel key="conversation" accountType="client" conversation={{ ...summary, viewerType: "client" }} conversationId={conversationId} />,
        await PublicCompanyProfile({ company: { ...row, headquarters: { regionCode: null, provinceCode: null }, marketplaceAvailable: true, invitationEligible: true, foundedYear: null, companySize: null, languages: [], website: null, reviews: [], portfolio: [] } }),
      ];
      for (const surface of ["category", "feed", "hiring"] as const) {
        state.selection = surface === "category" ? "renovation" : surface === "feed" ? "companies" : null;
        surfaces.push(surface === "category" ? <CategoryMarketplace /> : surface === "feed" ? <MarketplaceFeed /> : <HiringCompanyPreviews />);
        // Promotional selection is resolved during render, just as in the existing identity tests.
        const html = render(surfaces.pop());
        assertLogo(html);
      }
      state.selection = null;
      for (const surface of surfaces) assertLogo(render(surface));
      function assertLogo(html: string) {
        expectSafe(html);
        if (logoUrl?.includes("/public/")) {
          expect(html).toContain(`data-src="${logoUrl}"`); expect(html).toContain('data-unoptimized="true"');
        } else {
          expect(html).toContain((locale === "fr" ? fr : en).companyLogo.genericAlt);
          if (logoUrl) expect(html).not.toContain(logoUrl);
        }
        expect(html).not.toContain("Contains identifying branding");
      }
    });
  }

  for (const locale of ["en", "fr"] as const) {
    test.each(["category", "feed", "hiring"] as const)(`${locale} promotional %s cards cannot use static identities or recover private names`, surface => {
      state.locale = locale;
      state.selection = surface === "category" ? "renovation" : surface === "feed" ? "companies" : null;
      const html = render(surface === "category" ? <CategoryMarketplace /> : surface === "feed" ? <MarketplaceFeed /> : <HiringCompanyPreviews />);
      expectSafe(html);
      expect(html).toContain(`/${locale}/entreprises/s2mbou`);
      expect(html).toContain(locale === "en" ? "Renovation" : "Rénovation");
      expect(state.queries.map(query => query.name)).toEqual(["companies/directory:listPublicCompanies"]);
      expect(state.queries[0]).toMatchObject({ args: surface === "category" ? { service: "renovation", sort: "relevance", verifiedOnly: true } : { sort: "newest", verifiedOnly: true }, limit: surface === "hiring" ? 2 : surface === "feed" ? 6 : 5 });
      // A nullable backend rating is not replaced with a fabricated rating.
      expect(html).not.toContain("4.9");
    });

    test(`${locale} public directory names and image labels are unchanged safe DTO values`, () => {
      state.locale = locale;
      expectSafe(render(<CompanyDirectory />));
      expect(state.queries.every(query => ["serviceCatalog:listActive", "companies/directory:listPublicCompanies"].includes(query.name))).toBe(true);
    });

    test(`${locale} public profile and portfolio display only safe supplied text`, async () => {
      state.locale = locale;
      const profile: NonNullable<FunctionReturnType<typeof api.portfolio.index.getPublicCompanyProfile>> = {
        ...company, headquarters: { regionCode: null, provinceCode: null }, marketplaceAvailable: true, invitationEligible: true, foundedYear: 2016, companySize: "2to10", languages: ["french", "english"], website: null, reviews: [],
        portfolio: [{ id: "portfolio-1" as Id<"portfolioProjects">, title: `Work by ${SAFE_NAME}`, description: "company-document.pdf", city: "Rabat", projectType: "renovation", surface: 100, durationMonths: 2, year: 2026, status: "published", coverImageUrl: "https://media.example.test/work.webp", media: [], updatedAt: 1 }],
      };
      expectSafe(render(await PublicCompanyProfile({ company: profile })));
      expect(state.queries.every(query => !query.name.startsWith("companies/") && !query.name.startsWith("admin/"))).toBe(true);
    });

    test(`${locale} proposals, detail and shortlist keep the safe Company identity`, () => {
      state.locale = locale;
      expectSafe(render(<ReceivedQuoteCard quote={quote} onOpen={vi.fn()} />));
      expectSafe(render(<QuoteReviewContent quote={quote} confirmDecline={false} error={null} success={null} pendingAction={null} onReview={vi.fn()} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} />));
    });

    test(`${locale} Client invitations use their own safe DTO names`, () => {
      state.locale = locale;
      state.responses.set("invitations/index:listProjectInvitations", [{ id: "invitation-1", projectId, companyId, companyName: SAFE_NAME, isVerified: true, status: "pending", createdAt: 1, message: `Invite ${SAFE_NAME}.` }]);
      expectSafe(render(<ClientProjectInvitations projectId={projectId} />));
    });

    test(`${locale} inbox, active conversation header, body and context preserve safe identity`, () => {
      state.locale = locale;
      state.responses.set("messages/index:getConversation", { ...thread, viewerType: "client" });
      const message: FunctionReturnType<typeof api.messages.index.listMessages>["page"][number] = {
        id: "message-1" as Id<"messages">, senderType: "company", body: `Work by ${SAFE_NAME}. See attachment.pdf.`, createdAt: 1, isMine: false,
        attachment: { id: "attachment-1" as Id<"messageAttachments">, kind: "pdf", mimeType: "application/pdf", fileName: "attachment.pdf", sizeBytes: 1_024, downloadUrl: "https://files.example.test/attachment.pdf" },
      };
      state.responses.set("messages/index:listMessages", [message]);
      const html = render(<MessagesInboxView accountType="client" initialConversationId={conversationId} projects={[]} threads={[thread]} />);
      expectSafe(html);
      expect(html).toContain('title="attachment.pdf"');
      expectSafe(render(<ConversationContextPanel accountType="client" conversation={{ ...thread, viewerType: "client" }} conversationId={conversationId} />));
      expect(state.queries.some(query => query.name.startsWith("companies/"))).toBe(false);
    });

    test(`${locale} site visit, Final Quote sheet and workflow display safe names and filenames`, () => {
      state.locale = locale;
      expectSafe(render(<SiteAssessmentPanel result={{ viewerType: "client", canInvite: false, assessment }} />));
      const html = render(<FinalQuoteSheet conversationId={conversationId} quote={finalQuote} viewerType="client" onClose={vi.fn()} />);
      expectSafe(html);
      expect(html).toContain('href="https://files.example.test/final-quote.pdf"');
      expect(html).toContain((locale === "en" ? en : fr).finalQuote.downloadPdf);
      expectSafe(render(<MarketplaceWorkflowCard conversationId={conversationId} assessment={{ viewerType: "client", canInvite: false, assessment: null }} quote={{ viewerType: "client", canRequest: false, canPrepare: false, finalQuote }} />));
    });

    test(`${locale} notifications interpolate only safe names and previews`, () => {
      state.locale = locale;
      expectSafe(render(<NotificationItem notification={{ id: "notification-1" as Id<"notifications">, type: "message_received", entity: { type: "conversation", id: conversationId }, actorUserId: null,
        payload: { companyName: SAFE_NAME, actorDisplayName: SAFE_NAME, projectTitle: "Renovation", messagePreview: `${SAFE_NAME}: attachment.pdf` }, createdAt: 1, readAt: null }} onOpen={vi.fn()} />));
    });

    test(`${locale} Client project current-step Company card uses the safe thread name`, () => {
      state.locale = locale;
      state.responses.set("quotes/index:listReceivedInitialQuotes", [quote]);
      state.responses.set("messages/index:listMyThreads", [thread]);
      expectSafe(render(<ClientProjectCurrentStep project={{ id: projectId, viewerRole: "owner", status: "in_discussion" } as Parameters<typeof ClientProjectCurrentStep>[0]["project"]} />));
    });

    test(`${locale} authenticated components render the full identity supplied after a Deal`, () => {
      state.locale = locale;
      const revealedQuote = { ...quote, company: { ...quote.company, name: FULL_NAME } };
      const revealedThread = { ...thread, otherPartyName: FULL_NAME };
      const revealedAssessment = { ...assessment, companyName: FULL_NAME };
      const revealedFinalQuote = { ...finalQuote, companyName: FULL_NAME, status: "accepted" as const, canReview: false };
      state.responses.set("messages/index:getConversation", { ...revealedThread, viewerType: "client" });
      state.responses.set("messages/index:listMessages", []);
      state.responses.set("siteVisits/index:getForConversation", { viewerType: "client", canInvite: false, assessment: revealedAssessment });
      state.responses.set("finalQuotes/index:getForConversation", { viewerType: "client", canRequest: false, canPrepare: false, finalQuote: revealedFinalQuote });
      state.responses.set("deals/index:getByProject", { id: "deal-1", companyName: FULL_NAME, conversationId, initialQuoteId: quote.id, status: "active", reviewEligible: false });
      state.responses.set("invitations/index:listProjectInvitations", [{ id: "invitation-1", projectId, companyId, companyName: FULL_NAME, isVerified: true, status: "accepted", createdAt: 1 }]);
      const surfaces = [
        <ReceivedQuoteCard key="proposal" quote={revealedQuote} onOpen={vi.fn()} />,
        <QuoteReviewContent key="detail" quote={revealedQuote} confirmDecline={false} error={null} success={null} pendingAction={null} onReview={vi.fn()} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} />,
        <ClientProjectInvitations key="invitations" projectId={projectId} />,
        <MessagesInboxView key="messages" accountType="client" initialConversationId={conversationId} projects={[]} threads={[revealedThread]} />,
        <ConversationContextPanel key="context" accountType="client" conversation={{ ...revealedThread, viewerType: "client" }} conversationId={conversationId} />,
        <SiteAssessmentPanel key="visit" result={{ viewerType: "client", canInvite: false, assessment: revealedAssessment }} />,
        <FinalQuoteSheet key="final" conversationId={conversationId} quote={revealedFinalQuote} viewerType="client" onClose={vi.fn()} />,
        <MarketplaceWorkflowCard key="workflow" conversationId={conversationId} assessment={{ viewerType: "client", canInvite: false, assessment: null }} quote={{ viewerType: "client", canRequest: false, canPrepare: false, finalQuote: revealedFinalQuote }} />,
        <NotificationItem key="notification" notification={{ id: "notification-1" as Id<"notifications">, type: "message_received", entity: { type: "conversation", id: conversationId }, actorUserId: null,
          payload: { companyName: FULL_NAME, actorDisplayName: FULL_NAME, projectTitle: "Renovation", messagePreview: "See attachment.pdf." }, createdAt: 1, readAt: null }} onOpen={vi.fn()} />,
      ];
      for (const surface of surfaces) expect(render(surface)).toContain(FULL_NAME);
      const sheet = render(surfaces[6]);
      expect(sheet).toContain('href="https://files.example.test/final-quote.pdf"');
      expect(sheet).not.toContain(`${FULL_NAME}.pdf`);
      expect(state.queries.some(query => query.name.startsWith("companies/"))).toBe(false);
    });

    test(`${locale} selected-company card uses the Deal's exact Company and conversation`, () => {
      state.locale = locale;
      state.responses.set("quotes/index:listReceivedInitialQuotes", [{ ...quote, id: "unselected-quote", company: { ...quote.company, name: "Unselected company" } }, quote]);
      state.responses.set("messages/index:listMyThreads", [{ ...thread, id: "unselected-conversation", otherPartyName: "Unselected company" }, thread]);
      state.responses.set("deals/index:getByProject", { id: "deal-1", companyName: FULL_NAME, conversationId, initialQuoteId: quote.id, status: "active", reviewEligible: false });
      const project = { id: projectId, viewerRole: "owner", status: "company_selected" } as Parameters<typeof ClientProjectCurrentStep>[0]["project"];
      const html = render(<ClientProjectCurrentStep project={project} />);
      expect(html).toContain(FULL_NAME); expect(html).not.toContain("Unselected company");
      expect(html).toContain(conversationId); expect(html).not.toContain("unselected-conversation");
      expect(render(<ClientDealCompletion project={project} />)).toContain(FULL_NAME);
      state.responses.set("deals/index:getByProject", { id: "deal-1", companyName: FULL_NAME, status: "completed", reviewEligible: false, completedAt: 1 });
      expect(render(<ClientDealCompletion project={{ ...project, status: "completed" }} />)).toContain(FULL_NAME);
      state.responses.delete("deals/index:getByProject");
      expect(render(<ClientProjectCurrentStep project={project} />)).not.toContain("Unselected company");
    });
  }

  for (const locale of ["en", "fr"] as const) {
    test.each(["category", "feed", "hiring"] as const)(`${locale} promotional %s loading/empty states never fall back to static names`, surface => {
      state.locale = locale;
      state.selection = surface === "category" ? "renovation" : surface === "feed" ? "companies" : null;
      const node = surface === "category" ? <CategoryMarketplace /> : surface === "feed" ? <MarketplaceFeed /> : <HiringCompanyPreviews />;
      state.loading = true;
      const loading = render(node);
      expect(loading).toContain('aria-busy="true"'); expect(loading).not.toContain("S2MBOU");
      state.loading = false; state.responses.set("companies/directory:listPublicCompanies", []);
      const empty = render(node);
      const messages = locale === "en" ? en : fr;
      expect(empty).toContain(surface === "category" ? messages.home.marketplace.empty : messages.companyDirectory.empty);
      expect(empty).not.toContain("S2MBOU");
    });
  }

  test("promotional previews preserve supplied display names and deduplicate safe rows without identity lookups", () => {
    const suppliedName = "At*** Co********** Ma***";
    state.responses.set("companies/directory:listPublicCompanies", [{ ...company, name: suppliedName }, { ...company, name: suppliedName }]);
    const html = render(<HiringCompanyPreviews />);
    expect(html).toContain(suppliedName);
    expect(html.match(/<article /g)).toHaveLength(1);
    expect(html).not.toContain(FULL_NAME);
    expect(state.queries.map(query => query.name)).toEqual(["companies/directory:listPublicCompanies"]);
  });

  test("Client/public identity surfaces do not import frontend masking or private Company endpoints", () => {
    const files = ["components/home/category-marketplace.tsx", "components/home/marketplace-feed.tsx", "components/how-it-works/client-hiring-guide.tsx", "components/how-it-works/hiring-company-previews.tsx",
      "features/companies/hooks/use-public-company-preview.ts", "features/companies/components/company-directory.tsx", "features/companies/components/public-company-profile.tsx",
      "features/quotes/components/client-received-quotes.tsx", "features/invitations/components/client-project-invitations.tsx", "features/messages/components/messages-inbox.tsx", "features/messages/components/conversation-context-panel.tsx",
      "features/site-assessments/components/site-assessment-panel.tsx", "features/final-quotes/components/conversation-final-quote-panel.tsx", "features/marketplace/components/conversation-marketplace-workflow.tsx", "features/projects/components/client-project-current-step.tsx", "features/notifications/components/notification-item.tsx"];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/maskCompanyName|convex\/lib\/companyName|legalName|realName|api\.admin\.|api\.companies\.index\.|featuredMarketplaceCompanies|companiesForCategory/);
    }
    expect(readFileSync("content/marketplace.ts", "utf8")).not.toMatch(/marketplaceCompanies|S2MBOU|Atlas Habitat/);
  });
});
