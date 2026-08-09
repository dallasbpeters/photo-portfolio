import path from "node:path";
import posthog from "@posthog/rollup-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { resolveSite } from "./config/sites";

/**
 * Substitutes the %SITE_*% placeholders in index.html so one codebase produces
 * correctly branded output for every site without a per-site index.html.
 *
 * These are the build-time defaults. Anything an admin can edit is overridden at
 * runtime from site_settings; the manifest is served by api/manifest.ts.
 */
const siteBranding = (siteKey: string | undefined): Plugin => {
  const site = resolveSite(siteKey);

  return {
    name: "site-branding",

    transformIndexHtml: (html) =>
      html
        .replaceAll("%SITE_NAME%", site.name)
        .replaceAll("%SITE_KEY%", site.key)
        .replaceAll("%SITE_THEME_COLOR%", site.themeColor)
        .replaceAll("%SITE_SHORT_NAME%", site.shortName)
        .replaceAll(
          "%SITE_DESCRIPTION%",
          `${site.tagline} — ${site.ownerName}.`
        ),
  };
};

/**
 * Uploads source maps to PostHog so Error Tracking can de-minify stack traces.
 *
 * Only wired in when the upload credentials are present. The plugin throws while
 * being constructed if projectId is missing, and a config that throws takes down
 * `vite build`, `vite preview` and `vite dev` alike — so an unconfigured
 * checkout, or a Vercel project without these variables, could not build at all.
 * A missing PostHog setup must degrade to "no upload", never to "no build".
 *
 * POSTHOG_API_KEY is a *personal* API key, not the public project token the
 * browser SDK uses. It is read here at build time only and must never be given a
 * VITE_ prefix, which would inline it into the client bundle. deleteAfterUpload
 * removes the maps once uploaded, so they are never served from the origin.
 */
const sourcemapUpload = (): Plugin[] => {
  const personalApiKey = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  if (!(personalApiKey && projectId)) {
    // Loud enough to notice in a deploy log, quiet enough not to fail the build.
    console.warn(
      "[posthog] POSTHOG_API_KEY / POSTHOG_PROJECT_ID are unset — skipping source map upload. Production stack traces will stay minified."
    );
    return [];
  }

  // A personal API key starts with phx_. The public project token (phc_) and
  // credentials for other services are easy to paste here by mistake, and the
  // uploader exits non-zero on a malformed key — which fails the whole build and
  // blocks the deploy. Checking the prefix turns a mistyped secret into a
  // skipped upload plus a clear message.
  if (!personalApiKey.startsWith("phx_")) {
    console.warn(
      "[posthog] POSTHOG_API_KEY is not a personal API key (expected a phx_ prefix) — skipping source map upload. The public phc_ project token cannot upload; create a personal key under Settings → Personal API keys."
    );
    return [];
  }

  return [
    posthog({
      host: process.env.POSTHOG_HOST,
      personalApiKey,
      projectId,
      sourcemaps: {
        deleteAfterUpload: true,
      },
    }),
  ];
};

export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd(), "") };
  return {
    plugins: [
      react(),
      tailwindcss(),
      siteBranding(process.env.VITE_SITE),
      ...sourcemapUpload(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      proxy: {
        "/api": {
          changeOrigin: true,
          // Follows the same PORT as scripts/dev-stack.mjs so the two cannot drift.
          target:
            process.env.VITE_API_PROXY_TARGET ||
            `http://127.0.0.1:${process.env.PORT || 3006}`,
        },
      },
    },
  };
});
