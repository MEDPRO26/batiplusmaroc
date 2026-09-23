#!/usr/bin/env node
/** Development-only CLI for the Batiplus project marketplace seed. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CLEAR = process.argv.includes("--clear");
const FUNCTION = CLEAR ? "dev/seedProjects:clearDemoProjects" : "dev/seedProjects:seedDemoProjects";

function loadEnvFile(fileName) {
  const path = resolve(ROOT, fileName);
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function assertDevelopmentTarget() {
  const fileEnv = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
  const deployment = process.env.CONVEX_DEPLOYMENT?.trim() || fileEnv.CONVEX_DEPLOYMENT?.trim() || "";
  const deployKey = process.env.CONVEX_DEPLOY_KEY?.trim() || fileEnv.CONVEX_DEPLOY_KEY?.trim();
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run with NODE_ENV=production.");
  if (deployKey) throw new Error("Refusing to run while CONVEX_DEPLOY_KEY is set; use the named dev deployment.");
  if (!deployment.startsWith("dev:")) {
    throw new Error(`Refusing non-development deployment: ${deployment || "CONVEX_DEPLOYMENT is missing"}`);
  }
  return deployment.split(/\s+#|\|/)[0];
}

const deployment = assertDevelopmentTarget();
console.log(`${CLEAR ? "Clearing" : "Seeding"} ${CLEAR ? "the 20 seed projects" : "20 project fixtures"} on ${deployment}…`);
const result = spawnSync("npx", ["convex", "run", FUNCTION, '{"confirmDevSeed":true}'], {
  cwd: ROOT, stdio: "inherit", env: process.env, shell: process.platform === "win32",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
