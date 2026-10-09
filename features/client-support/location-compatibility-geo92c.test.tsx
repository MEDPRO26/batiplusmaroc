import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { AdminSupportPanel } from "@/features/client-support/components/admin-support-panel";
import { ClientSupportPage } from "@/features/client-support/components/client-support-page";
import type { SupportMessage, SupportSummary } from "@/features/client-support/lib/support-thread";
import { toDetailedProjectLocation, type RecordedProjectLocation } from "@/lib/geography/project-location";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const mocked = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  pages: {} as Record<string, unknown[]>,
  reads: [] as { name: string; args: unknown }[],
  writes: [] as { name: string; args: unknown }[],
}));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("convex/react", () => ({
  useQuery: (ref: never, args: unknown) => {
    const name = getFunctionName(ref);
    mocked.reads.push({ name, args });
    return args === "skip" ? undefined : mocked.queries[name];
  },
  usePaginatedQuery: (ref: never, args: unknown) => {
    const name = getFunctionName(ref);
    mocked.reads.push({ name, args });
    return { results: mocked.pages[name] ?? [], status: "Exhausted", loadMore: vi.fn() };
  },
  useMutation: (ref: never) => (args: unknown) => {
    mocked.writes.push({ name: getFunctionName(ref), args });
    return Promise.resolve({});
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string | { pathname: string; params?: Record<string, string> }; children: ReactNode }) => {
    const path = typeof href === "string" ? href : Object.entries(href.params ?? {}).reduce(
      (value, [key, param]) => value.replace(`[${key}]`, param), href.pathname,
    );
    return <a href={path} {...props}>{children}</a>;
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/support",
  getPathname: () => "/admin/support",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

const projectId = "oc3-rural-project" as Id<"projects">;
const conversationId = "oc3-rural-support" as Id<"clientSupportConversations">;
const at = Date.parse("2026-10-09T12:00:00Z");
type Geography = Omit<RecordedProjectLocation, "city"> & { city?: SupportSummary["project"]["city"] };
const structured = {
  locationMode: "structured", regionCode: "08", provinceCode: "08.401",
  communeName: "  Skoura  ", localityName: "Douar Aït Atlas", neighborhood: "Ancien quartier",
} as const;
const cases: { name: string; fields: Geography; label: { en: string; fr: string }; incomplete?: boolean }[] = [
  { name: "structured without city", fields: structured, label: { en: "Drâa-Tafilalet · Ouarzazate · Skoura · Douar Aït Atlas · Ancien quartier", fr: "Drâa-Tafilalet · Ouarzazate · Skoura · Douar Aït Atlas · Ancien quartier" } },
  { name: "legacy city only", fields: { city: "tangier" }, label: { en: "Tangier", fr: "Tanger" } },
  { name: "province without invented region", fields: { provinceCode: "08.401" }, label: { en: "Ouarzazate", fr: "Ouarzazate" }, incomplete: true },
  { name: "region without province", fields: { regionCode: "08" }, label: { en: "Drâa-Tafilalet", fr: "Drâa-Tafilalet" }, incomplete: true },
  { name: "Unicode locality only", fields: { localityName: "  دوار آيت   أطلس ⴰⵣⵓⵍ  " }, label: { en: "دوار آيت أطلس ⴰⵣⵓⵍ", fr: "دوار آيت أطلس ⴰⵣⵓⵍ" }, incomplete: true },
  { name: "empty historical geography", fields: {}, label: { en: en.projectLocation.unspecified, fr: fr.projectLocation.unspecified }, incomplete: true },
  { name: "invalid historical administrative codes", fields: { regionCode: "historical", provinceCode: "08.401", communeName: "Skoura" }, label: { en: "Skoura", fr: "Skoura" }, incomplete: true },
  { name: "structured with retained legacy city", fields: { ...structured, city: "rabat" }, label: { en: "Drâa-Tafilalet · Ouarzazate · Skoura · Douar Aït Atlas · Ancien quartier", fr: "Drâa-Tafilalet · Ouarzazate · Skoura · Douar Aït Atlas · Ancien quartier" } },
];

beforeEach(() => {
  mocked.queries = {}; mocked.pages = {}; mocked.reads = []; mocked.writes = [];
});

function summary(fields: Geography): SupportSummary {
  return {
    id: conversationId,
    project: { id: projectId, title: "Rural support", status: "published", city: fields.city ?? null, location: toDetailedProjectLocation(fields) },
    clientDisplayName: "Sara Client", requestedKinds: ["free_help", "coordination_discussion"],
    entryCount: 2, readThroughSequence: 0, unreadCount: 2, hasUnread: true,
    lastEntry: { id: "request-coordination" as Id<"clientSupportMessages">, sequence: 2, createdAt: at,
      kind: "request", senderType: "client", requestKind: "coordination_discussion",
      eventKey: "clientSupport.events.coordinationDiscussionRequested" },
    createdAt: at, updatedAt: at,
  };
}

function fixture(role: "client" | "admin", fields: Geography) {
  const conversation = summary(fields);
  mocked.queries = {
    "users:currentUser": { _id: `${role}-user`, accountType: role, onboardingStatus: "completed" },
    "projects/index:getMyProject": { ...conversation.project, viewerRole: "owner" },
    "clientSupport/index:getMyConversation": conversation,
    "clientSupport/index:getAdminConversation": conversation,
    "coordinationAgreements/index:getMyAgreement": null,
    "coordinationAgreements/index:getAdminAgreement": null,
  };
  const history: SupportMessage[] = (["free_help", "coordination_discussion"] as const).map((kind, index) => ({
    id: `request-${index}` as Id<"clientSupportMessages">, conversationId, sequence: index + 1,
    createdAt: at, isOwnMessage: role === "client", senderDisplayName: "Sara Client",
    kind: "request", senderType: "client", requestKind: kind,
    eventKey: kind === "free_help" ? "clientSupport.events.freeHelpRequested" : "clientSupport.events.coordinationDiscussionRequested",
  }));
  mocked.pages = {
    "clientSupport/index:listAdminConversations": [conversation],
    "clientSupport/index:listMyMessages": history,
    "clientSupport/index:listAdminMessages": history,
  };
}

function render(locale: "en" | "fr", role: "client" | "admin") {
  const errors: unknown[] = [];
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca" onError={error => errors.push(error)}>
      {role === "client" ? <ClientSupportPage projectId={projectId} /> : (
        <AdminShell email="admin@example.test" firstName="Ada" lastName="Admin">
          <AdminSupportPanel initialProjectId={projectId} />
        </AdminShell>
      )}
    </NextIntlClientProvider>,
  );
  expect(errors).toEqual([]);
  expect(mocked.writes).toEqual([]);
  return html;
}

describe.each(["en", "fr"] as const)("GEO9.2C OC3 %s location presentation", locale => {
  const catalog = locale === "en" ? en : fr;
  test.each(cases)("Client card and both request histories: $name", ({ fields, label }) => {
    fixture("client", fields);
    const html = render(locale, "client");
    expect(html).toContain(`>${label[locale]}</dd>`);
    expect(html).toContain(`>${catalog.clientSupport.page.contextCity}</dt>`);
    expect(html).toContain(catalog.clientSupport.events.freeHelpRequested);
    expect(html).toContain(catalog.clientSupport.events.coordinationDiscussionRequested);
    expect(html).not.toContain("cityOptions.");
    expect(mocked.reads.some(read => read.name === "clientSupport/index:getAdminConversation")).toBe(false);
    if (fields.provinceCode && !fields.regionCode) expect(html).not.toContain("Drâa-Tafilalet");
    if (fields.locationMode === "structured" && fields.city) expect(html).not.toContain(
      catalog.projectWizard.cityOptions.rabat,
    );
  });

  test.each(cases)("Admin request/inbox/thread context: $name", ({ name, fields, label, incomplete }) => {
    fixture("admin", fields);
    const html = render(locale, "admin");
    const location = name === "empty historical geography" ? catalog.adminProjectLocation.incomplete
      : incomplete ? catalog.adminProjectLocation.incompleteWithDetails.replace("{location}", label[locale])
      : label[locale];
    expect(html).toContain(`>${location}</dd>`);
    expect(html).toContain(catalog.clientSupport.events.coordinationDiscussionRequested);
    expect(html).toContain(catalog.clientSupport.events.freeHelpRequested);
    expect(mocked.reads.some(read => read.name === "clientSupport/index:getMyConversation")).toBe(false);
    if (fields.provinceCode && !fields.regionCode) expect(html).not.toContain("Drâa-Tafilalet");
  });

  test("free-text locality is escaped text with dots, never a translation key", () => {
    fixture("client", { ...structured, localityName: 'Douar <img src=x onerror="bad"> · cityOptions.rabat' });
    const html = render(locale, "client");
    expect(html).toContain("Douar &lt;img src=x onerror=&quot;bad&quot;&gt; · cityOptions.rabat");
    expect(html).not.toContain("<img src=x");
  });

  test.each(["client", "admin"] as const)("%s accepts an older city-only response during rollout", role => {
    fixture(role, { city: "tangier" });
    for (const key of ["projects/index:getMyProject", "clientSupport/index:getMyConversation", "clientSupport/index:getAdminConversation"]) {
      const value = mocked.queries[key] as { location?: unknown; project?: { location?: unknown } };
      if (value.project) delete value.project.location;
      else delete value.location;
    }
    expect(render(locale, role)).toContain(`>${catalog.projectWizard.cityOptions.tangier}</dd>`);
  });

  test("structured context without support does not create a request or agreement", () => {
    fixture("client", structured);
    mocked.queries["clientSupport/index:getMyConversation"] = null;
    const html = render(locale, "client");
    expect(html).toContain(cases[0].label[locale]);
    expect(html).toContain(catalog.clientSupport.actions.freeHelp.action);
    expect(html).toContain(catalog.clientSupport.actions.coordination.action);
    expect(mocked.reads.some(read => read.name.startsWith("coordinationAgreements/"))).toBe(false);
  });
});

test.each(["company", "admin", "seo_team", "anonymous", "pendingClient"] as const)("Client OC3 hides location and skips private readers for %s", role => {
  fixture("client", structured);
  mocked.queries["users:currentUser"] = role === "anonymous" ? null : {
    accountType: role === "pendingClient" ? "client" : role,
    onboardingStatus: role === "pendingClient" ? "pending" : "completed",
  };
  const html = render("en", "client");
  expect(html).not.toContain("Douar Aït Atlas");
  expect(html).not.toContain("Rural support");
  expect(mocked.reads.filter(read => (read.name.startsWith("clientSupport/") || read.name === "projects/index:getMyProject") && read.args !== "skip")).toEqual([]);
});
