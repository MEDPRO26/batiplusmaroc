import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchProjectAttachment, uploadMessagePdf, uploadProjectPdf, uploadFinalQuotePdf } from "./private-pdf";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site");
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fetchMock.mockReset(); });

test("message bytes go directly to the configured authenticated endpoint, with tokens only in headers", async () => {
  fetchMock.mockResolvedValue(Response.json({ uploaded: true }));
  const file = new File(["%PDF-1.7 private"], "message.pdf", { type: "application/pdf" });
  await uploadMessagePdf({ file, sessionToken: "login-secret", uploadToken: "upload-secret" });
  expect(fetchMock).toHaveBeenCalledWith("https://example.convex.site/messages/attachments/upload", expect.objectContaining({
    method: "POST", body: file, credentials: "omit", redirect: "error", cache: "no-store",
    headers: { Authorization: "Bearer login-secret", "Content-Type": "application/pdf", "X-Upload-Token": "upload-secret" },
  }));
  expect(fetchMock.mock.calls[0][0]).not.toMatch(/login-secret|upload-secret|api\/storage/);
});

test("Project download fetch authenticates the endpoint and returns a Blob without a storage reference", async () => {
  fetchMock.mockResolvedValue(new Response("%PDF-1.7 private", { headers: { "Content-Type": "application/pdf" } }));
  const controller = new AbortController();
  const blob = await fetchProjectAttachment({ attachmentId: "attachment-id" as Id<"projectAttachments">, sessionToken: "login-secret", signal: controller.signal });
  expect(blob.type).toBe("application/pdf");
  expect(fetchMock).toHaveBeenCalledWith("https://example.convex.site/projects/attachments/attachment-id", {
    credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal, headers: { Authorization: "Bearer login-secret" },
  });
});

test("missing authentication, unsafe configured origins and failed uploads never return a storage ID", async () => {
  const file = new File(["%PDF-1.7"], "message.pdf", { type: "application/pdf" });
  await expect(uploadMessagePdf({ file, sessionToken: null, uploadToken: "token" })).rejects.toThrow("NOT_AUTHENTICATED");
  expect(fetchMock).not.toHaveBeenCalled();
  for (const origin of ["https://user:pass@example.convex.site", "http://evil.example", "https://example.convex.site/proxy", "https://example.convex.site/?token=x"]) {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", origin);
    await expect(uploadMessagePdf({ file, sessionToken: "token", uploadToken: "token" })).rejects.toThrow();
  }
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site");
  fetchMock.mockResolvedValueOnce(new Response("Upload rejected", { status: 400 }));
  await expect(uploadMessagePdf({ file, sessionToken: "token", uploadToken: "token" })).rejects.toThrow("MESSAGE_ATTACHMENT_UPLOAD_FAILED");
  fetchMock.mockResolvedValueOnce(Response.json({ storageId: "untrusted-id" }));
  await expect(uploadMessagePdf({ file, sessionToken: "token", uploadToken: "token" })).rejects.toThrow("MESSAGE_ATTACHMENT_UPLOAD_FAILED");
});

test.each([
  [uploadProjectPdf, "/projects/attachments/upload", "INVALID_PROJECT_DOCUMENT"],
  [uploadFinalQuotePdf, "/final-quotes/pdf/upload", "INVALID_FINAL_QUOTE_PDF"],
] as const)("bound PDF transport sends bytes and credentials only to the fixed endpoint: %s", async (upload, path, code) => {
  const file = new File(["%PDF-1.7"], "private.pdf", { type: "application/pdf" });
  const args = { file, sessionToken: "session-secret", uploadToken: "upload-secret" };
  fetchMock.mockResolvedValueOnce(Response.json({ uploaded: true }));
  expect(await upload(args)).toBeUndefined();
  expect(fetchMock).toHaveBeenLastCalledWith(`https://example.convex.site${path}`, expect.objectContaining({
    method: "POST", body: file, credentials: "omit", redirect: "error", cache: "no-store",
    headers: { Authorization: "Bearer session-secret", "Content-Type": "application/pdf", "X-Upload-Token": "upload-secret" },
  }));
  await expect(upload({ ...args, sessionToken: null })).rejects.toThrow("NOT_AUTHENTICATED");
  fetchMock.mockResolvedValueOnce(Response.json({ uploaded: true, storageId: "forbidden" }));
  await expect(upload(args)).rejects.toThrow(code);
  fetchMock.mockResolvedValueOnce(new Response("Upload rejected", { status: 400 }));
  await expect(upload(args)).rejects.toThrow(code);
  for (const origin of ["http://evil.example", "https://name:pass@example.convex.site", "https://example.convex.site/proxy", "https://example.convex.site/?token=x"]) {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", origin);
    await expect(upload(args)).rejects.toThrow();
  }
});
