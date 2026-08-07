import { createNeutralEdit, type EditState } from './adjustments';

/**
 * Named looks. Each is a partial edit merged onto neutral, so applying one
 * replaces the grade rather than stacking onto whatever was already dialled in.
 *
 * Tuned for the low-light road and landscape work in these portfolios: warm
 * sunsets, deep shadows, and a lot of sky gradient that shows banding if
 * contrast is pushed carelessly.
 */
export type Look = {
  id: string;
  /** Two or three characters — the strip shows these, not full names. */
  code: string;
  name: string;
  edit: Partial<EditState>;
};

export const LOOKS: Look[] = [
  {
    id: 'a1',
    code: 'A1',
    name: 'Neutral+',
    edit: { contrast: 0.14, clarity: 0.12, saturation: 0.06, sharpness: 0.18 },
  },
  {
    id: 'f2',
    code: 'F2',
    name: 'Faded',
    edit: { fade: 0.34, contrast: -0.12, saturation: -0.1, blacks: 0.16, grain: 0.18 },
  },
  {
    id: 'k3',
    code: 'K3',
    name: 'Kodak',
    edit: {
      temperature: 0.2,
      contrast: 0.16,
      highlights: -0.18,
      shadows: 0.12,
      saturation: 0.1,
      grain: 0.22,
      halation: 0.28,
      splitHighlight: { r: 0.05, g: 0.02, b: -0.02 },
      splitShadow: { r: -0.02, g: 0.0, b: 0.04 },
    },
  },
  {
    id: 'p4',
    code: 'P4',
    name: 'Portra',
    edit: {
      temperature: 0.12,
      contrast: 0.06,
      highlights: -0.24,
      shadows: 0.2,
      saturation: -0.06,
      fade: 0.14,
      grain: 0.16,
      halation: 0.16,
      splitHighlight: { r: 0.04, g: 0.02, b: 0.0 },
    },
  },
  {
    id: 'c5',
    code: 'C5',
    name: 'Cold',
    edit: {
      temperature: -0.26,
      contrast: 0.18,
      saturation: -0.14,
      blacks: -0.1,
      clarity: 0.14,
      splitShadow: { r: -0.03, g: 0.0, b: 0.06 },
    },
  },
  {
    id: 'n6',
    code: 'N6',
    name: 'Night',
    edit: {
      exposure: 0.12,
      shadows: 0.3,
      highlights: -0.3,
      blacks: -0.14,
      denoise: 0.35,
      grain: 0.12,
      saturation: -0.08,
    },
  },
  {
    id: 'm7',
    code: 'M7',
    name: 'Mono',
    edit: { saturation: -1, contrast: 0.24, clarity: 0.18, sharpness: 0.22, grain: 0.24 },
  },
  {
    id: 'm8',
    code: 'M8',
    name: 'Mono Fade',
    edit: { saturation: -1, contrast: -0.05, fade: 0.3, blacks: 0.2, grain: 0.3 },
  },
];

/** Merges a look onto neutral and returns a fresh, complete edit. */
export const applyLook = (look: Look): EditState => ({
  ...createNeutralEdit(),
  ...look.edit,
  splitShadow: { ...createNeutralEdit().splitShadow, ...look.edit.splitShadow },
  splitHighlight: { ...createNeutralEdit().splitHighlight, ...look.edit.splitHighlight },
});

/**
 * Scales a look's strength toward neutral, so the intensity slider under the
 * strip behaves the way a film-sim strength control does.
 */
export const applyLookAtStrength = (look: Look, strength: number): EditState => {
  const full = applyLook(look);
  const neutral = createNeutralEdit();
  const out = createNeutralEdit();

  for (const key of Object.keys(neutral) as (keyof EditState)[]) {
    const fullValue = full[key];
    if (typeof fullValue === 'number') {
      (out[key] as number) = fullValue * strength;
    } else {
      const tint = fullValue as { r: number; g: number; b: number };
      (out[key] as { r: number; g: number; b: number }) = {
        r: tint.r * strength,
        g: tint.g * strength,
        b: tint.b * strength,
      };
    }
  }
  return out;
};
