import type { Id } from "@/convex/_generated/dataModel";

/** Never send a session JWT to a proxy, unrelated host, or redirected URL. */
function directVerificationUrl(value: string, kind: "upload" | "download") {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!site) throw new Error("DOCUMENT_UPLOAD_FAILED");
  const url = new URL(value);
  const pathMatches = kind === "upload" ? url.pathname === "/company-verification/upload"
    : /^\/company-verification\/documents\/[^/]+$/.test(url.pathname);
  if (url.origin !== new URL(site).origin || !pathMatches || url.username || url.password || url.search || url.hash) {
    throw new Error("VERIFICATION_DOCUMENT_NOT_FOUND");
  }
  return url.href;
}

function sessionHeaders(token: string | null | undefined) {
  if (!token) throw new Error("NOT_AUTHENTICATED");
  return { Authorization: `Bearer ${token}` };
}

export async function uploadVerificationFile(args: {
  uploadUrl: string; uploadToken: string; sessionToken: string | null | undefined; file: File;
}): Promise<Id<"_storage">> {
  const url = directVerificationUrl(args.uploadUrl, "upload");
  const response = await fetch(url, {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store",
    headers: { ...sessionHeaders(args.sessionToken), "Content-Type": args.file.type, "X-Upload-Token": args.uploadToken },
    body: args.file,
  });
  if (!response.ok) throw new Error("DOCUMENT_UPLOAD_FAILED");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("storageId" in payload) || typeof payload.storageId !== "string") {
    throw new Error("DOCUMENT_UPLOAD_FAILED");
  }
  return payload.storageId as Id<"_storage">;
}

export async function fetchVerificationFile(url: string, token: string | null | undefined) {
  const response = await fetch(directVerificationUrl(url, "download"), {
    headers: sessionHeaders(token), credentials: "omit", redirect: "error", cache: "no-store",
  });
  if (!response.ok) throw new Error("VERIFICATION_DOCUMENT_NOT_FOUND");
  return response.blob();
}

export async function downloadVerificationFile(url: string, token: string | null | undefined, fileName: string) {
  const blob = await fetchVerificationFile(url, token);
  saveVerificationBlob(blob, fileName);
}

/** A freshly uploaded file can be viewed locally before it has a document ID. */
export function saveVerificationBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName.replace(/[\\/\r\n]/g, "_");
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start saving, then release the private in-memory URL.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
