import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { Dialog } from "radix-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { describeAppError } from "@/lib/errors";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { CompanyProfileEditor } from "./components/company-profile-editor";
import { CompanySettings } from "./components/profile/company-settings";
import { GeographicCoverageForm, GeographicCoveragePanel } from "./components/profile/geographic-coverage-editor";

type Control = {
  onChange?: (event: { target: { value: string; checked: boolean } }) => void;
  onClick?: () => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
  disabled?: boolean;
};

const state = vi.hoisted(() => ({
  controls: new Map<string, Control>(),
  coverage: ["R:09", "P:09.541"] as string[] | undefined,
  owner: true,
  accountType: "company" as string,
  update: vi.fn(async () => null as null),
  toast: vi.fn(),
  mutationName: "",
}));

function remember(type: unknown, props: object | null) {
  if (!props || typeof props !== "object") return;
  const control = props as Control & { id?: string };
  if (typeof control.id === "string" && (type === "input" || type === "select" || type === "button" || type === "form")) {
    state.controls.set(control.id, control);
  }
}

vi.mock("react/jsx-runtime", async (importActual) => {
  type Factory = (...args: unknown[]) => unknown;
  const runtime = await importActual<Record<string, Factory>>();
  const capture = (factory: Factory): Factory => (...args) => {
    remember(args[0], args[1] as object | null);
    return factory(...args);
  };
  return { ...runtime, jsx: capture(runtime.jsx), jsxs: capture(runtime.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importActual) => {
  type Factory = (...args: unknown[]) => unknown;
  const runtime = await importActual<Record<string, Factory>>();
  return { ...runtime, jsxDEV: (...args: unknown[]) => {
    remember(args[0], args[1] as object | null);
    return runtime.jsxDEV(...args);
  } };
});
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: (ref: unknown) => {
    state.mutationName = getFunctionName(ref as never);
    return state.update;
  },
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => null }));
vi.mock("@/features/shared/components/app-feedback", () => ({
  useToast: () => ({ showToast: state.toast }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode; href?: unknown }) => <a {...props} href="#">{children}</a>,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const profileFixture = {
  slug: "atlas-build",
  name: "Atlas Build",
  description: "Construction services for residential and commercial clients.",
  city: "Agadir",
  phone: "0612345678",
  website: "https://atlas.example/",
  yearsExperience: 12,
  foundedYear: 2012,
  companySize: "11to50" as const,
  languages: ["arabic" as const, "french" as const],
  serviceAreas: ["rabat" as const, "sale" as const],
  services: ["structural" as const, "finishing" as const],
  serviceOptions: Object.keys(en.companyProfileManager.serviceOptions),
  catalogServices: [],
  selectedServiceIds: [],
  serviceAreaOptions: Object.keys(en.companyProfileManager.serviceAreaOptions),
  languageOptions: Object.keys(en.companyProfileManager.languages),
  companySizeOptions: Object.keys(en.companyProfileManager.companySize),
  logoUrl: null,
  coverImageUrl: null,
  legal: {
    verificationStatus: "pending" as const,
    legalName: "Atlas Build SARL",
    ice: "001122334455667",
    rcNumber: "RC-123",
    legalRepresentative: "Owner Name",
    phone: "0522000000",
    address: "Agadir",
    documents: [{ documentType: "rc" as const, fileName: "registre-commerce.pdf" }],
  },
};

function render(locale: "fr" | "en", child: React.ReactNode) {
  state.controls.clear();
  const onError = vi.fn();
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} onError={onError}>
      {child}
    </NextIntlClientProvider>,
  );
  expect(onError).not.toHaveBeenCalled();
  return html;
}

function change(id: string, value: { checked?: boolean; value?: string }) {
  const control = state.controls.get(id);
  expect(control?.onChange).toEqual(expect.any(Function));
  control!.onChange!({ target: { checked: value.checked ?? false, value: value.value ?? "" } });
}

const formProps = {
  browseRegion: "",
  provinceQuery: "",
  saving: false,
  error: null as string | null,
  success: false,
  dirty: true,
  onBrowseRegion: vi.fn(),
  onProvinceQuery: vi.fn(),
  onSave: vi.fn(),
  onDiscard: vi.fn(),
  onDraftChange: vi.fn(),
};

function renderForm(locale: "fr" | "en", draft: readonly string[], extra: Partial<typeof formProps> = {}) {
  const props = { ...formProps, ...extra, draft };
  return render(locale, <GeographicCoverageForm {...props} />);
}

beforeEach(() => {
  state.coverage = ["R:09", "P:09.541"];
  state.owner = true;
  state.accountType = "company";
  state.mutationName = "";
  state.update = vi.fn(async () => null);
  state.toast.mockClear();
  formProps.onBrowseRegion.mockReset();
  formProps.onProvinceQuery.mockReset();
  formProps.onSave.mockReset();
  formProps.onDiscard.mockReset();
  formProps.onDraftChange.mockReset();
  vi.mocked(useQuery).mockImplementation(((ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref as never);
    if (name === "users:currentUser") {
      return { _id: "owner", accountType: state.accountType, onboardingStatus: "completed", email: "owner@atlas.example" };
    }
    if (name === "companyVerification/index:getVerificationStatus") return { status: "pending", canManageDocuments: state.owner };
    if (name === "companyLogos/index:getMyLogos") return { submitted: null, approved: null };
    if (name === "companies/index:getProfileManager") return state.owner ? profileFixture : undefined;
    if (name === "companies/index:getMyGeographicCoverage") return state.coverage;
    if (name === "portfolio/index:getPortfolioManager") return { projects: [] };
    return undefined;
  }) as never);
});

describe.each(["fr", "en"] as const)("GEO8.1 coverage editor %s", (locale) => {
  const copy = locale === "fr" ? fr.companyProfileManager.coverage : en.companyProfileManager.coverage;
  const regionName = (code: string) => {
    const region = getRegions().find((item) => item.code === code)!;
    return locale === "fr" ? region.nameFr : region.nameEn;
  };

  test("loads existing selections, empty coverage and legacy cities separately", () => {
    const loaded = renderForm(locale, ["MA", "R:09", "P:09.541"]);
    expect(loaded).toContain(copy.allMorocco);
    expect(loaded).toContain(regionName("09"));
    expect(loaded).toContain("Taroudannt");
    expect(loaded).toContain(copy.nationalOverlap);
    expect(loaded).toContain('data-scope="MA"');
    expect(loaded).toContain('data-scope="R:09"');
    expect(loaded).toContain("Taroudannt");
    expect(loaded).toContain("coverage-scope-remove-P-09.541");
    expect(loaded).not.toContain('data-scope="P:09.541"');
    const empty = renderForm(locale, []);
    expect(empty).toContain(copy.empty);
    expect(empty).not.toContain("coverage-scope-remove");
    const profile = render(locale, <CompanyProfileEditor />);
    expect(profile).toContain(copy.title);
    expect(profile).toContain("Taroudannt");
    expect(profile).toContain(locale === "fr" ? "Salé" : "Salé");
    expect(profile).toContain(copy.legacyTitle);
    expect(profile).toContain(copy.legacyHelp);
    expect(profile).toContain(copy.headquartersSeparate);
    expect(profile).not.toContain('type="checkbox"');
    expect(profile).toContain(copy.edit);
    const settings = render(locale, <CompanySettings section="profile" />);
    expect(settings).toContain(copy.title);
    expect(settings).toContain(copy.legacyHelp);
    expect(settings).toContain("Agadir");
  });

  test("toggles Morocco, regions and provinces without treating browse as coverage", () => {
    const draft: string[] = [];
    const onDraftChange = vi.fn((next: string[]) => { draft.splice(0, draft.length, ...next); });
    const onBrowseRegion = vi.fn();
    renderForm(locale, draft, { onDraftChange, onBrowseRegion });
    change("coverage-scope-MA", { checked: true });
    expect(draft).toEqual(["MA"]);
    change("coverage-scope-R-09", { checked: true });
    change("coverage-scope-R-04", { checked: true });
    expect(draft).toEqual(["MA", "R:09", "R:04"]);
    change("coverage-browse-region", { value: "09" });
    expect(onBrowseRegion).toHaveBeenCalledWith("09");
    expect(draft).toEqual(["MA", "R:09", "R:04"]);
    const browsed = renderForm(locale, draft, { browseRegion: "09", onDraftChange });
    for (const province of getProvincesByRegion("09")) expect(browsed).toContain(`data-scope="P:${province.code}"`);
    expect(browsed).not.toContain('data-scope="P:04.421"');
    expect(browsed).toContain(copy.browseHelp);
    change("coverage-scope-P-09.541", { checked: true });
    expect(draft).toEqual(["MA", "R:09", "R:04", "P:09.541"]);
    expect(draft).not.toContain("R:01");
    const otherRegion = renderForm(locale, draft, { browseRegion: "01", onDraftChange });
    expect(otherRegion).toContain('data-scope="P:01.511"');
    change("coverage-scope-P-01.511", { checked: true });
    expect(draft).toEqual(["MA", "R:09", "R:04", "P:09.541", "P:01.511"]);
    change("coverage-scope-MA", { checked: false });
    expect(draft).toEqual(["R:09", "R:04", "P:09.541", "P:01.511"]);
    const html = renderForm(locale, draft, { browseRegion: "09", provinceQuery: "zzz" });
    expect(html).toContain(copy.noProvinceMatches);
    expect(html).toContain("min-h-11");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("sm:flex-row");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("overflow-x-hidden");
    expect(html).toContain('type="search"');
    expect(html).toContain('type="button"');
    expect(html).toContain("focus-visible:outline-brand");
    expect(html).toContain('for="coverage-browse-region"');
    expect(html).toContain('aria-describedby="coverage-browse-help"');
  });

  test("shows saving, success and validation copy, and discards only on request", () => {
    const saving = renderForm(locale, ["R:09"], { saving: true, dirty: true });
    expect(saving).toContain(locale === "fr" ? "Enregistrement…" : "Saving…");
    expect(state.controls.get("coverage-save")?.disabled).toBe(true);
    expect(state.controls.get("coverage-discard")?.disabled).toBe(true);
    const success = renderForm(locale, ["R:09"], { success: true, dirty: false });
    expect(success).toContain(copy.success);
    expect(state.controls.get("coverage-discard")?.disabled).toBe(true);
    const failureCopy = (locale === "fr" ? fr : en).ux.error.codes.INVALID_COMPANY_COVERAGE_SCOPE;
    const failure = renderForm(locale, ["R:09"], { error: failureCopy, dirty: true });
    expect(failure).toContain("role=\"alert\"");
    expect(failure).toContain(failureCopy);
    expect(failure).toContain('data-scope="R:09"');
    const onDiscard = vi.fn();
    renderForm(locale, ["R:09", "P:01.511"], { dirty: true, onDiscard });
    state.controls.get("coverage-discard")!.onClick!();
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(copy.discard).toBe(locale === "fr" ? "Annuler les modifications" : "Discard changes");
    expect(locale === "fr" ? fr.companyProfileManager.save : en.companyProfileManager.save).toBe(
      locale === "fr" ? "Enregistrer les modifications" : "Save changes",
    );
  });
});

describe("GEO8.1 coverage save and access", () => {
  test("FR and EN coverage copy and error codes match", () => {
    expect(Object.keys(fr.companyProfileManager.coverage).sort()).toEqual(Object.keys(en.companyProfileManager.coverage).sort());
    expect(fr.companyProfileManager.coverage.allMorocco).toBe("Tout le Maroc");
    expect(en.companyProfileManager.coverage.allMorocco).toBe("All Morocco");
    expect(fr.companyProfileManager.serviceAreaOptions.sale).toBe("Salé");
    expect(en.companyProfileManager.serviceAreaOptions.sale).toBe("Salé");
    for (const code of [
      "COMPANY_COVERAGE_LIMIT_EXCEEDED",
      "INVALID_COMPANY_COVERAGE_SCOPE",
      "DUPLICATE_COMPANY_COVERAGE_SCOPE",
      "INVALID_COMPANY_COVERAGE_STATE",
      "COMPANY_COVERAGE_INDEX_CORRUPTED",
    ] as const) {
      expect(describeAppError({ data: code }).messageKey).toBe(`error.codes.${code}`);
      expect(fr.ux.error.codes[code]).toBeTruthy();
      expect(en.ux.error.codes[code]).toBeTruthy();
      expect(fr.ux.error.codes[code]).not.toBe(en.ux.error.codes[code]);
    }
  });

  test("saves the complete replacement once and preserves the draft when the mutation fails", async () => {
    const keys = ["P:04.421", "R:09", "MA"];
    render("en", <Dialog.Root><GeographicCoveragePanel savedKeys={keys} /></Dialog.Root>);
    expect(state.mutationName).toBe("companies/index:updateMyGeographicCoverage");
    const first = state.controls.get("coverage-form")!.onSubmit!({ preventDefault() {} });
    const second = state.controls.get("coverage-form")!.onSubmit!({ preventDefault() {} });
    await first;
    await second;
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledWith({ coverageScopeKeys: keys });
    expect(state.toast).toHaveBeenCalledWith(en.companyProfileManager.coverage.success);

    state.toast.mockClear();
    state.update = vi.fn(async () => {
      throw Object.assign(new Error("denied"), { data: "COMPANY_OWNER_REQUIRED" });
    });
    render("fr", <Dialog.Root><GeographicCoveragePanel savedKeys={["R:04"]} /></Dialog.Root>);
    await state.controls.get("coverage-form")!.onSubmit!({ preventDefault() {} });
    expect(state.update).toHaveBeenCalledWith({ coverageScopeKeys: ["R:04"] });
    expect(state.toast).toHaveBeenCalledWith(fr.companyProfileManager.coverage.failure, "error");

    state.update = vi.fn(async () => null);
    render("en", <Dialog.Root><GeographicCoveragePanel savedKeys={[]} /></Dialog.Root>);
    await state.controls.get("coverage-form")!.onSubmit!({ preventDefault() {} });
    expect(state.update).toHaveBeenCalledWith({ coverageScopeKeys: [] });
  });

  test("owner profile loads coverage and other roles do not", () => {
    render("en", <CompanyProfileEditor />);
    const names = vi.mocked(useQuery).mock.calls.map(([ref, args]) => args === "skip" ? "skip" : getFunctionName(ref as never));
    expect(names).toContain("companies/index:getMyGeographicCoverage");
    vi.mocked(useQuery).mockClear();
    state.owner = false;
    const denied = render("en", <CompanyProfileEditor />);
    expect(denied).toContain(en.ux.error.codes.COMPANY_OWNER_REQUIRED);
    const after = vi.mocked(useQuery).mock.calls.map(([ref, args]) => args === "skip" ? "skip" : getFunctionName(ref as never));
    expect(after).not.toContain("companies/index:getMyGeographicCoverage");
    expect(after).not.toContain("companies/index:getProfileManager");
    state.accountType = "client";
    state.owner = true;
    render("en", <CompanyProfileEditor />);
    const clientCalls = vi.mocked(useQuery).mock.calls.map(([ref, args]) => args === "skip" ? "skip" : getFunctionName(ref as never));
    expect(clientCalls).not.toContain("companies/index:getMyGeographicCoverage");
  });

  test("shows a loading state before coverage arrives and keeps legacy cities visible", () => {
    state.coverage = undefined;
    const html = render("en", <CompanyProfileEditor />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(en.companyProfileManager.coverage.loading);
    expect(html).toContain(en.companyProfileManager.coverage.legacyTitle);
    expect(html).toContain("Salé");
    expect(html).not.toContain(en.companyProfileManager.coverage.edit);
    expect(html).not.toContain('type="checkbox"');
  });
});
