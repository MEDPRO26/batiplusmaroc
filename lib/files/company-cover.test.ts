import type { Id } from "@/convex/_generated/dataModel";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchCompanyCoverPreview, isApprovedCompanyCoverUrl, uploadCompanyCover, validateCompanyCoverFile } from "./company-cover";

const site = "https://cover-test.convex.site";
const imageId = "cover-image" as Id<"companyCoverImages">;
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "cover.png", { type: "image/png" });
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", site));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("approved cover consumer URL boundary", () => {
  test("accepts only the configured approval-checked public endpoint", () => {
    expect(isApprovedCompanyCoverUrl(`${site}/company-covers/public/image-id`)).toBe(true);
  });
  test.each([null, undefined, "", `${site}/company-covers/private/image-id`, `${site}/api/storage/legacy`,
    "https://media.example.test/company/cover.png", "https://other.convex.site/company-covers/public/image-id",
    `${site}/company-covers/public/image-id?token=secret`, `${site}/company-covers/public/image-id#fragment`,
    `${site}/company-covers/public/image-id/thumbnail`, "https://user:secret@cover-test.convex.site/company-covers/public/image-id",
  ])("fails closed for %s", url => expect(isApprovedCompanyCoverUrl(url)).toBe(false));
  test("missing configuration never enables a legacy fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "");
    expect(isApprovedCompanyCoverUrl(`${site}/company-covers/public/image-id`)).toBe(false);
  });
});

describe("Company cover direct transport", () => {
  test.each(["image/jpeg", "image/png", "image/webp"])("allows %s up to exactly 10 MiB", type => {
    const file = new File([new Uint8Array(10 * 1024 * 1024)], "cover", { type });
    expect(validateCompanyCoverFile(file)).toBe(type);
  });

  test.each([
    ["image/svg+xml", 32], ["image/gif", 32], ["image/png", 0], ["image/png", 10 * 1024 * 1024 + 1],
  ])("rejects %s/%i bytes before any upload", async (type, size) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(uploadCompanyCover({ file: new File([new Uint8Array(size)], "cover", { type }), sessionToken: "session", uploadToken: "intent" })).rejects.toThrow("INVALID_COVER");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sends the exact File directly to configured Convex with credentials only in headers", async () => {
    const file = png(); const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ imageId })); vi.stubGlobal("fetch", fetchMock);
    expect(await uploadCompanyCover({ file, sessionToken: "login-secret", uploadToken: "upload-secret", signal: controller.signal })).toBe(imageId);
    expect(fetchMock).toHaveBeenCalledWith(`${site}/company-covers/upload`, {
      method: "POST", body: file, signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store",
      headers: { Authorization: "Bearer login-secret", "Content-Type": "image/png", "X-Upload-Token": "upload-secret" },
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("secret"); expect(url).not.toContain("/api/"); expect(new URL(url).search).toBe("");
  });

  test("fetches private previews directly with an abort signal and no caching", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(png())); vi.stubGlobal("fetch", fetchMock);
    expect((await fetchCompanyCoverPreview({ imageId, sessionToken: "login-secret", signal: controller.signal })).type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(`${site}/company-covers/private/${imageId}`, {
      headers: { Authorization: "Bearer login-secret" }, signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store",
    });
  });

  test("does not fetch or upload without an authenticated session", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(uploadCompanyCover({ file: png(), sessionToken: null, uploadToken: "intent" })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(fetchCompanyCoverPreview({ imageId, sessionToken: undefined })).rejects.toThrow("NOT_AUTHENTICATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(["", "/api/cover", "http://remote.convex.site", `${site}/proxy`, `${site}/?token=secret`, `${site}/#fragment`, "https://user:password@cover-test.convex.site"])("fails closed for invalid configured origin %s", async origin => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", origin);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(fetchCompanyCoverPreview({ imageId, sessionToken: "session" })).rejects.toThrow();
    await expect(uploadCompanyCover({ file: png(), sessionToken: "session", uploadToken: "intent" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("supports an explicitly configured local Convex HTTP origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "http://127.0.0.1:3211");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ imageId })); vi.stubGlobal("fetch", fetchMock);
    await uploadCompanyCover({ file: png(), sessionToken: "session", uploadToken: "intent" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:3211/company-covers/upload");
  });

  test.each([[400, "INVALID_COMPANY_COVER_UPLOAD"], [401, "NOT_AUTHENTICATED"], [403, "NOT_AUTHENTICATED"], [500, "PUBLIC_MEDIA_UPLOAD_FAILED"]])("maps rejected upload HTTP %i to a localizable error", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private server details", { status })));
    await expect(uploadCompanyCover({ file: png(), sessionToken: "session", uploadToken: "intent" })).rejects.toThrow(code);
  });

  test.each([{}, { imageId: "" }, { imageId: 42 }, null])("rejects a malformed upload response: %j", async payload => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(uploadCompanyCover({ file: png(), sessionToken: "session", uploadToken: "intent" })).rejects.toThrow("PUBLIC_MEDIA_UPLOAD_FAILED");
  });

  test.each([403, 404])("does not expose denied preview bytes (HTTP %i)", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private server details", { status })));
    await expect(fetchCompanyCoverPreview({ imageId, sessionToken: "session" })).rejects.toThrow("COMPANY_COVER_NOT_FOUND");
  });

  test.each([["text/html", 8], ["image/svg+xml", 8], ["image/png", 0], ["image/png", 10 * 1024 * 1024 + 1]])("rejects invalid preview blobs (%s/%i)", async (type, size) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob([new Uint8Array(size)], { type }))));
    await expect(fetchCompanyCoverPreview({ imageId, sessionToken: "session" })).rejects.toThrow("COMPANY_COVER_NOT_FOUND");
  });
});
