import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "edge-runtime",
    // Archived browser scripts are evidence, not executable unit-test inputs.
    exclude: [...configDefaults.exclude, "tests/e2e/**", "design-qa-artifacts/**"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
