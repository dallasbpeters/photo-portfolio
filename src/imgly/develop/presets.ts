import type { AdjustmentSnapshot } from './adjustments';

/**
 * Named looks, saved locally so a photographer can carry one grade across a set
 * without re-dialling every slider.
 *
 * Stored per site key: the two portfolios have different looks and share a
 * browser only in development.
 */
export type DevelopPreset = {
  name: string;
  adjustments: AdjustmentSnapshot;
};

const storageKey = (siteKey: string): string => `${siteKey}_develop_presets`;

/** Looks shipped with the editor. Users can add their own on top. */
export const BUILT_IN_PRESETS: DevelopPreset[] = [
  {
    name: 'Punch',
    adjustments: { contrast: 0.28, clarity: 0.22, saturation: 0.14, blacks: -0.12, sharpness: 0.2 },
  },
  {
    name: 'Soft Matte',
    adjustments: { contrast: -0.18, blacks: 0.22, highlights: -0.14, saturation: -0.08, clarity: -0.1 },
  },
  {
    name: 'Warm Film',
    adjustments: { temperature: 0.22, contrast: 0.12, highlights: -0.2, shadows: 0.14, saturation: 0.06 },
  },
  {
    name: 'Cold Steel',
    adjustments: { temperature: -0.26, contrast: 0.18, saturation: -0.16, blacks: -0.1, clarity: 0.12 },
  },
  {
    name: 'Mono',
    adjustments: { saturation: -1, contrast: 0.24, clarity: 0.18, sharpness: 0.22 },
  },
];

export const loadUserPresets = (siteKey: string): DevelopPreset[] => {
  try {
    const raw = localStorage.getItem(storageKey(siteKey));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Hand-editable storage: keep only entries that still have the right shape.
    return parsed.filter(
      (p): p is DevelopPreset =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as DevelopPreset).name === 'string' &&
        typeof (p as DevelopPreset).adjustments === 'object',
    );
  } catch {
    return [];
  }
};

export const saveUserPreset = (siteKey: string, preset: DevelopPreset): DevelopPreset[] => {
  const existing = loadUserPresets(siteKey).filter((p) => p.name !== preset.name);
  const next = [...existing, preset];
  try {
    localStorage.setItem(storageKey(siteKey), JSON.stringify(next));
  } catch {
    /* storage unavailable — the preset still applies for this session */
  }
  return next;
};

export const deleteUserPreset = (siteKey: string, name: string): DevelopPreset[] => {
  const next = loadUserPresets(siteKey).filter((p) => p.name !== name);
  try {
    localStorage.setItem(storageKey(siteKey), JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
};
