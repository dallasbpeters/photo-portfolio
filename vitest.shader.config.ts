import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * The config for looking at a shader.
 *
 * Separate from vitest.config.ts because it needs Google Chrome rather than
 * Playwright's bundled Chromium: the shader library draws through WebGPU and
 * the bundled build has no adapter — `navigator.gpu` is there and
 * `requestAdapter()` resolves null — so every capture came back blank and every
 * question about the halftone got argued about instead of seen. Chrome has an
 * adapter, headless included, given a secure context; the localhost origin
 * Vitest serves from is one and `about:blank` is not.
 *
 * Not the default because CI installs Chromium, and because a headless CI
 * machine has no GPU to find either. Run it by hand:
 *
 *   pnpm shots
 */
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright({ launchOptions: { channel: "chrome" } }),
      screenshotFailures: false,
      viewport: { height: 1000, width: 1400 },
    },
    include: ["src/**/*.shot.tsx"],
  },
});
