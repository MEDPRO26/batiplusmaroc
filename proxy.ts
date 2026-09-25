import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { routing } from "./i18n/routing";
import { PROTECTED_ROUTE_PATTERNS } from "./lib/auth/protected-routes";

const intlMiddleware = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher([...PROTECTED_ROUTE_PATTERNS]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const pathname = request.nextUrl.pathname;
  // Keep App Router API routes outside next-intl locale rewriting.
  if (pathname.startsWith("/api/") || pathname.startsWith("/trpc/")) {
    return NextResponse.next();
  }

  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    const locale = pathname.split("/")[1];
    return nextjsMiddlewareRedirect(request, locale === "en" ? "/en/sign-in" : "/fr/connexion");
  }

  return intlMiddleware(request);
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
