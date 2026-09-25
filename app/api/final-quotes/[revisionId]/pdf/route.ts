import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ revisionId: string }> },
) {
  const token = await convexAuthNextjsToken();
  if (!token) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!convexSiteUrl) return new Response("Service unavailable", { status: 503 });
  const { revisionId } = await params;
  const upstream = await fetch(
    `${convexSiteUrl}/final-quotes/pdf/${encodeURIComponent(revisionId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.status === 404 ? "Not found" : "Download failed", {
      status: upstream.status === 404 ? 404 : 502,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff",
  });
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("Content-Disposition", disposition);
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
