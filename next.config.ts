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
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  experimental: {
    globalNotFound: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.convex.cloud" },
      { protocol: "https", hostname: "*.convex.site" },
      ...(r2Pattern ? [r2Pattern] : []),
    ],
  },
};

export default withNextIntl(nextConfig);
