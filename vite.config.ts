import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { resolveSite } from './config/sites';

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
    name: 'site-branding',

    transformIndexHtml: (html) =>
      html
        .replaceAll('%SITE_NAME%', site.name)
        .replaceAll('%SITE_KEY%', site.key)
        .replaceAll('%SITE_THEME_COLOR%', site.themeColor)
        .replaceAll('%SITE_SHORT_NAME%', site.shortName)
        .replaceAll('%SITE_DESCRIPTION%', `${site.tagline} — ${site.ownerName}.`),
  };
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), siteBranding(process.env.VITE_SITE)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
