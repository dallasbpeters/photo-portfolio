import path from "node:path";
import posthog from "@posthog/rollup-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { config } from "dotenv";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { applySiteOverrides, resolveSite } from "./config/sites";

/**
 * Substitutes the %SITE_*% placeholders in index.html so one codebase produces
 * correctly branded output for every site without a per-site index.html.
 *
 * These are the build-time defaults. Anything an admin can edit is overridden at
 * runtime from site_settings; the manifest is served by api/manifest.ts.
 */
const siteBranding = (siteKey: string | undefined): Plugin => {
  // The SITE_* overrides are applied here as well as on the server. A site that
  // is not compiled into config/sites.ts carries its identity in environment
  // variables, and without this the tab title and install prompt fell back to
  // whichever site the fallback names — so a correctly configured deployment
  // still introduced itself as somebody else.
  const site = applySiteOverrides(resolveSite(siteKey), process.env);

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

  /*
   * Cast because the plugin ships rollup's `Plugin` and Vite 8 wants its own.
   *
   * The two are structurally the same but for the options bag on `resolveId`,
   * which this plugin does not implement — so the mismatch is in the type only.
   * Narrow and deliberate rather than widening the array's type, which would
   * stop checking every other plugin here too.
   */
  return [
    posthog({
      host: process.env.POSTHOG_HOST,
      personalApiKey,
      projectId,
      sourcemaps: {
        deleteAfterUpload: true,
      },
    }) as unknown as Plugin,
  ];
};

export default defineConfig(({ mode }) => {
  const cwd = process.cwd();
  process.env = { ...process.env, ...loadEnv(mode, cwd, "") };

  // Then the site's own file, `.env.<site>.local`, which wins.
  //
  // One checkout serves several sites, and each has its own database, blob
  // store and keys — so which env file to read follows from which site is being
  // run, not from the mode. `pnpm dev` sets VITE_SITE, and this is what makes
  // that selection reach the variables rather than only the branding.
  //
  // dotenv rather than another loadEnv: loadEnv lets the real environment beat
  // the files it reads, and the line above has just copied `.env.local` into
  // the environment — so a second loadEnv would be overruled by the very file
  // this one exists to override.
  const site = process.env.VITE_SITE?.trim();
  if (site) {
    config({ override: true, path: path.resolve(cwd, `.env.${site}.local`) });
  }
  return {
    build: {
      /**
       * "hidden" rather than true: the maps are built, but no
       * `//# sourceMappingURL=` comment is written into the bundles.
       *
       * They were not being built at all, which quietly made the PostHog
       * uploader above a no-op — it had nothing to send, so every production
       * stack trace stayed minified whether or not the keys were configured.
       *
       * Hidden is the pairing that upload wants. The plugin is set to
       * `deleteAfterUpload`, so a plain `true` would ship bundles pointing at
       * .map files that had just been deleted: every error in devtools would
       * come with a 404 for the map beside it. Hidden also keeps the maps off
       * the public site while still handing PostHog what it needs to de-minify.
       */
      sourcemap: "hidden",
    },
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
      // CodeGraph keeps a daemon socket at .codegraph/daemon.sock. Chokidar
      // cannot watch a unix socket and throws rather than skipping it, which
      // takes the whole dev server down at startup:
      //   Watcher error: UNKNOWN: unknown error, watch '.../daemon.sock'
      // Nothing in that directory is source, so none of it is worth watching.
      // A predicate rather than a glob: chokidar 4 dropped glob support in
      // `ignored`, so "**/.codegraph/**" is matched literally and never fires.
      watch: { ignored: (file: string) => file.includes("/.codegraph/") },
    },
  };
});
