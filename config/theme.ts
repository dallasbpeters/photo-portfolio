/**
 * The editable presentation layer: fonts and colors an admin can change from
 * the settings panel without a deploy.
 *
 * Kept beside config/sites.ts and dependency-free so the browser, the
 * serverless functions and vite.config.ts can all import it.
 */

export type FontId =
  | 'geist'
  | 'inter'
  | 'space-grotesk'
  | 'manrope'
  | 'playfair-display'
  | 'fraunces'
  | 'cormorant-garamond';

export type FontChoice = {
  id: FontId;
  /** Shown in the settings dropdown. */
  label: string;
  /** The value written into --font-sans / --font-serif. */
  stack: string;
  category: 'sans' | 'serif';
};

/**
 * Curated rather than free-text: every entry is self-hosted through
 * @fontsource, so there is no third-party request and no flash of unstyled
 * text, and an admin cannot land on a family that fails to load.
 *
 * Adding a font means adding the package, an entry here, and a line in
 * FONT_LOADERS (src/theme/fonts.ts). That deploy is the deliberate cost of
 * never shipping a broken font.
 */
export const FONT_CHOICES: FontChoice[] = [
  { id: 'geist', label: 'Geist', category: 'sans', stack: '"Geist Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: 'inter', label: 'Inter', category: 'sans', stack: '"Inter Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: 'space-grotesk', label: 'Space Grotesk', category: 'sans', stack: '"Space Grotesk Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: 'manrope', label: 'Manrope', category: 'sans', stack: '"Manrope Variable", ui-sans-serif, system-ui, sans-serif' },
  { id: 'playfair-display', label: 'Playfair Display', category: 'serif', stack: '"Playfair Display Variable", Georgia, serif' },
  { id: 'fraunces', label: 'Fraunces', category: 'serif', stack: '"Fraunces Variable", Georgia, serif' },
  { id: 'cormorant-garamond', label: 'Cormorant Garamond', category: 'serif', stack: '"Cormorant Garamond Variable", Georgia, serif' },
];

export const SANS_FONTS = FONT_CHOICES.filter((f) => f.category === 'sans');
export const SERIF_FONTS = FONT_CHOICES.filter((f) => f.category === 'serif');

export const findFont = (id: string | undefined): FontChoice | undefined =>
  FONT_CHOICES.find((f) => f.id === id);

/**
 * Everything an admin may restyle. Deliberately small: these three drive the
 * existing @theme custom properties, so there is no combination that leaves the
 * site unstyled — only ones that leave it ugly, which `contrastRatio` warns about.
 */
export type SiteTheme = {
  background: string;
  foreground: string;
  /** Hero wordmark and highlights. Replaces the old hard-coded Tailwind class. */
  accent: string;
  sansFont: FontId;
  serifFont: FontId;
};

export const DEFAULT_THEME: Record<string, SiteTheme> = {
  addison: {
    background: '#000000',
    foreground: '#ffffff',
    accent: '#ffffff',
    sansFont: 'inter',
    serifFont: 'cormorant-garamond',
  },
  cyan: {
    background: '#000000',
    foreground: '#ffffff',
    // Matches the text-cyan-200 the wordmark used before theming moved to the DB.
    accent: '#a5f3fc',
    sansFont: 'inter',
    serifFont: 'cormorant-garamond',
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value);

/** sRGB relative luminance, per WCAG. */
const luminance = (hex: string): number => {
  const channel = (n: number): number => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(Number.parseInt(hex.slice(1, 3), 16));
  const g = channel(Number.parseInt(hex.slice(3, 5), 16));
  const b = channel(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * WCAG contrast ratio, 1–21. Used to warn in the settings panel before an admin
 * saves white-on-white.
 */
export const contrastRatio = (a: string, b: string): number => {
  if (!isHexColor(a) || !isHexColor(b)) return 0;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Discards unknown keys and invalid values, falling back to the site default. */
export const normalizeTheme = (raw: unknown, fallback: SiteTheme): SiteTheme => {
  const t = (raw ?? {}) as Partial<SiteTheme>;
  return {
    background: isHexColor(t.background) ? t.background : fallback.background,
    foreground: isHexColor(t.foreground) ? t.foreground : fallback.foreground,
    accent: isHexColor(t.accent) ? t.accent : fallback.accent,
    sansFont: findFont(t.sansFont)?.id ?? fallback.sansFont,
    serifFont: findFont(t.serifFont)?.id ?? fallback.serifFont,
  };
};
