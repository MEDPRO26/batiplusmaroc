import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname !== "/" && !pathname.endsWith("/")) {
    const destination = new URL(request.url);
    destination.pathname = `${pathname}/`;

    return new Response(null, {
      status:
        pathname === "/second-oeuvre" || pathname === "/nos-realisations"
          ? 301
          : 308,
      headers: { location: destination.toString() },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
