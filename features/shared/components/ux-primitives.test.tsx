import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { CompanyCardSkeleton, FormSkeleton, PageSkeleton } from "./skeletons";

describe("shared UX primitives", () => {
  test("skeletons match loading status and disappear from the ready UI contract", () => {
    const page = renderToStaticMarkup(<PageSkeleton label="Chargement de la page…" />);
    expect(page).toContain('role="status"');
    expect(page).toContain("Chargement de la page…");
    expect(page).toContain("skeleton-block");
    expect(renderToStaticMarkup(<CompanyCardSkeleton />)).toContain("skeleton-block");
    expect(renderToStaticMarkup(<FormSkeleton label="Loading the form…" />)).toContain("Loading the form…");
  });
});
