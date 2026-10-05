import type { Id } from "@/convex/_generated/dataModel";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchPortfolioImagePreview, isApprovedPortfolioImageUrl, uploadPortfolioImage } from "./portfolio-image";

const site = "https://logo-test.convex.site";
const imageId = "logo-image" as Id<"portfolioImages">;
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", site));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("approved logo consumer URL boundary", () => {
  test("accepts only the configured approval-checked public endpoint", () => {
    expect(isApprovedPortfolioImageUrl(`${site}/portfolio-images/public/image-id`)).toBe(true);
  });
  test.each([null, undefined, "", `${site}/portfolio-images/private/image-id`, `${site}/api/storage/legacy`,
    "https://media.example.test/company/logo.png", "https://other.convex.site/portfolio-images/public/image-id",
    `${site}/portfolio-images/public/image-id?token=secret`, `${site}/portfolio-images/public/image-id#fragment`,
    `${site}/portfolio-images/public/image-id/thumbnail`, "https://user:secret@logo-test.convex.site/portfolio-images/public/image-id",
  ])("fails closed for %s", url => expect(isApprovedPortfolioImageUrl(url)).toBe(false));
  test("missing configuration never enables a legacy fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "");
    expect(isApprovedPortfolioImageUrl(`${site}/portfolio-images/public/image-id`)).toBe(false);
  });
});

describe("Portfolio image direct transport", () => {
  test.each(["image/jpeg", "image/png", "image/webp"])("allows %s up to exactly 10 MiB", async type => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ imageId })); vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array(10 * 1024 * 1024)], "image", { type });
    expect(await uploadPortfolioImage({ file, sessionToken: "session", uploadToken: "intent" })).toBe(imageId);
  });

  test.each([
    ["image/svg+xml", 32], ["image/gif", 32], ["image/png", 0], ["image/png", 10 * 1024 * 1024 + 1],
  ])("rejects %s/%i bytes before any upload", async (type, size) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(uploadPortfolioImage({ file: new File([new Uint8Array(size)], "logo", { type }), sessionToken: "session", uploadToken: "intent" })).rejects.toThrow("INVALID_PORTFOLIO_IMAGE_UPLOAD");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sends the exact File directly to configured Convex with credentials only in headers", async () => {
    const file = png(); const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ imageId })); vi.stubGlobal("fetch", fetchMock);
    expect(await uploadPortfolioImage({ file, sessionToken: "login-secret", uploadToken: "upload-secret", signal: controller.signal })).toBe(imageId);
    expect(fetchMock).toHaveBeenCalledWith(`${site}/portfolio-images/upload`, {
      method: "POST", body: file, signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store",
      headers: { Authorization: "Bearer login-secret", "Content-Type": "image/png", "X-Upload-Token": "upload-secret" },
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("secret"); expect(url).not.toContain("/api/"); expect(new URL(url).search).toBe("");
  });

  test("fetches private previews directly with an abort signal and no caching", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(png())); vi.stubGlobal("fetch", fetchMock);
    expect((await fetchPortfolioImagePreview({ imageId, sessionToken: "login-secret", signal: controller.signal })).type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(`${site}/portfolio-images/private/${imageId}`, {
      headers: { Authorization: "Bearer login-secret" }, signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store",
    });
  });

  test("does not fetch or upload without an authenticated session", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(uploadPortfolioImage({ file: png(), sessionToken: null, uploadToken: "intent" })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(fetchPortfolioImagePreview({ imageId, sessionToken: undefined })).rejects.toThrow("NOT_AUTHENTICATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(["", "/api/logo", "http://remote.convex.site", `${site}/proxy`, `${site}/?token=secret`, `${site}/#fragment`, "https://user:password@logo-test.convex.site"])("fails closed for invalid configured origin %s", async origin => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", origin);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPortfolioImagePreview({ imageId, sessionToken: "session" })).rejects.toThrow();
    await expect(uploadPortfolioImage({ file: png(), sessionToken: "session", uploadToken: "intent" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("supports an explicitly configured local Convex HTTP origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "http://127.0.0.1:3211");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ imageId })); vi.stubGlobal("fetch", fetchMock);
    await uploadPortfolioImage({ file: png(), sessionToken: "session", uploadToken: "intent" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:3211/portfolio-images/upload");
  });

  test.each([[400, "INVALID_PORTFOLIO_IMAGE_UPLOAD"], [401, "NOT_AUTHENTICATED"], [403, "NOT_AUTHENTICATED"], [500, "PUBLIC_MEDIA_UPLOAD_FAILED"]])("maps rejected upload HTTP %i to a localizable error", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private server details", { status })));
    await expect(uploadPortfolioImage({ file: png(), sessionToken: "session", uploadToken: "intent" })).rejects.toThrow(code);
  });

  test.each([{}, { imageId: "" }, { imageId: 42 }, null])("rejects a malformed upload response: %j", async payload => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(uploadPortfolioImage({ file: png(), sessionToken: "session", uploadToken: "intent" })).rejects.toThrow("PUBLIC_MEDIA_UPLOAD_FAILED");
  });

  test.each([403, 404])("does not expose denied preview bytes (HTTP %i)", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private server details", { status })));
    await expect(fetchPortfolioImagePreview({ imageId, sessionToken: "session" })).rejects.toThrow("PORTFOLIO_IMAGE_NOT_FOUND");
  });

  test.each([["text/html", 8], ["image/svg+xml", 8], ["image/png", 0], ["image/png", 10 * 1024 * 1024 + 1]])("rejects invalid preview blobs (%s/%i)", async (type, size) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob([new Uint8Array(size)], { type }))));
    await expect(fetchPortfolioImagePreview({ imageId, sessionToken: "session" })).rejects.toThrow("PORTFOLIO_IMAGE_NOT_FOUND");
  });
});
