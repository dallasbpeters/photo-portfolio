import type { ToneCurve } from "./engine/curves";

/**
 * The full control surface, defined once and consumed by the shader uniforms,
 * the sidebar UI, the presets and the reset.
 *
 * Every value is stored in engine units. The UI shows -100..100 because that is
 * what a photographer expects to read; `toDisplay`/`fromDisplay` convert.
 */

export type AdjustmentKey =
  // Tone
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  // Colour
  | "saturation"
  | "temperature"
  | "tint"
  // Presence
  | "clarity"
  | "sharpness"
  | "denoise"
  // Film
  | "grain"
  | "grainSize"
  | "grainRoughness"
  | "halation"
  | "fade"
  | "splitBalance"
  // Finishing
  | "vignette";

export interface AdjustmentDef {
  /** Show a detent at zero and let the fill grow from the centre. */
  centered: boolean;
  key: AdjustmentKey;
  label: string;
  max: number;
  min: number;
}

export type AdjustmentGroupId =
  | "tone"
  | "color"
  | "presence"
  | "film"
  | "finishing";

export interface AdjustmentGroup {
  id: AdjustmentGroupId;
  items: AdjustmentDef[];
  label: string;
}

export const ADJUSTMENT_GROUPS: AdjustmentGroup[] = [
  {
    id: "tone",
    items: [
      { centered: true, key: "exposure", label: "Exposure", max: 1, min: -1 },
      { centered: true, key: "contrast", label: "Contrast", max: 1, min: -1 },
      {
        centered: true,
        key: "highlights",
        label: "Highlights",
        max: 1,
        min: -1,
      },
      { centered: true, key: "shadows", label: "Shadows", max: 1, min: -1 },
      { centered: true, key: "whites", label: "Whites", max: 1, min: -1 },
      { centered: true, key: "blacks", label: "Blacks", max: 1, min: -1 },
    ],
    label: "Light",
  },
  {
    id: "color",
    items: [
      {
        centered: true,
        key: "saturation",
        label: "Saturation",
        max: 1,
        min: -1,
      },
      {
        centered: true,
        key: "temperature",
        label: "Temperature",
        max: 1,
        min: -1,
      },
      { centered: true, key: "tint", label: "Tint", max: 1, min: -1 },
    ],
    label: "Colour",
  },
  {
    id: "presence",
    items: [
      { centered: true, key: "clarity", label: "Clarity", max: 1, min: -1 },
      { centered: false, key: "sharpness", label: "Sharpen", max: 1, min: 0 },
      {
        centered: false,
        key: "denoise",
        label: "Noise reduction",
        max: 1,
        min: 0,
      },
    ],
    label: "Detail",
  },
  {
    id: "film",
    items: [
      { centered: false, key: "grain", label: "Grain", max: 1, min: 0 },
      {
        centered: false,
        key: "grainSize",
        label: "Grain size",
        max: 1,
        min: 0,
      },
      {
        centered: false,
        key: "grainRoughness",
        label: "Grain texture",
        max: 1,
        min: 0,
      },
      { centered: false, key: "halation", label: "Halation", max: 1, min: 0 },
      { centered: false, key: "fade", label: "Fade", max: 1, min: 0 },
      {
        centered: true,
        key: "splitBalance",
        label: "Tone balance",
        max: 1,
        min: -1,
      },
    ],
    label: "Film",
  },
  {
    id: "finishing",
    items: [
      { centered: true, key: "vignette", label: "Vignette", max: 1, min: -1 },
    ],
    label: "Finish",
  },
];

export const ALL_ADJUSTMENTS: AdjustmentDef[] = ADJUSTMENT_GROUPS.flatMap(
  (g) => g.items
);

/** An RGB offset applied to one end of the tonal range. */
export interface SplitColor {
  b: number;
  g: number;
  r: number;
}

/** Hue shift, saturation scale and luminance scale for one colour band. */
export interface HslBand {
  hue: number;
  luminance: number;
  saturation: number;
}

/** Eight bands, centred every 45 degrees starting at red. */
export const HSL_BAND_LABELS = [
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Aqua",
  "Blue",
  "Purple",
  "Magenta",
] as const;

export const NEUTRAL_BAND: HslBand = { hue: 0, luminance: 0, saturation: 0 };

export type EditState = Record<AdjustmentKey, number> & {
  splitShadow: SplitColor;
  splitHighlight: SplitColor;
  /** Per-channel tone curve. Undefined means identity. */
  curve?: ToneCurve;
  /** Strength of the curve stage, 0–1. */
  curveAmount: number;
  hsl: HslBand[];
  hslAmount: number;
  /** Id of a LUT registered with the pipeline, if the look uses one. */
  lutId?: string;
  lutAmount: number;
};

const NO_TINT: SplitColor = { b: 0, g: 0, r: 0 };

export const NEUTRAL_EDIT: EditState = {
  blacks: 0,
  clarity: 0,
  contrast: 0,
  curveAmount: 0,
  denoise: 0,
  exposure: 0,
  fade: 0,
  grain: 0,
  grainRoughness: 0.5,
  grainSize: 0.3,
  halation: 0,
  highlights: 0,
  hsl: [],
  hslAmount: 0,
  lutAmount: 0,
  saturation: 0,
  shadows: 0,
  sharpness: 0,
  splitBalance: 0,
  splitHighlight: NO_TINT,
  splitShadow: NO_TINT,
  temperature: 0,
  tint: 0,
  vignette: 0,
  whites: 0,
};

export const createNeutralEdit = (): EditState => ({
  ...NEUTRAL_EDIT,
  curve: undefined,
  hsl: HSL_BAND_LABELS.map(() => ({ ...NEUTRAL_BAND })),
  splitHighlight: { ...NO_TINT },
  splitShadow: { ...NO_TINT },
});

/** True when nothing has been changed — used to skip work and disable Save. */
export const isNeutral = (edit: EditState): boolean =>
  // grainSize and grainRoughness only shape grain; they are not edits on their own.
  ALL_ADJUSTMENTS.every(
    (d) =>
      d.key === "grainSize" || d.key === "grainRoughness" || edit[d.key] === 0
  ) &&
  isNoTint(edit.splitShadow) &&
  isNoTint(edit.splitHighlight) &&
  edit.curveAmount === 0 &&
  edit.hslAmount === 0 &&
  edit.lutAmount === 0;

const isNoTint = (c: SplitColor): boolean =>
  c.r === 0 && c.g === 0 && c.b === 0;

/** Engine units → the -100..100 the slider shows. */
export const toDisplay = (value: number): number => Math.round(value * 100);

/** Slider units → engine units. */
export const fromDisplay = (value: number): number => value / 100;
