import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/routes/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/routes",
      include: ["src/app/api/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
