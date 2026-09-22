import createIntlMiddleware from "next-intl/middleware";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  "/:locale/espace-client(.*)",
  "/:locale/espace-entreprise(.*)",
  "/:locale/client(.*)",
  "/:locale/company(.*)",
]);

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
