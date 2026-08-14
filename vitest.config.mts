import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json so tests import modules
    // by the same specifier the app does.
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
