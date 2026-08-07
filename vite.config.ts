import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { resolveSite } from './config/sites';

/**
 * Substitutes the %SITE_*% placeholders in index.html and emits a manifest.json
 * for the site being built, so one codebase produces correctly branded output
 * for every site without a per-site index.html or public/ directory.
 */
const siteBranding = (siteKey: string | undefined): Plugin => {
  const site = resolveSite(siteKey);

  return {
    name: 'site-branding',

    transformIndexHtml: (html) =>
      html
        .replaceAll('%SITE_NAME%', site.name)
        .replaceAll('%SITE_KEY%', site.key)
        .replaceAll('%SITE_THEME_COLOR%', site.themeColor),

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(
          {
            theme_color: site.themeColor,
            background_color: site.themeColor,
            icons: [
              {
                purpose: 'maskable',
                sizes: '512x512',
                src: `/sites/${site.key}/icon512_maskable.png`,
                type: 'image/png',
              },
              {
                purpose: 'any',
                sizes: '512x512',
                src: `/sites/${site.key}/icon512_rounded.png`,
                type: 'image/png',
              },
            ],
            orientation: 'any',
            display: 'standalone',
            dir: 'auto',
            lang: 'en-US',
            name: site.name,
            short_name: site.shortName,
            id: `https://${site.domain}`,
            start_url: '/admin',
            scope: '/',
            shortcuts: [
              {
                name: 'Portfolio',
                short_name: 'Home',
                description: 'Public gallery',
                url: '/',
                icons: [
                  {
                    src: `/sites/${site.key}/icon512_rounded.png`,
                    sizes: '512x512',
                    type: 'image/png',
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
      });
    },
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
