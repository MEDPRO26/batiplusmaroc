import type { Id } from "@/convex/_generated/dataModel";

/** Credentials go only to the configured Convex HTTP origin, never a supplied URL. */
function endpoint(path: string) {
  const configured = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!configured) throw new Error("MESSAGE_ATTACHMENT_UPLOAD_FAILED");
  const site = new URL(configured);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  if ((site.protocol !== "https:" && !(site.protocol === "http:" && local)) || site.username || site.password ||
      site.pathname !== "/" || site.search || site.hash) throw new Error("MESSAGE_ATTACHMENT_UPLOAD_FAILED");
  return new URL(path, site.origin).href;
}

function sessionHeaders(token: string | null | undefined) {
  if (!token) throw new Error("NOT_AUTHENTICATED");
  return { Authorization: `Bearer ${token}` };
}

type PdfUploadArgs = { file: File; sessionToken: string | null | undefined; uploadToken: string; signal?: AbortSignal };

async function uploadBoundPdf(path: string, args: PdfUploadArgs, code: string) {
  const response = await fetch(endpoint(path), {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
    headers: { ...sessionHeaders(args.sessionToken), "Content-Type": "application/pdf", "X-Upload-Token": args.uploadToken },
    body: args.file,
  });
  if (!response.ok) throw new Error(code);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("uploaded" in payload) || payload.uploaded !== true || "storageId" in payload) throw new Error(code);
}

export async function uploadProjectPdf(args: PdfUploadArgs) {
  await uploadBoundPdf("/projects/attachments/upload", args, "INVALID_PROJECT_DOCUMENT");
}

export async function uploadFinalQuotePdf(args: PdfUploadArgs) {
  await uploadBoundPdf("/final-quotes/pdf/upload", args, "INVALID_FINAL_QUOTE_PDF");
}

export async function uploadMessagePdf(args: {
  file: File; sessionToken: string | null | undefined; uploadToken: string; signal?: AbortSignal;
}) {
  const response = await fetch(endpoint("/messages/attachments/upload"), {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
    headers: { ...sessionHeaders(args.sessionToken), "Content-Type": "application/pdf", "X-Upload-Token": args.uploadToken },
    body: args.file,
  });
  if (!response.ok) throw new Error("MESSAGE_ATTACHMENT_UPLOAD_FAILED");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("uploaded" in payload) || payload.uploaded !== true) throw new Error("MESSAGE_ATTACHMENT_UPLOAD_FAILED");
}

export async function fetchProjectAttachment(args: {
  attachmentId: Id<"projectAttachments">; sessionToken: string | null | undefined; signal?: AbortSignal;
}) {
  const response = await fetch(endpoint(`/projects/attachments/${encodeURIComponent(args.attachmentId)}`), {
    credentials: "omit", redirect: "error", cache: "no-store", signal: args.signal,
    headers: sessionHeaders(args.sessionToken),
  });
  if (!response.ok) throw new Error("PROJECT_ATTACHMENT_NOT_FOUND");
  return response.blob();
}
