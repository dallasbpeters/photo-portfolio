import type { CreativeEngine } from '@cesdk/cesdk-js';

/**
 * Finishing effects that sit alongside the main `adjustments` node: vignette for
 * edge falloff, and a subtle halation/glow that reads as film bloom.
 *
 * Each is created lazily and left disabled at zero strength, so an untouched
 * photo carries no extra render cost.
 */
export type FinishingDef = {
  id: string;
  /** CE.SDK effect type. */
  type: 'vignette' | 'glow';
  label: string;
  /** Property path suffixes with their ranges, in display order. */
  controls: { key: string; label: string; min: number; max: number; centered: boolean }[];
};

export const FINISHING_EFFECTS: FinishingDef[] = [
  {
    id: 'vignette',
    type: 'vignette',
    label: 'Vignette',
    controls: [
      { key: 'darkness', label: 'Amount', min: 0, max: 1, centered: false },
      { key: 'offset', label: 'Feather', min: 0, max: 2, centered: false },
    ],
  },
  {
    id: 'glow',
    type: 'glow',
    label: 'Bloom',
    controls: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, centered: false },
      { key: 'size', label: 'Size', min: 0, max: 1, centered: false },
      { key: 'darkness', label: 'Falloff', min: 0, max: 1, centered: false },
    ],
  },
];

export const effectProperty = (type: string, key: string): string => `effect/${type}/${key}`;

const longhand = (type: string): string => `//ly.img.ubq/effect/${type}`;

/** Existing effect of this type on the block, or null. */
export const findEffect = (
  engine: CreativeEngine,
  blockId: number,
  type: string,
): number | null => {
  if (!engine.block.supportsEffects(blockId)) return null;
  return engine.block.getEffects(blockId).find((id) => engine.block.getType(id) === longhand(type)) ?? null;
};

/**
 * Returns the effect of this type, creating it if absent. New effects start
 * disabled — appending an enabled vignette would visibly change the photo the
 * moment the panel opens, which is not what opening a panel should do.
 */
export const ensureEffect = (
  engine: CreativeEngine,
  blockId: number,
  type: FinishingDef['type'],
): number | null => {
  if (!engine.block.supportsEffects(blockId)) return null;

  const existing = findEffect(engine, blockId, type);
  if (existing != null) return existing;

  const effect = engine.block.createEffect(type);
  engine.block.appendEffect(blockId, effect);
  engine.block.setEffectEnabled(effect, false);
  return effect;
};

export const isEffectOn = (engine: CreativeEngine, effectId: number): boolean => {
  try {
    return engine.block.isEffectEnabled(effectId);
  } catch {
    return false;
  }
};

export const setEffectOn = (engine: CreativeEngine, effectId: number, on: boolean): void => {
  try {
    engine.block.setEffectEnabled(effectId, on);
  } catch {
    /* effect removed underneath us */
  }
};
