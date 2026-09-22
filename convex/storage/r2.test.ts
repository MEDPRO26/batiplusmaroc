import { afterEach, describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import { buildPublicMediaObjectKey, matchesImageSignature, validateHeadMetadata } from "./r2";
import { getPublicMediaUrl } from "./publicUrl";
import { validatePublicImageInput } from "./constants";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

afterEach(() => {
  delete process.env.R2_PUBLIC_BASE_URL;
});

describe("R2 public media helpers", () => {
  test("builds backend-owned company and portfolio keys without user filenames", () => {
    const companyId = "company-id" as Id<"companies">;
    const projectId = "project-id" as Id<"portfolioProjects">;
    expect(buildPublicMediaObjectKey({
      companyId,
      purpose: "companyLogo",
      contentType: "image/webp",
      randomId: "random-id",
    })).toBe("companies/company-id/logo/random-id.webp");
    expect(buildPublicMediaObjectKey({
      companyId,
      purpose: "companyCover",
      contentType: "image/png",
      randomId: "cover-id",
    })).toBe("companies/company-id/cover/cover-id.png");
    expect(buildPublicMediaObjectKey({
      companyId,
      portfolioProjectId: projectId,
      purpose: "portfolioMedia",
      contentType: "image/jpeg",
      randomId: "random-id",
    })).toBe("companies/company-id/portfolio/project-id/media/random-id.jpg");
  });

  test("enforces image types and the separate logo and cover size limits", () => {
    expect(validatePublicImageInput("companyLogo", "image/webp", 5 * 1024 * 1024)).toBe(true);
    expect(validatePublicImageInput("companyLogo", "image/webp", 5 * 1024 * 1024 + 1)).toBe(false);
    expect(validatePublicImageInput("companyCover", "image/png", 10 * 1024 * 1024)).toBe(true);
    expect(validatePublicImageInput("companyCover", "image/png", 10 * 1024 * 1024 + 1)).toBe(false);
    expect(validatePublicImageInput("companyCover", "image/svg+xml", 100)).toBe(false);
  });

  test("requires exact HEAD content type and size", () => {
    const expected = { contentType: "image/png", size: 2048 };
    expect(validateHeadMetadata(expected, { ContentType: "image/png", ContentLength: 2048 })).toBe(true);
    expect(validateHeadMetadata(expected, { ContentType: "image/jpeg", ContentLength: 2048 })).toBe(false);
    expect(validateHeadMetadata(expected, { ContentType: "image/png", ContentLength: 2049 })).toBe(false);
    expect(validateHeadMetadata(expected, {})).toBe(false);
  });

  test("validates JPEG, PNG, and WebP magic bytes instead of trusting metadata alone", () => {
    expect(matchesImageSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(matchesImageSignature("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(matchesImageSignature("image/webp", new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]))).toBe(true);
    expect(matchesImageSignature("image/jpeg", new TextEncoder().encode("not-an-image"))).toBe(false);
  });

  test("creates encoded public URLs only from a configured HTTPS base URL", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.batiplusmaroc.com/";
    expect(getPublicMediaUrl("companies/a/portfolio/x/image one.jpg"))
      .toBe("https://media.batiplusmaroc.com/companies/a/portfolio/x/image%20one.jpg");

    process.env.R2_PUBLIC_BASE_URL = "http://insecure.example.test";
    expect(getPublicMediaUrl("companies/a/logo/x.webp")).toBeNull();
  });

  test("has friendly English and French upload errors", () => {
    for (const code of [
      "INVALID_PUBLIC_MEDIA_UPLOAD",
      "PUBLIC_MEDIA_UPLOAD_FAILED",
      "PUBLIC_MEDIA_URL_NOT_CONFIGURED",
    ] as const) {
      expect(en.ux.error.codes[code]).toBeTruthy();
      expect(fr.ux.error.codes[code]).toBeTruthy();
    }
  });
});
