import { describe, expect, test } from "vitest";
import { routes } from "@/lib/routes";
import { getProjectCta } from "./project-cta";

describe("getProjectCta", () => {
  test("sends companies to project discovery", () => {
    expect(getProjectCta("company")).toEqual({
      href: routes.browseProjects,
      labelKey: "findProjects",
    });
  });

  test("keeps the post-project CTA for clients", () => {
    expect(getProjectCta("client")).toEqual({
      href: routes.postProject,
      labelKey: "postProject",
    });
  });
});
