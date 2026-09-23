import createIntlMiddleware from "next-intl/middleware";
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
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    const locale = request.nextUrl.pathname.split("/")[1];
    return nextjsMiddlewareRedirect(request, locale === "en" ? "/en/sign-in" : "/fr/connexion");
  }

  return intlMiddleware(request);
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
