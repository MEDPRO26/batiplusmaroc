import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

function r2PublicMediaPattern() {
  const configured = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return {
      protocol: "https" as const,
      hostname: url.hostname,
      port: url.port,
      pathname: `${url.pathname.replace(/\/$/, "")}/**`,
      search: "",
    };
  } catch {
    return null;
  }
}

const r2Pattern = r2PublicMediaPattern();

const nextConfig: NextConfig = {
  // Local browser checks can run without sharing a running dev server's output/lock.
  distDir: process.env.BATIPLUS_E2E_DIST_DIR ?? ".next",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  logging: {
    // Browser extensions can emit unrelated warnings and unhandled rejections.
    // Keep those in DevTools instead of forwarding them into the Next.js terminal.
    browserToTerminal: false,
  },
  experimental: {
    globalNotFound: true,
  },
  images: {
    maximumRedirects: 0,
    remotePatterns: [
      { protocol: "https", hostname: "*.convex.cloud" },
      // Logo HTTP endpoints must never enter the optimizer's independently public cache.
      { protocol: "https", hostname: "*.convex.site", pathname: "/api/storage/**" },
      ...(r2Pattern ? [r2Pattern] : []),
    ],
  },
};

export default withNextIntl(nextConfig);
