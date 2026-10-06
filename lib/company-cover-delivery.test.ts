import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { expect, test } from "vitest";
import nextConfig from "../next.config";

test("the Next image optimizer cannot cache authorized or approved cover HTTP responses", () => {
  const patterns = nextConfig.images?.remotePatterns ?? [];
  for (const path of ["public", "private"]) {
    expect(hasRemoteMatch([], patterns, new URL(`https://example.convex.site/company-covers/${path}/image-id`))).toBe(false);
  }
  expect(nextConfig.images?.maximumRedirects).toBe(0);
  expect(hasRemoteMatch([], patterns, new URL("https://example.convex.cloud/api/storage/existing-file"))).toBe(true);
});
