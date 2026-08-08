import {
  createNeutralEdit,
  type EditState,
  HSL_BAND_LABELS,
  type HslBand,
} from "./adjustments";
import type { CurvePoint, ToneCurve } from "./engine/curves";

/**
 * The look library, organised into colour-coded families.
 *
 * Each family shares a tonal character and carries a signature colour so the
 * strip reads at a glance. Within a family, 1 through 8 run from the lightest
 * treatment to the strongest.
 *
 * These are original recipes. They take their cues from how real film stock
 * behaves — S-shaped response, shadow crossover, band-specific colour — rather
 * than from any commercial preset pack.
 */

export interface LookFamily {
  /** Signature colour for the family, used as the strip swatch. */
  color: string;
  contrastColor?: string;
  description: string;
  id: string;
  /** Single letter shown on the strip. */
  letter: string;
  name: string;
}

export const LOOK_FAMILIES: LookFamily[] = [
  {
    color: "var(--color-a",
    contrastColor: "var(--color-a-contrast)",
    description: "Warm negative — sun, skin, late light",
    id: "a",
    letter: "A",
    name: "Golden",
  },
  {
    color: "var(--color-b)",
    contrastColor: "var(--color-b-contrast)",
    description: "Muted earth — matte greens, faded",
    id: "b",
    letter: "B",
    name: "Olive",
  },
  {
    color: "var(--color-c)",
    contrastColor: "var(--color-c-contrast)",
    description: "Punchy warm — sunset, headlights",
    id: "c",
    letter: "C",
    name: "Ember",
  },
  {
    color: "var(--color-d)",
    contrastColor: "var(--color-d-contrast)",
    description: "Cool cinematic — teal shadows",
    id: "d",
    letter: "D",
    name: "Tide",
  },
  {
    color: "var(--color-e)",
    contrastColor: "var(--color-e-contrast)",
    description: "Cold slide — night, blue hour",
    id: "e",
    letter: "E",
    name: "Dusk",
  },
  {
    color: "var(--color-f)",
    contrastColor: "var(--color-f-contrast)",
    description: "Cross-processed — bold magenta",
    id: "f",
    letter: "F",
    name: "Bloom",
  },
  {
    color: "var(--color-g)",
    contrastColor: "var(--color-g-contrast)",
    description: "Aged print — sepia, soft blacks",
    id: "g",
    letter: "G",
    name: "Archive",
  },
  {
    color: "var(--color-m)",
    contrastColor: "var(--color-m-contrast)",
    description: "Black and white",
    id: "m",
    letter: "M",
    name: "Mono",
  },
];

export interface Look {
  /** Shown on the strip, e.g. "A3". */
  code: string;
  edit: Partial<EditState>;
  family: string;
  id: string;
  /** Position within the family, 1–8. */
  index: number;
  name: string;
}

// ── Curve helpers ─────────────────────────────────────────────────────────────

/**
 * A film-style S-curve.
 *
 * `strength` deepens the toe and shoulder together; `lift` raises the black
 * point, which is what separates a faded print from a contrasty one.
 *
 * The toe is deliberately gentle. A recipe that also pushes the `contrast`
 * slider applies contrast twice, which crushed the darker looks badly enough to
 * lose the subject on an already high-contrast frame.
 */
const sCurve = (strength: number, lift = 0): CurvePoint[] => [
  { x: 0, y: lift },
  { x: 0.25, y: 0.25 - strength * 0.06 + lift * 0.7 },
  { x: 0.5, y: 0.5 + lift * 0.35 },
  { x: 0.75, y: 0.75 + strength * 0.07 + lift * 0.15 },
  { x: 1, y: 1 },
];

/** Shifts one channel's midtones — the crossover that gives film its cast. */
const channelShift = (amount: number, lift = 0): CurvePoint[] => [
  { x: 0, y: Math.max(0, lift) },
  { x: 0.5, y: 0.5 + amount },
  { x: 1, y: 1 },
];

const bands = (
  overrides: Partial<Record<number, Partial<HslBand>>>
): HslBand[] =>
  HSL_BAND_LABELS.map((_, i) => ({
    hue: overrides[i]?.hue ?? 0,
    luminance: overrides[i]?.luminance ?? 0,
    saturation: overrides[i]?.saturation ?? 0,
  }));

// Band indices, for readability in the recipes below.
const RED = 0;
const ORANGE = 1;
const YELLOW = 2;
const GREEN = 3;
const AQUA = 4;
const BLUE = 5;

interface Recipe {
  curve?: ToneCurve;
  edit: Partial<EditState>;
  hsl?: HslBand[];
  name: string;
}

/**
 * Builds a family's eight looks from a base recipe by scaling intensity.
 *
 * Everything that reads as "more of the same look" scales together; grain and
 * fade are deliberately not scaled linearly, since doubling them reads as a
 * different stock rather than a stronger one.
 */
const buildFamily = (family: string, recipes: Recipe[]): Look[] =>
  recipes.map((recipe, i) => ({
    code: `${family.toUpperCase()}${i + 1}`,
    edit: {
      ...createNeutralEdit(),
      ...recipe.edit,
      ...(recipe.curve ? { curve: recipe.curve, curveAmount: 1 } : {}),
      ...(recipe.hsl ? { hsl: recipe.hsl, hslAmount: 1 } : {}),
    },
    family,
    id: `${family}${i + 1}`,
    index: i + 1,
    name: recipe.name,
  }));

// ── A — Golden ────────────────────────────────────────────────────────────────
const GOLDEN: Recipe[] = [
  {
    curve: { b: channelShift(-0.02), rgb: sCurve(0.3, 0.02) },
    edit: {
      grain: 0.1,
      grainSize: 0.25,
      highlights: -0.12,
      shadows: 0.1,
      temperature: 0.1,
    },
    hsl: bands({
      [ORANGE]: { luminance: 0.05, saturation: 0.12 },
      [YELLOW]: { saturation: 0.08 },
    }),
    name: "Soft Gold",
  },
  {
    curve: {
      b: channelShift(-0.035),
      r: channelShift(0.02),
      rgb: sCurve(0.5, 0.03),
    },
    edit: {
      grain: 0.16,
      grainSize: 0.3,
      halation: 0.16,
      highlights: -0.18,
      shadows: 0.14,
      temperature: 0.16,
    },
    hsl: bands({
      [ORANGE]: { luminance: 0.06, saturation: 0.18 },
      [YELLOW]: { saturation: 0.1 },
      [BLUE]: { saturation: -0.08 },
    }),
    name: "Warm 400",
  },
  {
    curve: {
      b: channelShift(-0.05),
      r: channelShift(0.03),
      rgb: sCurve(0.55, 0.05),
    },
    edit: {
      grain: 0.2,
      halation: 0.24,
      highlights: -0.2,
      shadows: 0.16,
      splitHighlight: { b: -0.01, g: 0.03, r: 0.05 },
      temperature: 0.22,
    },
    hsl: bands({
      [ORANGE]: { luminance: 0.08, saturation: 0.24 },
      [YELLOW]: { hue: -0.02, saturation: 0.16 },
    }),
    name: "Honey",
  },
  {
    curve: {
      b: channelShift(-0.06),
      r: channelShift(0.04),
      rgb: sCurve(0.65, 0.04),
    },
    edit: {
      contrast: 0.1,
      grain: 0.22,
      halation: 0.3,
      highlights: -0.24,
      shadows: 0.18,
      temperature: 0.26,
    },
    hsl: bands({
      [ORANGE]: { luminance: 0.1, saturation: 0.28 },
      [RED]: { saturation: 0.14 },
      [BLUE]: { luminance: -0.06, saturation: -0.14 },
    }),
    name: "Low Sun",
  },
  {
    curve: {
      b: channelShift(-0.075),
      r: channelShift(0.05),
      rgb: sCurve(0.7, 0.06),
    },
    edit: {
      contrast: 0.14,
      fade: 0.1,
      grain: 0.26,
      halation: 0.34,
      highlights: -0.26,
      shadows: 0.2,
      temperature: 0.3,
    },
    hsl: bands({
      [ORANGE]: { luminance: 0.1, saturation: 0.32 },
      [YELLOW]: { saturation: 0.2 },
      [AQUA]: { saturation: -0.16 },
    }),
    name: "Amber",
  },
  {
    curve: {
      b: channelShift(-0.05, 0.01),
      r: channelShift(0.04),
      rgb: sCurve(0.85),
    },
    edit: {
      clarity: 0.14,
      contrast: 0.24,
      grain: 0.24,
      grainRoughness: 0.7,
      saturation: 0.08,
      temperature: 0.18,
    },
    hsl: bands({
      [RED]: { saturation: 0.3 },
      [ORANGE]: { saturation: 0.24 },
      [BLUE]: { luminance: -0.1, saturation: 0.1 },
    }),
    name: "Kodachrome-ish",
  },
  {
    curve: {
      b: channelShift(-0.09),
      r: channelShift(0.06),
      rgb: sCurve(0.95, 0.03),
    },
    edit: {
      contrast: 0.2,
      grain: 0.3,
      halation: 0.4,
      highlights: -0.3,
      shadows: 0.14,
      temperature: 0.34,
      vignette: 0.12,
    },
    hsl: bands({
      [ORANGE]: { luminance: 0.08, saturation: 0.36 },
      [BLUE]: { luminance: -0.12, saturation: -0.2 },
    }),
    name: "Deep Gold",
  },
  {
    curve: {
      b: channelShift(-0.11),
      g: channelShift(0.01),
      r: channelShift(0.08),
      rgb: sCurve(1.1, 0.02),
    },
    edit: {
      contrast: 0.28,
      grain: 0.34,
      grainRoughness: 0.65,
      halation: 0.48,
      highlights: -0.34,
      temperature: 0.4,
      vignette: 0.2,
    },
    hsl: bands({
      [RED]: { saturation: 0.32 },
      [ORANGE]: { luminance: 0.06, saturation: 0.4 },
      [BLUE]: { luminance: -0.16, saturation: -0.3 },
    }),
    name: "Scorched",
  },
];

// ── B — Olive ─────────────────────────────────────────────────────────────────
const OLIVE: Recipe[] = [
  {
    curve: { rgb: sCurve(0.2, 0.06) },
    edit: { fade: 0.14, grain: 0.12, saturation: -0.08 },
    hsl: bands({
      [GREEN]: { hue: 0.03, luminance: 0.06, saturation: -0.1 },
      [YELLOW]: { saturation: -0.06 },
    }),
    name: "Sage",
  },
  {
    curve: { g: channelShift(0.015), rgb: sCurve(0.25, 0.09) },
    edit: { fade: 0.2, grain: 0.16, saturation: -0.12, temperature: -0.04 },
    hsl: bands({
      [GREEN]: { hue: 0.04, luminance: 0.08, saturation: -0.16 },
      [YELLOW]: { hue: 0.03, saturation: -0.1 },
    }),
    name: "Field",
  },
  {
    curve: { g: channelShift(0.025), rgb: sCurve(0.3, 0.11) },
    edit: { fade: 0.26, grain: 0.2, highlights: -0.12, saturation: -0.16 },
    hsl: bands({
      [GREEN]: { hue: 0.05, luminance: 0.1, saturation: -0.2 },
      [AQUA]: { saturation: -0.14 },
    }),
    name: "Moss",
  },
  {
    curve: {
      b: channelShift(0.01),
      g: channelShift(0.03),
      rgb: sCurve(0.3, 0.14),
    },
    edit: { contrast: -0.06, fade: 0.32, grain: 0.24, saturation: -0.2 },
    hsl: bands({
      [GREEN]: { luminance: 0.1, saturation: -0.26 },
      [RED]: { saturation: -0.14 },
    }),
    name: "Drab",
  },
  {
    curve: {
      g: channelShift(0.035),
      r: channelShift(0.015),
      rgb: sCurve(0.35, 0.16),
    },
    edit: { fade: 0.36, grain: 0.26, saturation: -0.22, temperature: 0.06 },
    hsl: bands({
      [GREEN]: { hue: 0.05, luminance: 0.12, saturation: -0.3 },
      [BLUE]: { saturation: -0.2 },
    }),
    name: "Khaki",
  },
  {
    curve: { g: channelShift(0.04), rgb: sCurve(0.4, 0.18) },
    edit: { clarity: -0.08, fade: 0.4, grain: 0.3, saturation: -0.26 },
    hsl: bands({
      [GREEN]: { luminance: 0.12, saturation: -0.34 },
      [AQUA]: { saturation: -0.24 },
      [BLUE]: { saturation: -0.24 },
    }),
    name: "Fatigue",
  },
  {
    curve: {
      g: channelShift(0.045),
      r: channelShift(0.02),
      rgb: sCurve(0.45, 0.21),
    },
    edit: {
      fade: 0.46,
      grain: 0.34,
      grainSize: 0.45,
      saturation: -0.3,
      vignette: 0.1,
    },
    hsl: bands({
      [GREEN]: { luminance: 0.14, saturation: -0.38 },
      [ORANGE]: { saturation: -0.1 },
    }),
    name: "Dust",
  },
  {
    curve: { g: channelShift(0.05), rgb: sCurve(0.6, 0.24) },
    edit: {
      clarity: 0.1,
      contrast: 0.16,
      fade: 0.5,
      grain: 0.36,
      grainRoughness: 0.6,
      saturation: -0.4,
    },
    hsl: bands({
      [GREEN]: { luminance: 0.16, saturation: -0.44 },
      [RED]: { saturation: -0.26 },
      [BLUE]: { saturation: -0.3 },
    }),
    name: "Bleach",
  },
];

// ── C — Ember ─────────────────────────────────────────────────────────────────
const EMBER: Recipe[] = [
  {
    curve: { rgb: sCurve(0.5) },
    edit: { clarity: 0.1, contrast: 0.14, grain: 0.08, temperature: 0.08 },
    hsl: bands({ [ORANGE]: { saturation: 0.16 }, [RED]: { saturation: 0.12 } }),
    name: "Warm Punch",
  },
  {
    curve: { r: channelShift(0.02), rgb: sCurve(0.6) },
    edit: {
      blacks: -0.1,
      clarity: 0.12,
      contrast: 0.18,
      grain: 0.12,
      temperature: 0.12,
    },
    hsl: bands({
      [ORANGE]: { saturation: 0.22 },
      [BLUE]: { luminance: -0.1, saturation: -0.1 },
    }),
    name: "Coal",
  },
  {
    curve: { b: channelShift(-0.03), r: channelShift(0.035), rgb: sCurve(0.7) },
    edit: {
      blacks: -0.12,
      contrast: 0.22,
      grain: 0.16,
      halation: 0.28,
      temperature: 0.2,
    },
    hsl: bands({
      [ORANGE]: { luminance: 0.06, saturation: 0.3 },
      [RED]: { saturation: 0.2 },
      [BLUE]: { luminance: -0.14 },
    }),
    name: "Sunset",
  },
  {
    curve: { b: channelShift(-0.04), r: channelShift(0.04), rgb: sCurve(0.8) },
    edit: {
      blacks: -0.18,
      contrast: 0.26,
      grain: 0.2,
      halation: 0.38,
      temperature: 0.24,
      vignette: 0.14,
    },
    hsl: bands({
      [ORANGE]: { saturation: 0.34 },
      [YELLOW]: { saturation: 0.24 },
      [BLUE]: { luminance: -0.18, saturation: -0.16 },
    }),
    name: "Headlight",
  },
  {
    curve: {
      b: channelShift(-0.055),
      r: channelShift(0.055),
      rgb: sCurve(0.9),
    },
    edit: {
      blacks: -0.2,
      contrast: 0.3,
      grain: 0.24,
      halation: 0.44,
      temperature: 0.3,
      vignette: 0.18,
    },
    hsl: bands({
      [RED]: { saturation: 0.32 },
      [ORANGE]: { luminance: 0.06, saturation: 0.4 },
      [AQUA]: { saturation: -0.24 },
    }),
    name: "Furnace",
  },
  {
    curve: {
      b: channelShift(-0.07),
      g: channelShift(0.01),
      r: channelShift(0.06),
      rgb: sCurve(0.95, 0.05),
    },
    edit: {
      contrast: 0.26,
      fade: 0.12,
      grain: 0.3,
      grainSize: 0.4,
      halation: 0.4,
      temperature: 0.32,
    },
    hsl: bands({
      [ORANGE]: { hue: -0.02, saturation: 0.44 },
      [GREEN]: { saturation: -0.2 },
      [BLUE]: { saturation: -0.28 },
    }),
    name: "Rust",
  },
  {
    curve: { b: channelShift(-0.08), r: channelShift(0.07), rgb: sCurve(1.0) },
    edit: {
      contrast: 0.32,
      grain: 0.28,
      halation: 0.55,
      highlights: -0.16,
      temperature: 0.36,
      vignette: 0.22,
    },
    hsl: bands({
      [ORANGE]: { luminance: 0.1, saturation: 0.48 },
      [BLUE]: { luminance: -0.2, saturation: -0.34 },
    }),
    name: "Flare",
  },
  {
    curve: { b: channelShift(-0.1), r: channelShift(0.09), rgb: sCurve(1.2) },
    edit: {
      blacks: -0.26,
      contrast: 0.38,
      grain: 0.34,
      grainRoughness: 0.7,
      halation: 0.65,
      temperature: 0.42,
      vignette: 0.28,
    },
    hsl: bands({
      [RED]: { saturation: 0.44 },
      [ORANGE]: { luminance: 0.12, saturation: 0.52 },
      [BLUE]: { luminance: -0.26, saturation: -0.4 },
    }),
    name: "Inferno",
  },
];

// ── D — Tide ──────────────────────────────────────────────────────────────────
const TIDE: Recipe[] = [
  {
    curve: { b: channelShift(0.02), rgb: sCurve(0.35) },
    edit: { contrast: 0.1, grain: 0.06, temperature: -0.08 },
    hsl: bands({ [AQUA]: { saturation: 0.1 }, [BLUE]: { saturation: 0.08 } }),
    name: "Clean Cool",
  },
  {
    curve: { b: channelShift(0.03), rgb: sCurve(0.45, 0.03) },
    edit: {
      contrast: 0.14,
      grain: 0.1,
      splitShadow: { b: 0.04, g: 0.01, r: -0.02 },
      temperature: -0.12,
    },
    hsl: bands({
      [AQUA]: { luminance: 0.05, saturation: 0.16 },
      [ORANGE]: { saturation: 0.06 },
    }),
    name: "Shallow",
  },
  {
    curve: {
      b: channelShift(0.045),
      g: channelShift(0.015),
      rgb: sCurve(0.55, 0.04),
    },
    edit: {
      contrast: 0.18,
      grain: 0.12,
      splitHighlight: { b: -0.02, g: 0.01, r: 0.03 },
      splitShadow: { b: 0.06, g: 0.01, r: -0.04 },
      temperature: -0.14,
    },
    hsl: bands({
      [AQUA]: { saturation: 0.22 },
      [BLUE]: { saturation: 0.14 },
      [ORANGE]: { saturation: 0.12 },
    }),
    name: "Teal Shadow",
  },
  {
    curve: {
      b: channelShift(0.055),
      g: channelShift(0.02),
      rgb: sCurve(0.65, 0.05),
    },
    edit: {
      contrast: 0.22,
      grain: 0.14,
      splitHighlight: { b: -0.02, g: 0.02, r: 0.04 },
      splitShadow: { b: 0.08, g: 0.01, r: -0.05 },
      temperature: -0.16,
    },
    hsl: bands({
      [AQUA]: { saturation: 0.26 },
      [ORANGE]: { luminance: 0.04, saturation: 0.18 },
      [GREEN]: { saturation: -0.14 },
    }),
    name: "Cinema",
  },
  {
    curve: { b: channelShift(0.07), rgb: sCurve(0.7, 0.06) },
    edit: {
      contrast: 0.24,
      fade: 0.1,
      grain: 0.18,
      splitShadow: { b: 0.1, g: 0.0, r: -0.06 },
      temperature: -0.2,
    },
    hsl: bands({
      [AQUA]: { luminance: 0.04, saturation: 0.3 },
      [BLUE]: { saturation: 0.2 },
      [GREEN]: { saturation: -0.2 },
    }),
    name: "Deep Tide",
  },
  {
    curve: {
      b: channelShift(0.08),
      r: channelShift(-0.02),
      rgb: sCurve(0.75, 0.08),
    },
    edit: {
      contrast: 0.22,
      fade: 0.16,
      grain: 0.22,
      splitShadow: { b: 0.11, g: 0.0, r: -0.07 },
      temperature: -0.24,
    },
    hsl: bands({
      [AQUA]: { saturation: 0.34 },
      [ORANGE]: { saturation: 0.2 },
      [YELLOW]: { saturation: -0.16 },
    }),
    name: "Harbour",
  },
  {
    curve: {
      b: channelShift(0.095),
      g: channelShift(0.02),
      rgb: sCurve(0.85, 0.07),
    },
    edit: {
      blacks: -0.12,
      contrast: 0.28,
      grain: 0.24,
      splitShadow: { b: 0.13, g: 0.0, r: -0.08 },
      temperature: -0.28,
      vignette: 0.14,
    },
    hsl: bands({
      [AQUA]: { saturation: 0.38 },
      [BLUE]: { saturation: 0.26 },
      [RED]: { saturation: -0.14 },
    }),
    name: "Undertow",
  },
  {
    curve: {
      b: channelShift(0.11),
      g: channelShift(0.025),
      r: channelShift(-0.03),
      rgb: sCurve(1.0, 0.06),
    },
    edit: {
      blacks: -0.2,
      contrast: 0.34,
      grain: 0.28,
      splitShadow: { b: 0.16, g: 0.0, r: -0.1 },
      temperature: -0.34,
      vignette: 0.24,
    },
    hsl: bands({
      [AQUA]: { saturation: 0.42 },
      [BLUE]: { luminance: -0.06, saturation: 0.32 },
      [ORANGE]: { saturation: 0.22 },
    }),
    name: "Abyss",
  },
];

// ── E — Dusk ──────────────────────────────────────────────────────────────────
const DUSK: Recipe[] = [
  {
    curve: { b: channelShift(0.04), rgb: sCurve(0.4, 0.04) },
    edit: { grain: 0.12, highlights: -0.1, shadows: 0.14, temperature: -0.16 },
    hsl: bands({ [BLUE]: { luminance: 0.04, saturation: 0.16 } }),
    name: "Blue Hour",
  },
  {
    curve: { b: channelShift(0.055), rgb: sCurve(0.45, 0.06) },
    edit: { grain: 0.14, highlights: -0.14, shadows: 0.18, temperature: -0.2 },
    hsl: bands({ [BLUE]: { saturation: 0.22 }, [ORANGE]: { saturation: 0.1 } }),
    name: "Evening",
  },
  {
    curve: { b: channelShift(0.06), rgb: sCurve(0.6, 0.03) },
    edit: { contrast: 0.2, grain: 0.16, saturation: -0.06, temperature: -0.26 },
    hsl: bands({
      [BLUE]: { saturation: 0.28 },
      [AQUA]: { saturation: 0.18 },
      [YELLOW]: { saturation: -0.16 },
    }),
    name: "Cold Slide",
  },
  {
    curve: {
      b: channelShift(0.07),
      r: channelShift(0.02),
      rgb: sCurve(0.55, 0.08),
    },
    edit: {
      denoise: 0.2,
      grain: 0.22,
      halation: 0.3,
      highlights: -0.2,
      shadows: 0.24,
      temperature: -0.22,
    },
    hsl: bands({
      [BLUE]: { saturation: 0.3 },
      [ORANGE]: { luminance: 0.08, saturation: 0.26 },
    }),
    name: "Streetlamp",
  },
  {
    curve: { b: channelShift(0.08), rgb: sCurve(0.7, 0.1) },
    edit: {
      blacks: -0.12,
      denoise: 0.3,
      exposure: 0.12,
      grain: 0.32,
      grainRoughness: 0.7,
      highlights: -0.28,
      shadows: 0.3,
      temperature: -0.24,
    },
    hsl: bands({
      [BLUE]: { luminance: -0.06, saturation: 0.34 },
      [ORANGE]: { saturation: 0.2 },
    }),
    name: "Night Push",
  },
  {
    curve: {
      b: channelShift(0.095),
      r: channelShift(-0.02),
      rgb: sCurve(0.75, 0.05),
    },
    edit: {
      clarity: 0.12,
      contrast: 0.24,
      grain: 0.18,
      saturation: -0.12,
      temperature: -0.32,
    },
    hsl: bands({
      [BLUE]: { saturation: 0.38 },
      [AQUA]: { saturation: 0.28 },
      [RED]: { saturation: -0.2 },
    }),
    name: "Frost",
  },
  {
    curve: { b: channelShift(0.11), rgb: sCurve(0.9, 0.08) },
    edit: {
      blacks: -0.2,
      contrast: 0.3,
      grain: 0.28,
      shadows: 0.2,
      temperature: -0.36,
      vignette: 0.2,
    },
    hsl: bands({
      [BLUE]: { luminance: -0.08, saturation: 0.42 },
      [YELLOW]: { saturation: -0.24 },
    }),
    name: "Midnight",
  },
  {
    curve: {
      b: channelShift(0.13),
      g: channelShift(0.02),
      r: channelShift(-0.04),
      rgb: sCurve(1.05, 0.06),
    },
    edit: {
      blacks: -0.28,
      contrast: 0.36,
      denoise: 0.25,
      grain: 0.34,
      halation: 0.3,
      temperature: -0.42,
      vignette: 0.28,
    },
    hsl: bands({
      [BLUE]: { luminance: -0.12, saturation: 0.48 },
      [ORANGE]: { saturation: 0.24 },
      [GREEN]: { saturation: -0.26 },
    }),
    name: "Deep Night",
  },
];

// ── F — Bloom ─────────────────────────────────────────────────────────────────
const BLOOM: Recipe[] = [
  {
    curve: {
      b: channelShift(0.015),
      r: channelShift(0.02),
      rgb: sCurve(0.3, 0.05),
    },
    edit: { fade: 0.12, grain: 0.1, saturation: 0.06 },
    hsl: bands({ [RED]: { luminance: 0.06, saturation: 0.14 } }),
    name: "Soft Rose",
  },
  {
    curve: {
      b: channelShift(0.025),
      r: channelShift(0.03),
      rgb: sCurve(0.4, 0.07),
    },
    edit: {
      fade: 0.16,
      grain: 0.14,
      saturation: 0.08,
      splitHighlight: { b: 0.03, g: 0.0, r: 0.04 },
    },
    hsl: bands({
      [RED]: { luminance: 0.06, saturation: 0.2 },
      [GREEN]: { saturation: -0.12 },
    }),
    name: "Blush",
  },
  {
    curve: {
      b: channelShift(0.04),
      r: channelShift(0.04),
      rgb: sCurve(0.5, 0.06),
    },
    edit: {
      contrast: 0.12,
      grain: 0.16,
      saturation: 0.12,
      splitHighlight: { b: 0.05, g: 0.0, r: 0.05 },
    },
    hsl: bands({
      [RED]: { saturation: 0.26 },
      [BLUE]: { hue: -0.03, saturation: 0.18 },
    }),
    name: "Orchid",
  },
  {
    curve: {
      b: channelShift(0.06),
      g: channelShift(-0.02),
      r: channelShift(0.05),
      rgb: sCurve(0.75, 0.04),
    },
    edit: {
      contrast: 0.26,
      grain: 0.2,
      saturation: 0.16,
      splitHighlight: { b: 0.04, g: 0.0, r: 0.06 },
      splitShadow: { b: 0.06, g: 0.03, r: 0.0 },
    },
    hsl: bands({
      [RED]: { saturation: 0.3 },
      [AQUA]: { saturation: 0.24 },
      [GREEN]: { hue: 0.05, saturation: -0.2 },
    }),
    name: "Cross",
  },
  {
    curve: {
      b: channelShift(0.07),
      r: channelShift(0.065),
      rgb: sCurve(0.8, 0.05),
    },
    edit: {
      contrast: 0.28,
      grain: 0.22,
      saturation: 0.2,
      splitHighlight: { b: 0.06, g: 0.0, r: 0.08 },
      vignette: 0.12,
    },
    hsl: bands({
      [RED]: { saturation: 0.36 },
      [BLUE]: { hue: -0.04, saturation: 0.24 },
      [GREEN]: { saturation: -0.26 },
    }),
    name: "Fuchsia",
  },
  {
    curve: {
      b: channelShift(0.085),
      r: channelShift(0.07),
      rgb: sCurve(0.95, 0.03),
    },
    edit: {
      blacks: -0.14,
      contrast: 0.34,
      grain: 0.24,
      halation: 0.34,
      saturation: 0.26,
      vignette: 0.16,
    },
    hsl: bands({
      [RED]: { saturation: 0.42 },
      [AQUA]: { saturation: 0.34 },
      [YELLOW]: { saturation: -0.2 },
    }),
    name: "Neon",
  },
  {
    curve: {
      b: channelShift(0.1),
      r: channelShift(0.08),
      rgb: sCurve(0.7, 0.14),
    },
    edit: {
      fade: 0.34,
      grain: 0.28,
      saturation: 0.24,
      splitHighlight: { b: 0.05, g: 0.02, r: 0.09 },
      splitShadow: { b: 0.08, g: 0.0, r: 0.03 },
    },
    hsl: bands({
      [RED]: { saturation: 0.38 },
      [BLUE]: { saturation: 0.3 },
      [GREEN]: { saturation: -0.3 },
    }),
    name: "Vapor",
  },
  {
    curve: {
      b: channelShift(0.11),
      g: channelShift(-0.03),
      r: channelShift(0.09),
      rgb: sCurve(1.15, 0.04),
    },
    edit: {
      blacks: -0.22,
      contrast: 0.4,
      grain: 0.32,
      grainRoughness: 0.65,
      halation: 0.45,
      saturation: 0.32,
      vignette: 0.24,
    },
    hsl: bands({
      [RED]: { saturation: 0.5 },
      [AQUA]: { saturation: 0.4 },
      [GREEN]: { hue: 0.06, saturation: -0.36 },
    }),
    name: "Overdrive",
  },
];

// ── G — Archive ───────────────────────────────────────────────────────────────
const ARCHIVE: Recipe[] = [
  {
    curve: { b: channelShift(-0.02), rgb: sCurve(0.25, 0.08) },
    edit: {
      fade: 0.2,
      grain: 0.16,
      grainSize: 0.4,
      saturation: -0.16,
      temperature: 0.08,
    },
    hsl: bands({
      [YELLOW]: { saturation: 0.08 },
      [BLUE]: { saturation: -0.16 },
    }),
    name: "Light Age",
  },
  {
    curve: { b: channelShift(-0.03), rgb: sCurve(0.3, 0.12) },
    edit: {
      fade: 0.26,
      grain: 0.2,
      grainSize: 0.45,
      saturation: -0.22,
      temperature: 0.1,
    },
    hsl: bands({
      [YELLOW]: { saturation: 0.1 },
      [BLUE]: { saturation: -0.22 },
    }),
    name: "Paper",
  },
  {
    curve: {
      b: channelShift(-0.05),
      r: channelShift(0.03),
      rgb: sCurve(0.35, 0.15),
    },
    edit: {
      fade: 0.32,
      grain: 0.24,
      grainSize: 0.5,
      saturation: -0.34,
      splitHighlight: { b: -0.02, g: 0.03, r: 0.05 },
      temperature: 0.16,
    },
    hsl: bands({
      [ORANGE]: { saturation: 0.12 },
      [BLUE]: { saturation: -0.3 },
    }),
    name: "Sepia Soft",
  },
  {
    curve: {
      b: channelShift(-0.06),
      r: channelShift(0.035),
      rgb: sCurve(0.4, 0.18),
    },
    edit: {
      fade: 0.38,
      grain: 0.28,
      grainSize: 0.5,
      saturation: -0.4,
      temperature: 0.18,
      vignette: 0.14,
    },
    hsl: bands({
      [ORANGE]: { saturation: 0.14 },
      [GREEN]: { saturation: -0.24 },
      [BLUE]: { saturation: -0.34 },
    }),
    name: "Album",
  },
  {
    curve: {
      b: channelShift(-0.07),
      r: channelShift(0.04),
      rgb: sCurve(0.35, 0.24),
    },
    edit: {
      contrast: -0.08,
      fade: 0.46,
      grain: 0.3,
      grainSize: 0.55,
      saturation: -0.46,
      temperature: 0.2,
    },
    hsl: bands({
      [ORANGE]: { saturation: 0.12 },
      [BLUE]: { saturation: -0.4 },
    }),
    name: "Faded Print",
  },
  {
    curve: {
      b: channelShift(-0.09),
      g: channelShift(0.01),
      r: channelShift(0.05),
      rgb: sCurve(0.45, 0.26),
    },
    edit: {
      fade: 0.5,
      grain: 0.34,
      grainRoughness: 0.6,
      grainSize: 0.6,
      saturation: -0.5,
      temperature: 0.24,
      vignette: 0.2,
    },
    hsl: bands({
      [ORANGE]: { saturation: 0.16 },
      [AQUA]: { saturation: -0.34 },
    }),
    name: "Foxed",
  },
  {
    curve: {
      b: channelShift(-0.11),
      r: channelShift(0.06),
      rgb: sCurve(0.5, 0.3),
    },
    edit: {
      fade: 0.56,
      grain: 0.36,
      grainSize: 0.65,
      saturation: -0.58,
      temperature: 0.28,
      vignette: 0.26,
    },
    hsl: bands({
      [ORANGE]: { saturation: 0.18 },
      [BLUE]: { saturation: -0.46 },
    }),
    name: "Antique",
  },
  {
    curve: {
      b: channelShift(-0.09),
      r: channelShift(0.055),
      rgb: sCurve(0.6, 0.32),
    },
    edit: {
      contrast: 0.14,
      fade: 0.6,
      grain: 0.4,
      grainRoughness: 0.7,
      grainSize: 0.7,
      saturation: -0.78,
      temperature: 0.3,
      vignette: 0.34,
    },
    hsl: bands({ [ORANGE]: { saturation: 0.14 } }),
    name: "Daguerre",
  },
];

// ── M — Mono ──────────────────────────────────────────────────────────────────
const MONO: Recipe[] = [
  {
    curve: { rgb: sCurve(0.35) },
    edit: { grain: 0.12, grainSize: 0.3, saturation: -1 },
    name: "Neutral",
  },
  {
    curve: { rgb: sCurve(0.25, 0.08) },
    edit: { fade: 0.18, grain: 0.16, grainSize: 0.35, saturation: -1 },
    name: "Soft",
  },
  {
    curve: { rgb: sCurve(0.6) },
    edit: {
      clarity: 0.12,
      contrast: 0.14,
      grain: 0.22,
      grainSize: 0.35,
      saturation: -1,
    },
    name: "Classic",
  },
  {
    curve: { rgb: sCurve(0.8) },
    edit: {
      clarity: 0.2,
      contrast: 0.22,
      grain: 0.28,
      grainRoughness: 0.65,
      saturation: -1,
      sharpness: 0.24,
    },
    name: "Press",
  },
  {
    curve: { rgb: sCurve(0.95, 0.04) },
    edit: {
      blacks: -0.14,
      contrast: 0.28,
      grain: 0.4,
      grainRoughness: 0.75,
      grainSize: 0.5,
      saturation: -1,
    },
    name: "Push 800",
  },
  {
    curve: { rgb: sCurve(0.2, 0.16) },
    edit: {
      exposure: 0.12,
      fade: 0.24,
      grain: 0.18,
      highlights: 0.1,
      saturation: -1,
    },
    name: "High Key",
  },
  {
    curve: { rgb: sCurve(1.0) },
    edit: {
      blacks: -0.28,
      contrast: 0.3,
      exposure: -0.1,
      grain: 0.24,
      saturation: -1,
      vignette: 0.3,
    },
    name: "Low Key",
  },
  {
    curve: { rgb: sCurve(1.35) },
    edit: {
      blacks: -0.24,
      clarity: 0.26,
      contrast: 0.42,
      grain: 0.34,
      grainRoughness: 0.8,
      saturation: -1,
      sharpness: 0.3,
      vignette: 0.2,
    },
    name: "Hard",
  },
];

export const LOOKS: Look[] = [
  ...buildFamily("a", GOLDEN),
  ...buildFamily("b", OLIVE),
  ...buildFamily("c", EMBER),
  ...buildFamily("d", TIDE),
  ...buildFamily("e", DUSK),
  ...buildFamily("f", BLOOM),
  ...buildFamily("g", ARCHIVE),
  ...buildFamily("m", MONO),
];

export const looksInFamily = (family: string): Look[] =>
  LOOKS.filter((l) => l.family === family);

/** Merges a look onto neutral and returns a fresh, complete edit. */
export const applyLook = (look: Look): EditState => ({
  ...createNeutralEdit(),
  ...look.edit,
});

/**
 * Scales a look's strength toward neutral, so the intensity slider under the
 * strip behaves the way a film-simulation strength control does.
 *
 * Curve and HSL stages scale through their `amount` uniforms rather than by
 * rewriting control points, which keeps the shape of the curve intact — a
 * half-strength S-curve should be a gentler S, not a different curve.
 */
export const applyLookAtStrength = (
  look: Look,
  strength: number
): EditState => {
  const full = applyLook(look);
  const out = createNeutralEdit();

  for (const key of Object.keys(out) as (keyof EditState)[]) {
    const value = full[key];

    if (typeof value === "number") {
      (out[key] as number) = value * strength;
    } else if (key === "splitShadow" || key === "splitHighlight") {
      const tint = value as { r: number; g: number; b: number };
      (out[key] as { r: number; g: number; b: number }) = {
        b: tint.b * strength,
        g: tint.g * strength,
        r: tint.r * strength,
      };
    }
  }

  // Grain character describes what the grain looks like, not how much there is,
  // so it is carried across rather than faded toward zero.
  out.grainSize = full.grainSize;
  out.grainRoughness = full.grainRoughness;

  out.curve = full.curve;
  out.curveAmount = full.curveAmount * strength;
  out.hsl = full.hsl;
  out.hslAmount = full.hslAmount * strength;
  out.lutId = full.lutId;
  out.lutAmount = full.lutAmount * strength;

  return out;
};
