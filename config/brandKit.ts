/**
 * What a brand kit holds, and how much of it.
 *
 * Shared by the endpoint that enforces these and the panel that has to say so
 * before anything is saved — the reasoning config/elements.ts states outright: a
 * limit only the server knows about is a limit the person hits by surprise.
 *
 * A kit is a governing document, not a moodboard. The bounds below are chosen so
 * that every part of it can be shown at once and checked against in one pass; a
 * "palette" of eighty colours constrains nothing, and eighty on-brand references
 * are a board that has been filed in the wrong place.
 *
 * Dependency-free and free of browser and Node globals, like every module here.
 */

/** Six-digit hex, the one colour notation this app writes and reads. */
export const HEX = /^#[0-9a-f]{6}$/i;

export const MAX_PALETTE = 24;
export const MAX_TYPEFACES = 8;
export const MAX_LOGOS = 8;

/** The same handful an element allows, and for the same reason. */
export const MAX_ONBRAND = 24;
export const MAX_OFFBRAND = 24;

export const MAX_KIT_NAME = 120;

/**
 * Matching MAX_ELEMENT_DESCRIPTION, and for the same reason: voice travels into
 * the prompt, so it is the kit's substance rather than a note about it.
 */
export const MAX_VOICE = 2000;

export const MAX_RULE_TEXT = 300;

export interface PaletteEntry {
  name: string;
  /** What it is for — "text", "surface", "accent". Free text, not an enum. */
  role: string;
  /** Lower-cased six-digit hex. Anything else is dropped, never stored. */
  value: string;
}

export interface TypefaceEntry {
  name: string;
  role: string;
  weights: number[];
}

export interface LogoEntry {
  /** Minimum clear space as a fraction of the logo's own width. */
  clearSpace: number;
  label: string;
  /** Below this width the mark stops being legible. In pixels. */
  minWidth: number;
  rules: string;
  /** Ours, adopted into blob storage before the version was written. */
  url: string;
}

export interface BrandKitDoc {
  logos: LogoEntry[];
  /** Images that are explicitly off-brand — counter-examples, and the more
   * useful half. A model told what to avoid outperforms one told only what to
   * aim at, and a set of counter-examples is far more precise than a paragraph. */
  offBrand: string[];
  /** Images that are on-brand — what a generation should read like. */
  onBrand: string[];
  palette: PaletteEntry[];
  typefaces: TypefaceEntry[];
  voice: string;
}

export const EMPTY_KIT: BrandKitDoc = {
  logos: [],
  offBrand: [],
  onBrand: [],
  palette: [],
  typefaces: [],
  voice: "",
};

export const isHexColour = (value: unknown): value is string =>
  typeof value === "string" && HEX.test(value.trim());

/**
 * A kit's palette, description and counter-examples, as prompt material.
 *
 * Written here rather than in the run path so the panel can show exactly what a
 * wired kit will contribute — a brand kit that silently shapes a generation in
 * ways nobody can read is the "guidelines nobody applies" problem in a new
 * costume.
 */
export const kitPromptText = (doc: BrandKitDoc): string => {
  const parts: string[] = [];
  if (doc.palette.length > 0) {
    parts.push(
      `using only these colors: ${doc.palette.map((entry) => entry.value).join(", ")}`
    );
  }
  if (doc.voice.trim()) {
    parts.push(doc.voice.trim());
  }
  return parts.join(", ");
};
