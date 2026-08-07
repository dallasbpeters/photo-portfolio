import type { CreativeEngine } from '@cesdk/cesdk-js';

/**
 * The photo-grade control surface, defined once and reused by the panel, the
 * reset action and the preset system.
 *
 * Ranges mirror the CE.SDK `adjustments` effect, which normalises every slider
 * to -1..1 (or 0..1 for the one-sided ones). They are presented to the user as
 * -100..100 because that is what every darkroom tool shows.
 */
export type AdjustmentDef = {
  /** Property suffix on the `adjustments` effect block. */
  key: string;
  label: string;
  /** Engine-side range. */
  min: number;
  max: number;
  /** Whether the slider should show a detent at the neutral value. */
  centered: boolean;
};

export type AdjustmentGroup = {
  id: string;
  title: string;
  items: AdjustmentDef[];
};

/** Ordered to match how a photographer actually works: tone, then presence, then colour. */
export const ADJUSTMENT_GROUPS: AdjustmentGroup[] = [
  {
    id: 'tone',
    title: 'Tone',
    items: [
      { key: 'exposure', label: 'Exposure', min: -1, max: 1, centered: true },
      { key: 'brightness', label: 'Brightness', min: -1, max: 1, centered: true },
      { key: 'contrast', label: 'Contrast', min: -1, max: 1, centered: true },
      { key: 'highlights', label: 'Highlights', min: -1, max: 1, centered: true },
      { key: 'shadows', label: 'Shadows', min: -1, max: 1, centered: true },
      { key: 'whites', label: 'Whites', min: -1, max: 1, centered: true },
      { key: 'blacks', label: 'Blacks', min: -1, max: 1, centered: true },
      { key: 'gamma', label: 'Gamma', min: -1, max: 1, centered: true },
    ],
  },
  {
    id: 'presence',
    title: 'Presence',
    items: [
      { key: 'clarity', label: 'Clarity', min: -1, max: 1, centered: true },
      { key: 'sharpness', label: 'Sharpness', min: 0, max: 1, centered: false },
    ],
  },
  {
    id: 'color',
    title: 'Color',
    items: [
      { key: 'saturation', label: 'Saturation', min: -1, max: 1, centered: true },
      { key: 'temperature', label: 'Temperature', min: -1, max: 1, centered: true },
    ],
  },
];

export const ALL_ADJUSTMENTS: AdjustmentDef[] = ADJUSTMENT_GROUPS.flatMap((g) => g.items);

/** Property path for an adjustment on the effect block. */
export const adjustmentProperty = (key: string): string => `effect/adjustments/${key}`;

/**
 * Returns the block's `adjustments` effect, creating and appending one the first
 * time. Every control writes to this single effect so the whole edit stays one
 * non-destructive node rather than a stack of duplicates.
 */
export const ensureAdjustmentsEffect = (
  engine: CreativeEngine,
  blockId: number,
): number | null => {
  if (!engine.block.supportsEffects(blockId)) return null;

  const existing = engine.block
    .getEffects(blockId)
    .find((id) => engine.block.getType(id) === '//ly.img.ubq/effect/adjustments');
  if (existing != null) return existing;

  const effect = engine.block.createEffect('adjustments');
  engine.block.appendEffect(blockId, effect);
  return effect;
};

/** Existing `adjustments` effect, or null — never creates one. */
export const findAdjustmentsEffect = (
  engine: CreativeEngine,
  blockId: number,
): number | null => {
  if (!engine.block.supportsEffects(blockId)) return null;
  return (
    engine.block
      .getEffects(blockId)
      .find((id) => engine.block.getType(id) === '//ly.img.ubq/effect/adjustments') ?? null
  );
};

/** Snapshot of every adjustment value — the unit a preset is built from. */
export type AdjustmentSnapshot = Record<string, number>;

export const readAdjustments = (
  engine: CreativeEngine,
  effectId: number,
): AdjustmentSnapshot => {
  const snapshot: AdjustmentSnapshot = {};
  for (const def of ALL_ADJUSTMENTS) {
    try {
      snapshot[def.key] = engine.block.getFloat(effectId, adjustmentProperty(def.key));
    } catch {
      // A property the running SDK build doesn't expose is skipped rather than
      // failing the whole read.
    }
  }
  return snapshot;
};

export const applyAdjustments = (
  engine: CreativeEngine,
  effectId: number,
  snapshot: AdjustmentSnapshot,
): void => {
  for (const def of ALL_ADJUSTMENTS) {
    const value = snapshot[def.key];
    if (typeof value !== 'number' || Number.isNaN(value)) continue;
    try {
      engine.block.setFloat(effectId, adjustmentProperty(def.key), clamp(value, def.min, def.max));
    } catch {
      /* property unsupported in this build */
    }
  }
};

/** Every adjustment back to neutral (0 across the board). */
export const resetAdjustments = (engine: CreativeEngine, effectId: number): void => {
  for (const def of ALL_ADJUSTMENTS) {
    try {
      engine.block.setFloat(effectId, adjustmentProperty(def.key), 0);
    } catch {
      /* property unsupported in this build */
    }
  }
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Engine value (-1..1) → the -100..100 the slider shows. */
export const toDisplay = (value: number): number => Math.round(value * 100);

/** Slider value (-100..100) → engine value. */
export const fromDisplay = (value: number): number => value / 100;
