import { env } from "../_generated/server";

const webOrigins = ["https://batiplusmaroc.com", "https://www.batiplusmaroc.com"];
const allowedRequestHeaders = new Set(["authorization", "content-type", "x-upload-token"]);

/** Extra development/preview origins must be configured explicitly, never inferred from a request. */
function allowedOrigins() {
  const origins = new Set(webOrigins);
  for (const configured of env.VERIFICATION_WEB_ORIGINS?.split(",") ?? []) {
    try {
      const url = new URL(configured.trim());
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
          url.pathname === "/" && !url.search && !url.hash) origins.add(url.origin);
    } catch { /* Invalid entries fail closed. */ }
  }
  return origins;
}

export function verificationHttpUrl(path: string) {
  return `${env.CONVEX_SITE_URL.replace(/\/$/, "")}/company-verification/${path}`;
}

export function verificationDocumentUrl(documentId: string) {
  return verificationHttpUrl(`documents/${encodeURIComponent(documentId)}`);
}

/** No cookies cross origins; the browser sends its Convex JWT in Authorization. */
export function verificationCorsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get("Origin");
  if (origin === null) return { Vary: "Origin" }; // Authenticated non-browser clients still require JWT authorization.
  if (!allowedOrigins().has(origin)) return null;
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

export function verificationPreflight(request: Request, method: "GET" | "POST") {
  const cors = verificationCorsHeaders(request);
  const requestedMethod = request.headers.get("Access-Control-Request-Method");
  const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "")
    .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!request.headers.get("Origin") || !cors || requestedMethod !== method ||
      requestedHeaders.some(header => !allowedRequestHeaders.has(header) || (method === "GET" && header !== "authorization"))) {
    return new Response(null, { status: 403, headers: { Vary: "Origin", "Cache-Control": "private, no-store" } });
  }
  return new Response(null, { status: 204, headers: { ...cors,
    "Access-Control-Allow-Methods": method,
    "Access-Control-Allow-Headers": method === "POST" ? "Authorization, Content-Type, X-Upload-Token" : "Authorization",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "private, no-store",
  } });
}
