import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { CompanyDirectorySkeleton } from "./components/company-directory-skeleton";

describe("company directory UX contract", () => {
  test("FR and EN expose the same translated directory keys", () => {
    expect(Object.keys(fr.companyDirectory).sort()).toEqual(Object.keys(en.companyDirectory).sort());
    expect(en.companyDirectory.searchPlaceholder).toBe("Search companies or services");
    expect(fr.companyDirectory.searchPlaceholder).toBe("Rechercher une entreprise ou un service");
    expect(en.companyDirectory.loadMore).toBe("Load more");
    expect(fr.companyDirectory.loadMore).toBe("Voir plus");
    expect(en.companyDirectory.empty).toBe("No companies match your search.");
    expect(fr.companyDirectory.empty).toBe("Aucune entreprise ne correspond à votre recherche.");
  });

  test("renders route and card skeletons as an announced loading state", () => {
    const html = renderToStaticMarkup(<CompanyDirectorySkeleton label="Loading companies…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading companies…");
    expect(html.match(/skeleton-block/g)?.length).toBeGreaterThan(10);
  });
});
