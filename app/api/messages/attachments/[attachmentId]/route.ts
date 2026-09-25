import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const token = await convexAuthNextjsToken();
  if (!token) return new Response("Unauthorized", { status: 401, headers: privateHeaders });
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!convexSiteUrl) return new Response("Service unavailable", { status: 503, headers: privateHeaders });
  const { attachmentId } = await params;
  const upstream = await fetch(
    `${convexSiteUrl}/messages/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.status === 404 ? "Not found" : "Download failed", {
      status: upstream.status === 404 ? 404 : 502,
      headers: privateHeaders,
    });
  }
  const headers = new Headers({
    ...privateHeaders,
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["content-disposition", "content-length"] as const) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: 200, headers });
}
