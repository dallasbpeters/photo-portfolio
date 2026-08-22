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

/**
 * A kit document, forced into shape.
 *
 * Here rather than in the endpoint because both sides need the same answer, for
 * the reason stated at the top of this file: a limit only the server knows about
 * is a limit the person hits by surprise. The panel runs this to show what will
 * be stored; the endpoint runs it because a client is not to be trusted about
 * length, count or notation.
 *
 * Everything is clamped rather than rejected. A kit is a governing document
 * someone is part-way through writing, and refusing the whole save because the
 * twenty-fifth colour is one too many loses the other twenty-four. What cannot
 * be salvaged is dropped: a colour that is not a six-digit hex has no meaning to
 * clamp toward.
 *
 * Image URLs are *not* validated here. They have to be ours — copied into blob
 * storage before the version is written, as patch 031 says — and only the server
 * can know that, so it is the server's job.
 */
const clampText = (value: unknown, max: number): string =>
  typeof value === "string"
    ? value.replace(/\0/g, "").trim().slice(0, max)
    : "";

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const clampWeights = (value: unknown): number[] =>
  asArray(value)
    .map((w) => Number(w))
    .filter((w) => Number.isFinite(w) && w >= 1 && w <= 1000)
    .slice(0, 12);

export const sanitizeKitDoc = (input: unknown): BrandKitDoc => {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    logos: asArray(raw.logos)
      .map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          /* A fraction of the logo's own width, so it means the same at any
             size. Bounded at 4 because eight logo-widths of air is not clear
             space, it is a mistake. */
          clearSpace: Math.min(Math.max(Number(e.clearSpace) || 0, 0), 4),
          label: clampText(e.label, MAX_KIT_NAME),
          minWidth: Math.min(Math.max(Number(e.minWidth) || 0, 0), 4096),
          rules: clampText(e.rules, MAX_RULE_TEXT),
          url: typeof e.url === "string" ? e.url : "",
        };
      })
      .filter((entry) => entry.url !== "")
      .slice(0, MAX_LOGOS),
    offBrand: asArray(raw.offBrand)
      .filter((url): url is string => typeof url === "string" && url !== "")
      .slice(0, MAX_OFFBRAND),
    onBrand: asArray(raw.onBrand)
      .filter((url): url is string => typeof url === "string" && url !== "")
      .slice(0, MAX_ONBRAND),
    palette: asArray(raw.palette)
      .map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          name: clampText(e.name, MAX_KIT_NAME),
          role: clampText(e.role, MAX_KIT_NAME),
          value:
            typeof e.value === "string" ? e.value.trim().toLowerCase() : "",
        };
      })
      .filter((entry) => isHexColour(entry.value))
      .slice(0, MAX_PALETTE),
    typefaces: asArray(raw.typefaces)
      .map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          name: clampText(e.name, MAX_KIT_NAME),
          role: clampText(e.role, MAX_KIT_NAME),
          weights: clampWeights(e.weights),
        };
      })
      .filter((entry) => entry.name !== "")
      .slice(0, MAX_TYPEFACES),
    voice: clampText(raw.voice, MAX_VOICE),
  };
};
