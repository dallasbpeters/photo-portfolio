import type { FontId } from '../../config/theme';

/**
 * Dynamic imports rather than top-level ones: Vite splits each font's CSS into
 * its own chunk, so a visitor downloads only the family the site actually uses
 * instead of all seven.
 */
const FONT_LOADERS: Record<FontId, () => Promise<unknown>> = {
  geist: () => import('@fontsource-variable/geist/index.css'),
  inter: () => import('@fontsource-variable/inter/index.css'),
  'space-grotesk': () => import('@fontsource-variable/space-grotesk/index.css'),
  manrope: () => import('@fontsource-variable/manrope/index.css'),
  'playfair-display': () => import('@fontsource-variable/playfair-display/index.css'),
  fraunces: () => import('@fontsource-variable/fraunces/index.css'),
  'cormorant-garamond': () => import('@fontsource-variable/cormorant-garamond/index.css'),
};

const loaded = new Set<FontId>();

/** Loads a font's stylesheet once per session. Failures are non-fatal. */
export const loadFont = async (id: FontId): Promise<void> => {
  if (loaded.has(id)) return;
  loaded.add(id);
  try {
    await FONT_LOADERS[id]?.();
  } catch {
    // The stack in config/theme.ts ends in a system fallback, so a font that
    // fails to load degrades to system UI rather than breaking the page.
    loaded.delete(id);
  }
};
