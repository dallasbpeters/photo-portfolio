/**
 * The full control surface, defined once and consumed by the shader uniforms,
 * the sidebar UI, the presets and the reset.
 *
 * Every value is stored in engine units. The UI shows -100..100 because that is
 * what a photographer expects to read; `toDisplay`/`fromDisplay` convert.
 */

export type AdjustmentKey =
  // Tone
  | 'exposure'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'whites'
  | 'blacks'
  // Colour
  | 'saturation'
  | 'temperature'
  | 'tint'
  // Presence
  | 'clarity'
  | 'sharpness'
  | 'denoise'
  // Film
  | 'grain'
  | 'halation'
  | 'fade'
  | 'splitBalance'
  // Finishing
  | 'vignette';

export type AdjustmentDef = {
  key: AdjustmentKey;
  label: string;
  min: number;
  max: number;
  /** Show a detent at zero and let the fill grow from the centre. */
  centered: boolean;
};

export type AdjustmentGroupId = 'tone' | 'color' | 'presence' | 'film' | 'finishing';

export type AdjustmentGroup = {
  id: AdjustmentGroupId;
  label: string;
  items: AdjustmentDef[];
};

export const ADJUSTMENT_GROUPS: AdjustmentGroup[] = [
  {
    id: 'tone',
    label: 'Light',
    items: [
      { key: 'exposure', label: 'Exposure', min: -1, max: 1, centered: true },
      { key: 'contrast', label: 'Contrast', min: -1, max: 1, centered: true },
      { key: 'highlights', label: 'Highlights', min: -1, max: 1, centered: true },
      { key: 'shadows', label: 'Shadows', min: -1, max: 1, centered: true },
      { key: 'whites', label: 'Whites', min: -1, max: 1, centered: true },
      { key: 'blacks', label: 'Blacks', min: -1, max: 1, centered: true },
    ],
  },
  {
    id: 'color',
    label: 'Colour',
    items: [
      { key: 'saturation', label: 'Saturation', min: -1, max: 1, centered: true },
      { key: 'temperature', label: 'Temperature', min: -1, max: 1, centered: true },
      { key: 'tint', label: 'Tint', min: -1, max: 1, centered: true },
    ],
  },
  {
    id: 'presence',
    label: 'Detail',
    items: [
      { key: 'clarity', label: 'Clarity', min: -1, max: 1, centered: true },
      { key: 'sharpness', label: 'Sharpen', min: 0, max: 1, centered: false },
      { key: 'denoise', label: 'Noise reduction', min: 0, max: 1, centered: false },
    ],
  },
  {
    id: 'film',
    label: 'Film',
    items: [
      { key: 'grain', label: 'Grain', min: 0, max: 1, centered: false },
      { key: 'halation', label: 'Halation', min: 0, max: 1, centered: false },
      { key: 'fade', label: 'Fade', min: 0, max: 1, centered: false },
      { key: 'splitBalance', label: 'Tone balance', min: -1, max: 1, centered: true },
    ],
  },
  {
    id: 'finishing',
    label: 'Finish',
    items: [{ key: 'vignette', label: 'Vignette', min: -1, max: 1, centered: true }],
  },
];

export const ALL_ADJUSTMENTS: AdjustmentDef[] = ADJUSTMENT_GROUPS.flatMap((g) => g.items);

/** An RGB offset applied to one end of the tonal range. */
export type SplitColor = { r: number; g: number; b: number };

export type EditState = Record<AdjustmentKey, number> & {
  splitShadow: SplitColor;
  splitHighlight: SplitColor;
};

const NO_TINT: SplitColor = { r: 0, g: 0, b: 0 };

export const NEUTRAL_EDIT: EditState = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  clarity: 0,
  sharpness: 0,
  denoise: 0,
  grain: 0,
  halation: 0,
  fade: 0,
  splitBalance: 0,
  vignette: 0,
  splitShadow: NO_TINT,
  splitHighlight: NO_TINT,
};

export const createNeutralEdit = (): EditState => ({
  ...NEUTRAL_EDIT,
  splitShadow: { ...NO_TINT },
  splitHighlight: { ...NO_TINT },
});

/** True when nothing has been changed — used to skip work and disable Save. */
export const isNeutral = (edit: EditState): boolean =>
  ALL_ADJUSTMENTS.every((d) => edit[d.key] === 0) &&
  isNoTint(edit.splitShadow) &&
  isNoTint(edit.splitHighlight);

const isNoTint = (c: SplitColor): boolean => c.r === 0 && c.g === 0 && c.b === 0;

/** Engine units → the -100..100 the slider shows. */
export const toDisplay = (value: number): number => Math.round(value * 100);

/** Slider units → engine units. */
export const fromDisplay = (value: number): number => value / 100;
