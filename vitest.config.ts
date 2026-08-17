import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
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
  // Tailwind must run here too. A test that asks what sits under the pointer
  // is asking about geometry, and without the utilities the control has no
  // size — the checkbox rendered 414x69 instead of 16x16 and every hit test
  // was meaningless.
  plugins: [tailwindcss()],
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
    // api/ is in here for the pure helpers the run endpoint leans on — job
    // shaping decides what a run costs and whether a wired style is sent at
    // all, and it fails silently when it is wrong. Those files touch neither
    // the database nor the network, so they run in this browser like any other.
    include: ["api/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
