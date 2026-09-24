#!/usr/bin/env node
/**
 * Development-only CLI to seed / clear fictional marketplace companies.
 *
 * Usage:
 *   npm run seed:companies
 *   npm run seed:companies:clear
 *
 * Guards:
 * - Refuses CONVEX_DEPLOYMENT values that start with "prod:"
 * - Refuses NODE_ENV=production
 * - Requires confirmDevSeed on the Convex internal mutation
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CLEAR = process.argv.includes("--clear");
const FUNCTION = CLEAR
  ? "dev/seedCompanies:clearDemoCompanies"
  : "dev/seedCompanies:seedDemoCompanies";

function loadEnvFile(fileName) {
  const path = resolve(ROOT, fileName);
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function assertSafeToSeed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run: NODE_ENV=production. This seed is development-only.");
  }

  const fileEnv = {
    ...loadEnvFile(".env"),
    ...loadEnvFile(".env.local"),
  };
  const deployment =
    process.env.CONVEX_DEPLOYMENT?.trim() || fileEnv.CONVEX_DEPLOYMENT?.trim() || "";

  if (!deployment) {
    throw new Error(
      "Refusing to run: CONVEX_DEPLOYMENT is missing. Run `npx convex dev` first and keep .env.local configured.",
    );
  }

  if (deployment.startsWith("prod:")) {
    throw new Error(
      `Refusing to run against production deployment (${deployment.split("|")[0]}). Seed/clear is development-only.`,
    );
  }

  if (process.env.ALLOW_DEV_SEED === "false" || fileEnv.ALLOW_DEV_SEED === "false") {
    throw new Error("Refusing to run: ALLOW_DEV_SEED=false.");
  }

  return deployment.split("|")[0] ?? deployment;
}

function main() {
  const deployment = assertSafeToSeed();
  console.log(
    CLEAR
      ? `Clearing seed-demo companies on ${deployment}…`
      : `Seeding 20 fictional companies on ${deployment}…`,
  );

  const result = spawnSync(
    "npx",
    ["convex", "run", FUNCTION, '{"confirmDevSeed":true}'],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
