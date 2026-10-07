// Import the installed matcher source directly: the package's server barrel
// also loads Next server-only APIs that Node's ESM test runner cannot resolve.
import { createRouteMatcher } from "../../node_modules/@convex-dev/auth/src/nextjs/server/routeMatcher";
import { NextRequest } from "next/server.js";
import { describe, expect, test } from "vitest";
import { PROTECTED_ROUTE_PATTERNS } from "./protected-routes";

const isProtected = createRouteMatcher([...PROTECTED_ROUTE_PATTERNS]);
const matches = (path: string) => isProtected(new NextRequest(`https://batiplus.example.test${path}`));

describe("private workspace route matching", () => {
  for (const locale of ["fr", "en"]) {
    for (const path of ["messages", "messages/private-thread", "client/projects/private-project/batiplus", "admin/support"]) {
      test(`protects /${locale}/${path} before locale rewriting`, () => {
        expect(matches(`/${locale}/${path}`)).toBe(true);
        expect(matches(`/${locale}/${path}/`)).toBe(true);
      });
    }
  }

  test("keeps public sign-in and marketplace discovery paths accessible", () => {
    for (const path of ["/en/sign-in", "/fr/connexion", "/en/companies", "/fr/entreprises", "/en/browse-projects", "/fr/projets"]) {
      expect(matches(path)).toBe(false);
    }
  });
});
