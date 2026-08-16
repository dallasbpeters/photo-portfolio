import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Tests run in a real browser rather than jsdom.
 *
 * What is worth testing here is canvas work — the crop and rotate maths in
 * `editor/engine` — and jsdom has no canvas implementation, so `getContext`
 * returns null and every assertion passes vacuously. A test that cannot fail is
 * worse than no test, so this uses the Playwright Chromium already installed
 * for the toolchain and asserts on real pixels.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
      screenshotFailures: false,
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
