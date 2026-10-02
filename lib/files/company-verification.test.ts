import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchVerificationFile, uploadVerificationFile } from "./company-verification";

const site = "https://example.convex.site";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", site));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("direct private verification transport", () => {
  test.each([6 * 1024 * 1024, 10 * 1024 * 1024])("uploads %i bytes directly with bearer authentication", async size => {
    const file = new File([new Uint8Array(size)], "tax.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ storageId: "private-storage-reference" }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadVerificationFile({ uploadUrl: `${site}/company-verification/upload`, uploadToken: "single-use-upload", sessionToken: "convex-session", file });
    expect(fetchMock).toHaveBeenCalledWith(`${site}/company-verification/upload`, expect.objectContaining({
      method: "POST", credentials: "omit", redirect: "error", cache: "no-store", body: file,
      headers: { Authorization: "Bearer convex-session", "Content-Type": "application/pdf", "X-Upload-Token": "single-use-upload" },
    }));
    expect(fetchMock.mock.calls[0][0]).not.toContain("convex-session");
    expect(fetchMock.mock.calls[0][0]).not.toContain("/api/");
  });

  test("downloads 10 MiB directly without a Vercel response proxy", async () => {
    const blob = new Blob([new Uint8Array(10 * 1024 * 1024)], { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchVerificationFile(`${site}/company-verification/documents/document-id`, "convex-session")).size).toBe(blob.size);
    expect(fetchMock).toHaveBeenCalledWith(`${site}/company-verification/documents/document-id`, {
      headers: { Authorization: "Bearer convex-session" }, credentials: "omit", redirect: "error", cache: "no-store",
    });
  });

  test("does not send JWTs to proxies, unrelated hosts, or URLs with credentials/tokens", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    for (const url of ["/api/company-verification/documents/doc", "https://evil.example/company-verification/documents/doc",
      `${site}/api/storage/id`, `${site}/company-verification/documents/doc?token=secret`,
      "https://user:password@example.convex.site/company-verification/documents/doc"]) {
      await expect(fetchVerificationFile(url, "convex-session")).rejects.toThrow();
    }
    await expect(fetchVerificationFile(`${site}/company-verification/documents/doc`, null)).rejects.toThrow("NOT_AUTHENTICATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejected downloads do not return private bytes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })));
    await expect(fetchVerificationFile(`${site}/company-verification/documents/guessed`, "convex-session")).rejects.toThrow("VERIFICATION_DOCUMENT_NOT_FOUND");
  });

  test("the verification file proxy routes have been removed", () => {
    expect(existsSync("app/api/company-verification/upload/route.ts")).toBe(false);
    expect(existsSync("app/api/company-verification/documents/[documentId]/route.ts")).toBe(false);
  });
});
