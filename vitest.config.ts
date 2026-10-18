import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each test starts its own in-memory Postgres. The first one per file also compiles PGlite, which
    // can pass the default 10 seconds when several files start at once on a busy machine.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
